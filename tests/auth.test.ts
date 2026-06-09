import { describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import {
  createVerifier,
  extractBearerToken,
  extractVerifiedEmail,
  isJwtFormat,
  jwksUrl,
  readOAuthConfig,
  type OAuthConfig,
} from '../src/auth.js';

const CONFIG: OAuthConfig = {
  issuer: 'https://dev-tenant.us.auth0.com/',
  audience: 'https://mcp.mymeet.ai/mcp',
  emailClaim: 'https://mymeet.ai/email',
  emailVerifiedClaim: 'https://mymeet.ai/email_verified',
};

describe('readOAuthConfig', () => {
  it('returns null when issuer or audience is missing (api-key-only mode)', () => {
    expect(readOAuthConfig({})).toBeNull();
    expect(readOAuthConfig({ MYMEET_OAUTH_ISSUER: 'x' })).toBeNull();
    expect(readOAuthConfig({ MYMEET_OAUTH_AUDIENCE: 'y' })).toBeNull();
  });

  it('builds namespaced claim names when configured', () => {
    const cfg = readOAuthConfig({
      MYMEET_OAUTH_ISSUER: 'https://dev-tenant.us.auth0.com/',
      MYMEET_OAUTH_AUDIENCE: 'https://mcp.mymeet.ai/mcp',
    });
    expect(cfg).toEqual(CONFIG);
  });
});

describe('isJwtFormat', () => {
  it('accepts three non-empty base64url segments', () => {
    expect(isJwtFormat('aaa.bbb.ccc')).toBe(true);
  });

  it('rejects api-key-shaped strings', () => {
    expect(isJwtFormat('mm_live_8f3a9c2b7d')).toBe(false); // no dots
    expect(isJwtFormat('a.b')).toBe(false); // two segments
    expect(isJwtFormat('a..c')).toBe(false); // empty segment
    expect(isJwtFormat('a.b.c.d')).toBe(false); // four segments
  });
});

describe('extractBearerToken', () => {
  it('strips the canonical `Bearer ` prefix', () => {
    expect(extractBearerToken('Bearer mm_abc123')).toBe('mm_abc123');
  });

  it('accepts a bare token without the `Bearer ` prefix', () => {
    // Clients (and users editing configs by hand) often drop the prefix —
    // this is the whole point of the fix, so it must read as a credential.
    expect(extractBearerToken('mm_abc123')).toBe('mm_abc123');
  });

  it('returns a JWT unchanged so the OAuth path still routes (with or without prefix)', () => {
    expect(extractBearerToken('Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
    expect(extractBearerToken('aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
  });

  it('matches the scheme case-insensitively and tolerates surrounding whitespace', () => {
    expect(extractBearerToken('bearer mm_abc123')).toBe('mm_abc123');
    expect(extractBearerToken('  Bearer   mm_abc123  ')).toBe('mm_abc123');
  });

  it('returns undefined when there is no usable token', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken('')).toBeUndefined();
    expect(extractBearerToken('   ')).toBeUndefined();
    expect(extractBearerToken('Bearer ')).toBeUndefined();
    expect(extractBearerToken('Bearer    ')).toBeUndefined();
  });
});

describe('jwksUrl', () => {
  it('appends the well-known path regardless of trailing slash', () => {
    expect(jwksUrl('https://dev-tenant.us.auth0.com/').toString()).toBe(
      'https://dev-tenant.us.auth0.com/.well-known/jwks.json',
    );
    expect(jwksUrl('https://dev-tenant.us.auth0.com').toString()).toBe(
      'https://dev-tenant.us.auth0.com/.well-known/jwks.json',
    );
  });
});

describe('extractVerifiedEmail', () => {
  it('returns the email when verified', () => {
    const payload = {
      'https://mymeet.ai/email': 'user@mymeet.ai',
      'https://mymeet.ai/email_verified': true,
    };
    expect(extractVerifiedEmail(payload, CONFIG)).toBe('user@mymeet.ai');
  });

  it('throws when email_verified is not strictly true', () => {
    expect(() =>
      extractVerifiedEmail(
        { 'https://mymeet.ai/email': 'user@mymeet.ai', 'https://mymeet.ai/email_verified': false },
        CONFIG,
      ),
    ).toThrow(/not verified/);
    expect(() =>
      extractVerifiedEmail({ 'https://mymeet.ai/email': 'user@mymeet.ai' }, CONFIG),
    ).toThrow(/not verified/);
    // A string "true" must not be accepted — only the boolean.
    expect(() =>
      extractVerifiedEmail(
        { 'https://mymeet.ai/email': 'user@mymeet.ai', 'https://mymeet.ai/email_verified': 'true' },
        CONFIG,
      ),
    ).toThrow(/not verified/);
  });

  it('throws when the email claim is missing or malformed', () => {
    expect(() => extractVerifiedEmail({ 'https://mymeet.ai/email_verified': true }, CONFIG)).toThrow(
      /usable email/,
    );
    expect(() =>
      extractVerifiedEmail(
        { 'https://mymeet.ai/email': 'not-an-email', 'https://mymeet.ai/email_verified': true },
        CONFIG,
      ),
    ).toThrow(/usable email/);
  });
});

describe('createVerifier (full verify path)', () => {
  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const verify = createVerifier(async () => publicKey, CONFIG);
    return { privateKey, verify, publicKey };
  }

  function buildJwt(privateKey: CryptoKey, overrides: Record<string, unknown> = {}) {
    return new SignJWT({
      'https://mymeet.ai/email': 'user@mymeet.ai',
      'https://mymeet.ai/email_verified': true,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(CONFIG.issuer)
      .setAudience(CONFIG.audience)
      .setIssuedAt()
      .setExpirationTime('1h');
  }

  it('accepts a correctly signed token and returns claims', async () => {
    const { privateKey, verify } = await setup();
    const token = await buildJwt(privateKey).sign(privateKey);

    const payload = await verify(token);

    expect(extractVerifiedEmail(payload, CONFIG)).toBe('user@mymeet.ai');
  });

  it('rejects a token minted for a different audience', async () => {
    const { privateKey, verify } = await setup();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(CONFIG.issuer)
      .setAudience('https://evil.example/mcp')
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects a token from a different issuer', async () => {
    const { privateKey, verify } = await setup();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://attacker.us.auth0.com/')
      .setAudience(CONFIG.audience)
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { privateKey, verify } = await setup();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(CONFIG.issuer)
      .setAudience(CONFIG.audience)
      .setExpirationTime('-1h')
      .sign(privateKey);

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects a token signed by a different key (forgery)', async () => {
    const { verify } = await setup();
    const { privateKey: attackerKey } = await generateKeyPair('RS256');
    const token = await buildJwt(attackerKey).sign(attackerKey);

    await expect(verify(token)).rejects.toThrow();
  });
});

/**
 * OAuth 2.0 access-token verification for the remote (HTTP) transport.
 *
 * The MCP server acts as an OAuth Resource Server: it accepts JWT access tokens
 * minted by an external Authorization Server (Auth0), verifies them against the
 * AS's published JWKS, and extracts the *verified* email used to map the caller
 * to a MyMeet user.
 *
 * OAuth is OFF unless both MYMEET_OAUTH_ISSUER and MYMEET_OAUTH_AUDIENCE are set,
 * so the existing api-key flow keeps working untouched when this is unconfigured.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/** Claims are namespaced (Auth0 drops non-namespaced custom claims). Must match the Auth0 Action. */
const EMAIL_NAMESPACE = 'https://mymeet.ai';

export type OAuthConfig = {
  /** Token issuer, e.g. `https://dev-xxx.us.auth0.com/` (trailing slash, matches the `iss` claim). */
  issuer: string;
  /** Expected audience — our MCP URL, e.g. `https://mcp.mymeet.ai/mcp`. */
  audience: string;
  emailClaim: string;
  emailVerifiedClaim: string;
};

/** Reads OAuth config from the environment, or null when not configured (api-key-only mode). */
export function readOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig | null {
  const issuer = env.MYMEET_OAUTH_ISSUER?.trim();
  const audience = env.MYMEET_OAUTH_AUDIENCE?.trim();
  if (!issuer || !audience) return null;
  return {
    issuer,
    audience,
    emailClaim: `${EMAIL_NAMESPACE}/email`,
    emailVerifiedClaim: `${EMAIL_NAMESPACE}/email_verified`,
  };
}

/**
 * Pulls the credential token out of an `Authorization` header value.
 *
 * Accepts both the canonical `Bearer <token>` form and a bare token: some MCP
 * clients — and users pasting the snippet by hand — drop the `Bearer ` prefix,
 * and we don't want that to read as "no credential". The scheme is matched
 * case-insensitively (RFC 7235). Returns undefined when nothing usable is left,
 * which the caller turns into a 401. Routing between OAuth and api-key happens
 * downstream via {@link isJwtFormat}, so dropping the prefix never weakens the
 * JWT signature check.
 */
export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const token = authHeader.replace(/^\s*Bearer\s+/i, '').trim();
  return token.length > 0 ? token : undefined;
}

/**
 * A bearer value looks like a JWT when it has three non-empty base64url segments.
 * Used only to route between the OAuth path and the legacy api-key path — the
 * actual trust decision is the signature check in {@link verifyAccessToken}.
 */
export function isJwtFormat(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

/** Auth0 publishes its keys at `<issuer>.well-known/jwks.json`. */
export function jwksUrl(issuer: string): URL {
  const base = issuer.endsWith('/') ? issuer : `${issuer}/`;
  return new URL('.well-known/jwks.json', base);
}

/**
 * Builds a verifier bound to a key source. Production passes a remote JWKS;
 * tests pass a local key so the full verify path (signature, iss, aud, exp) is
 * exercised without network access. RS256 only — never accept `alg: none`/HS*.
 */
export function createVerifier(keySource: JWTVerifyGetKey, config: OAuthConfig) {
  return async (token: string): Promise<JWTPayload> => {
    const { payload } = await jwtVerify(token, keySource, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
    });
    return payload;
  };
}

/** Production verifier: fetches and caches Auth0's JWKS. */
export function createRemoteVerifier(config: OAuthConfig) {
  const jwks = createRemoteJWKSet(jwksUrl(config.issuer));
  return createVerifier(jwks, config);
}

/**
 * Extracts the email from a verified token, refusing anything we can't trust.
 * The account mapping on the backend must only ever run for a verified email —
 * proof of inbox ownership is what ties the OAuth identity to a MyMeet account.
 */
export function extractVerifiedEmail(payload: JWTPayload, config: OAuthConfig): string {
  if (payload[config.emailVerifiedClaim] !== true) {
    throw new Error('Email is not verified — refusing to map to a MyMeet account');
  }
  const email = payload[config.emailClaim];
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Token does not carry a usable email claim');
  }
  return email.trim();
}

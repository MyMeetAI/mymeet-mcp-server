import { describe, expect, it, vi, afterEach } from 'vitest';
import { MyMeetApiClient } from '../src/client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MyMeetApiClient.listMeetings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('converts the public one-based first page to backend page zero and defaults scope to mine', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ meetings: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('test-api-key', 'https://backend.example');
    await client.listMeetings();

    const [calledUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(calledUrl as string);
    expect(url.pathname).toBe('/api/workspaces/active/user-meetings');
    expect(url.searchParams.get('page')).toBe('0');
    expect(url.searchParams.get('perPage')).toBe('20');
    // key travels in the X-API-KEY header, never in the URL
    expect(url.searchParams.has('api_key')).toBe(false);
    expect((init?.headers as Record<string, string>)['X-API-KEY']).toBe('test-api-key');
  });

  it('passes explicit workspace scope and converts later pages to backend zero-based pages', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ meetings: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('test-api-key', 'https://backend.example');
    await client.listMeetings(2, 50, 'workspace');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/workspaces/active/all-meetings');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('perPage')).toBe('50');
  });

  it('sends the service secret and verified email for an OAuth credential', async () => {
    vi.stubEnv('MYMEET_SERVICE_SECRET', 'svc-secret');
    const fetchMock = vi.fn(async () => jsonResponse({ meetings: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient(
      { kind: 'oauth', email: 'user@mymeet.ai' },
      'https://backend.example',
    );
    await client.listMeetings();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Service-Secret']).toBe('svc-secret');
    expect(headers['X-User-Email']).toBe('user@mymeet.ai');
    expect(headers['X-API-KEY']).toBeUndefined();
  });

  it('rejects an OAuth credential when MYMEET_SERVICE_SECRET is missing (fail closed)', () => {
    vi.stubEnv('MYMEET_SERVICE_SECRET', '');
    expect(() => new MyMeetApiClient({ kind: 'oauth', email: 'user@mymeet.ai' })).toThrow(
      /MYMEET_SERVICE_SECRET/,
    );
  });
});

describe('MyMeetApiClient.request — non-JSON responses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns a plain-text status body as-is instead of throwing a JSON parse error', async () => {
    // Regression: /api/meeting/status returns the bare status string ("processed"),
    // and JSON.parse("processed") used to throw `Unexpected token 'p'`.
    const fetchMock = vi.fn(async () => new Response('processed', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('test-api-key', 'https://backend.example');
    await expect(client.getMeetingStatus('abc-123')).resolves.toBe('processed');
  });

  it('returns a plain-text "OK" body (rename/delete) without throwing', async () => {
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('test-api-key', 'https://backend.example');
    await expect(client.renameMeeting('abc-123', 'New name')).resolves.toBe('OK');
  });

  it('still parses JSON bodies as objects', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ meetings: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('test-api-key', 'https://backend.example');
    await expect(client.listMeetings()).resolves.toEqual({ meetings: [], total: 0 });
  });
});

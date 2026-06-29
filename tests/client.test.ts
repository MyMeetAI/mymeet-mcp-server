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

// Regression: these write methods sent parameter names / paths the backend does
// not accept, so they silently failed against the real API.
describe('MyMeetApiClient — request shapes match the backend contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function okText(): Response {
    return new Response('OK', { status: 200 });
  }

  function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return {
      url: new URL(url as string),
      method: (init as RequestInit).method,
      body: JSON.parse(((init as RequestInit).body as string) ?? 'null'),
    };
  }

  it('rename sends camelCase meetingId/newName', async () => {
    const fetchMock = vi.fn(async () => okText());
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('k', 'https://backend.example');
    await client.renameMeeting('m-1', 'New title');

    const { url, method, body } = lastCall(fetchMock);
    expect(method).toBe('PUT');
    expect(url.pathname).toBe('/api/meeting');
    expect(body).toEqual({ meetingId: 'm-1', newName: 'New title' });
  });

  it('regenerate sends template_name (not new_template_name)', async () => {
    const fetchMock = vi.fn(async () => okText());
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('k', 'https://backend.example');
    await client.regenerateTemplate('m-1', 'sales-meeting');

    const { url, body } = lastCall(fetchMock);
    expect(url.pathname).toBe('/api/generate-new-template');
    expect(body).toEqual({ meeting_id: 'm-1', template_name: 'sales-meeting' });
  });

  it('updateSummary sends templateId/entityName/newSummaryText to the per-meeting path', async () => {
    const fetchMock = vi.fn(async () => okText());
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('k', 'https://backend.example');
    await client.updateSummary('m-1', {
      templateId: 't-1',
      entityName: 'Action Items',
      newSummaryText: 'Updated text',
    });

    const { url, method, body } = lastCall(fetchMock);
    expect(method).toBe('PUT');
    expect(url.pathname).toBe('/api/meeting/m-1/summary');
    expect(body).toEqual({
      templateId: 't-1',
      entityName: 'Action Items',
      newSummaryText: 'Updated text',
    });
  });

  it('delete targets the DELETE /api/video/report endpoint', async () => {
    const fetchMock = vi.fn(async () => okText());
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('k', 'https://backend.example');
    await client.deleteMeeting('m-1');

    const { url, method } = lastCall(fetchMock);
    expect(method).toBe('DELETE');
    expect(url.pathname).toBe('/api/video/report');
    expect(url.searchParams.get('meeting_id')).toBe('m-1');
  });

  it('percent-encodes a path-unsafe meetingId in the summary path segment', async () => {
    // meetingId is a free-form string (z.string(), not a strict UUID), so a value
    // containing "/" must not break out of the path segment.
    const fetchMock = vi.fn(async () => okText());
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('k', 'https://backend.example');
    await client.updateSummary('a/b', {
      templateId: 't-1',
      entityName: 'Action Items',
      newSummaryText: 'Updated text',
    });

    const { url } = lastCall(fetchMock);
    expect(url.pathname).toBe('/api/meeting/a%2Fb/summary');
  });
});

describe('MyMeetApiClient — NotFoundError surfaces the real meeting id on 404', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts a snake_case meeting_id query param instead of reporting "unknown"', async () => {
    // Regression: the 404 handler regex did not match `meeting_id=` (snake_case),
    // so deleteMeeting / getMeetingStatus / getMeetingReport / downloadMeeting all
    // raised NotFoundError("unknown") on a real 404.
    const fetchMock = vi.fn(async () => new Response('Meeting not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MyMeetApiClient('k', 'https://backend.example');
    await expect(client.deleteMeeting('abc-123')).rejects.toThrow('Meeting "abc-123" not found');
  });
});

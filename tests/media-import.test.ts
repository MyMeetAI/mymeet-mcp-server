import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';

const requestId = '767d204f-6c01-4ebf-8d9f-88ded24d5ac7';
const meetingId = '9cd6d0a0-67ea-4a97-8aa2-590ad41350e6';
const youtubeUrl = 'https://www.youtube.com/watch?v=abcdefghijk';

const fetchBackend = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
let client: Client;
let server: ReturnType<typeof createServer>;

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchBackend);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'media-import-test', version: '1.0.0' });
  server = createServer('test-api-key', 'https://backend.example');
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await server.close();
  fetchBackend.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' }, ...init });
}

async function callTool(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content;
  if (!Array.isArray(content) || content[0]?.type !== 'text') {
    throw new Error('Expected a text result from the MCP tool');
  }
  return { error: result.isError === true, payload: JSON.parse(content[0].text) };
}

it('marks import as a write action and status as read-only', async () => {
  const { tools } = await client.listTools();
  expect(tools).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'mymeet_import_media', annotations: expect.objectContaining({ readOnlyHint: false }) }),
    expect.objectContaining({ name: 'mymeet_get_meeting_status', annotations: expect.objectContaining({ readOnlyHint: true }) }),
  ]));
});

describe('mymeet_import_media', () => {
  it.each([
    [youtubeUrl, 'youtube'],
    ['HTTPS://disk.yandex.ru/d/example', 'yandex_disk'],
    ['https://drive.google.com/file/d/exampleDrive123/view', 'google_drive'],
  ])('uses the shared import for %s', async (url, source) => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({ meeting_id: meetingId, source, status: 'processing' }, { status: 202 }));
    expect(await callTool('mymeet_import_media', {
      url,
      templateName: 'lecture-notes',
      speakersNumber: 2,
      requestId,
    })).toEqual({ error: false, payload: { meetingId, source, status: 'processing', requestId } });

    const [destination, request] = fetchBackend.mock.calls[0];
    expect(destination).toBe('https://backend.example/api/video/import-link');
    expect(request.method).toBe('POST');
    expect(new Headers(request.headers).get('Idempotency-Key')).toBe(requestId);
    expect(new Headers(request.headers).get('X-API-KEY')).toBe('test-api-key');
    expect(request.body).toBe(JSON.stringify({ url, template_name: 'lecture-notes', speakers_number: 2 }));
  });

  it('rejects a non-HTTPS recording link before submission', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse(
      { meeting_id: meetingId, source: 'youtube', status: 'processing' }, { status: 202 },
    ));

    const result = await client.callTool({
      name: 'mymeet_import_media',
      arguments: { url: 'http://www.youtube.com/watch?v=abcdefghijk' },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: expect.stringContaining('URL must use HTTPS') }],
    });
    expect(fetchBackend).not.toHaveBeenCalled();
  });

  it('keeps the generated request ID when retrying a gateway failure', async () => {
    vi.useFakeTimers();
    fetchBackend
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ meeting_id: meetingId, source: 'youtube', status: 'processing' }, { status: 202 }));

    const pending = callTool('mymeet_import_media', { url: youtubeUrl });
    await vi.advanceTimersByTimeAsync(1_000);
    const { error, payload } = await pending;

    expect(error).toBe(false);
    expect(payload.meetingId).toBe(meetingId);
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchBackend.mock.calls.map(([, request]) => new Headers(request.headers).get('Idempotency-Key')))
      .toEqual([payload.requestId, payload.requestId]);
  });

  it.each([
    [429, 'import_limit_reached', 'Wait for an active import to finish'],
    [503, 'provider_unavailable', 'YouTube import is not available here'],
  ])('returns admission error %s without retrying', async (status, code, message) => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({ code, message }, { status }));

    expect(await callTool('mymeet_import_media', { url: youtubeUrl, requestId })).toMatchObject({
      error: true,
      payload: { code, message, requestId },
    });
    expect(fetchBackend).toHaveBeenCalledTimes(1);
  });

  it('preserves the API workspace access error and request ID', async () => {
    const message = 'Integrations require a paid seat.';
    fetchBackend.mockResolvedValueOnce(jsonResponse({ message }, { status: 403 }));

    expect(await callTool('mymeet_import_media', { url: youtubeUrl, requestId })).toMatchObject({
      error: true,
      payload: { code: 'forbidden', message, requestId },
    });
  });

  it('explains how to retry an unconfirmed import safely', async () => {
    fetchBackend.mockRejectedValueOnce(new TypeError('fetch failed'));

    expect(await callTool('mymeet_import_media', { url: youtubeUrl, requestId })).toMatchObject({
      error: true,
      payload: {
        code: 'import_request_uncertain',
        requestId,
        suggestion: 'The import may already have started. ' +
          'Retry with the same request ID and settings in the same MyMeet workspace to avoid creating another meeting.',
      },
    });
  });
});

describe('mymeet_get_meeting_status', () => {
  it('uses the JSON status and keeps first-part readiness separate from import progress', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({
      statuses: { [meetingId]: {
        status: 'new',
        reason: null,
        media_import: { phase: 'processing', downloaded_bytes: 1024, generation: 2, attempt: 1, processing_percentage: 63 },
      } },
    }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toEqual({
      error: false,
      payload: {
        meetingId,
        status: 'new',
        ready: true,
        mediaImport: { phase: 'processing', downloadedBytes: 1024, generation: 2, attempt: 1, processingPercentage: 63 },
      },
    });
    expect(fetchBackend.mock.calls[0][0]).toBe(`https://backend.example/api/meeting/status?meeting_ids=${meetingId}`);
  });

  it('returns the import failure code and retryability', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({
      statuses: { [meetingId]: {
        status: 'failed',
        media_import: { phase: 'failed', error: { code: 'access_denied', retryable: false } },
      } },
    }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toEqual({
      error: false,
      payload: { meetingId, status: 'failed', ready: false, mediaImport: { phase: 'failed', error: { code: 'access_denied', retryable: false } } },
    });
  });

  it('preserves the import phase when processing progress is 0%', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({
      statuses: { [meetingId]: {
        status: 'processing',
        media_import: { phase: 'processing', processing_percentage: 0 },
      } },
    }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toEqual({
      error: false,
      payload: {
        meetingId,
        status: 'processing',
        ready: false,
        mediaImport: { phase: 'processing', processingPercentage: 0 },
      },
    });
  });

  it('reports a cancelled import as unavailable even if it was previously processed', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({
      statuses: { [meetingId]: { status: 'processed', media_import: { phase: 'cancelled' } } },
    }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toEqual({
      error: false,
      payload: { meetingId, status: 'processed', ready: false, mediaImport: { phase: 'cancelled' } },
    });
  });

  it.each([
    ['not_found', 'NotFoundError'],
    ['forbidden', 'ApiError'],
  ])('surfaces a per-meeting %s as a tool error', async (error, errorName) => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({ statuses: { [meetingId]: { error } } }));
    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toMatchObject({
      error: true,
      payload: { error: errorName },
    });
  });

  it('surfaces a backend error if the batch omits the requested meeting', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({ statuses: {} }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toMatchObject({
      error: true,
      payload: { error: 'ApiError', message: 'MyMeet API error 502: Incomplete meeting status response.' },
    });
  });

  it.each([
    [{ status: 42 }, { status: 'unknown', ready: false }],
    [{ status: 'processed', media_import: { processing_percentage: 42 } }, { status: 'processed', ready: true }],
  ])('flags an unreadable status response %#', async (entry, expected) => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({ statuses: { [meetingId]: entry } }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toEqual({
      error: false,
      payload: { meetingId, ...expected, parseError: true },
    });
  });

  it('preserves the ordinary meeting status and failure reason format', async () => {
    fetchBackend.mockResolvedValueOnce(jsonResponse({ statuses: { [meetingId]: { status: 'failed', reason: 'Waiting room' } } }));

    expect(await callTool('mymeet_get_meeting_status', { meetingId })).toEqual({
      error: false,
      payload: { meetingId, status: 'failed: Waiting room', ready: false },
    });
  });
});

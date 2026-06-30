import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReadyStatus } from '../src/types.js';
import { buildTranscriptText, getReportStatus } from '../src/followup.js';
import { createServer } from '../src/server.js';

// A meeting starts as `new` and flips to `processed` on the first report
// fetch/open — both mean the report is ready and the transcript is available.
// Only queued/processing/recording are genuinely not-ready; failed is an error.

describe('isReadyStatus', () => {
  it('treats new and processed as ready', () => {
    expect(isReadyStatus('new')).toBe(true);
    expect(isReadyStatus('processed')).toBe(true);
  });

  it('treats in-progress and unknown statuses as not ready', () => {
    expect(isReadyStatus('queued')).toBe(false);
    expect(isReadyStatus('processing')).toBe(false);
    expect(isReadyStatus('failed')).toBe(false);
    expect(isReadyStatus(undefined)).toBe(false);
    expect(isReadyStatus('')).toBe(false);
  });
});

describe('getReportStatus', () => {
  it('reads the status from inside the followup_v2 wrapper', () => {
    expect(getReportStatus({ followup_v2: { status: 'new' }, feedback: false })).toBe('new');
  });

  it('reads the status from a top-level (unwrapped) shape', () => {
    expect(getReportStatus({ status: 'processed' })).toBe('processed');
  });

  it('returns undefined for the plain-text "in progress" body', () => {
    expect(getReportStatus('Meeting is in progress now, status: processing')).toBeUndefined();
    expect(getReportStatus(null)).toBeUndefined();
  });
});

describe('buildTranscriptText — status is irrelevant to extraction', () => {
  it('returns the transcript for a `new` meeting exactly like a processed one', () => {
    // The user-reported case: a `new`-status meeting is ready and must yield its
    // transcript — `new` must not be mistaken for "still processing".
    const report = {
      followup_v2: {
        status: 'new',
        chapters: [
          { name: 'Intro', transcript: [{ speaker: { speaker: 'Alice' }, text: 'Hi', timestamp: '00:00' }] },
        ],
      },
      feedback: false,
      media_type: 'video',
    };
    expect(buildTranscriptText(report)).toBe('[00:00] Alice: Hi');
  });
});

function getTool(name: string) {
  const server = createServer('test-api-key') as any;
  return server._registeredTools[name];
}

describe('mymeet_get_transcript — empty transcript is status-aware', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does NOT claim "still processing" for a ready (new) meeting with no transcript text', async () => {
    // Regression: a ready-but-empty meeting (audio with no speech, locked, etc.)
    // used to be reported as "may still be processing", so the model told the
    // user to keep waiting forever.
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            followup_v2: { status: 'new', chapters: [], is_transcript_empty: true },
            feedback: false,
            media_type: 'audio',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getTool('mymeet_get_transcript').handler({ meetingId: 'm-1' }, {});
    const payload = JSON.parse(result.content[0].text);

    expect(payload.status).toBe('new');
    expect(payload.message).not.toMatch(/processing/i);
    expect(payload.suggestion).toMatch(/mymeet_get_meeting_report|do not wait/i);
  });

  it('still tells the model to poll when the meeting is genuinely processing', async () => {
    // Backend returns the 202 plain-text "in progress" body for processing/recording.
    const fetchMock = vi.fn(
      async () => new Response('Meeting is in progress now, status: processing', { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getTool('mymeet_get_transcript').handler({ meetingId: 'm-1' }, {});
    const payload = JSON.parse(result.content[0].text);

    expect(payload.message).toMatch(/processing/i);
    expect(payload.suggestion).toMatch(/mymeet_get_meeting_status/i);
  });
});

describe('mymeet_get_meeting_status — exposes a ready flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks a `new` meeting as ready so the model does not treat it as in-progress', async () => {
    const fetchMock = vi.fn(async () => new Response('new', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getTool('mymeet_get_meeting_status').handler({ meetingId: 'm-1' }, {});
    const payload = JSON.parse(result.content[0].text);

    expect(payload.status).toBe('new');
    expect(payload.ready).toBe(true);
  });

  it('marks a processing meeting as not ready', async () => {
    const fetchMock = vi.fn(async () => new Response('processing', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getTool('mymeet_get_meeting_status').handler({ meetingId: 'm-1' }, {});
    const payload = JSON.parse(result.content[0].text);

    expect(payload.ready).toBe(false);
  });
});

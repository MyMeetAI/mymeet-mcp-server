import { describe, expect, it } from 'vitest';
import { isReadyStatus } from '../src/types.js';
import { buildTranscriptText, getReportStatus } from '../src/followup.js';
import { buildTranscriptResult } from '../src/tools/get-transcript.js';
import { buildStatusPayload } from '../src/tools/get-meeting-status.js';

// A meeting starts as `new` and flips to `processed` on the first report
// fetch/open — both mean the report is ready and the transcript is available.
// Only queued/processing/recording are genuinely not-ready; failed is an error.

describe('isReadyStatus', () => {
  it('treats new and processed as ready', () => {
    expect(isReadyStatus('new')).toBe(true);
    expect(isReadyStatus('processed')).toBe(true);
  });

  it('treats in-progress, failed and unknown statuses as not ready', () => {
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

describe('buildTranscriptResult — empty transcript is status-aware', () => {
  it('returns the transcript text directly when present', () => {
    const report = {
      followup_v2: {
        status: 'new',
        chapters: [{ transcript: [{ speaker: { speaker: 'Alice' }, text: 'Hi', timestamp: '00:00' }] }],
      },
    };
    expect(buildTranscriptResult(report).content[0].text).toBe('[00:00] Alice: Hi');
  });

  it('does NOT claim "not ready / processing" for a ready (new) meeting with no transcript text', () => {
    // Regression: a ready-but-empty meeting (audio with no speech, locked, etc.)
    // used to be reported as "may still be processing", so the model told the
    // user to keep waiting forever.
    const report = {
      followup_v2: { status: 'new', chapters: [], is_transcript_empty: true },
      feedback: false,
      media_type: 'audio',
    };
    const payload = JSON.parse(buildTranscriptResult(report).content[0].text);

    expect(payload.status).toBe('new');
    expect(payload.message).toMatch(/ready but has no transcript/i);
    expect(payload.message).not.toMatch(/not ready|processing/i);
    expect(payload.suggestion).toMatch(/mymeet_get_meeting_report|do not wait/i);
  });

  it('tells the model to poll when the meeting is genuinely not ready (202 plain text)', () => {
    const payload = JSON.parse(
      buildTranscriptResult('Meeting is in progress now, status: processing').content[0].text,
    );
    expect(payload.message).toMatch(/not ready/i);
    expect(payload.status).toBe('processing');
    expect(payload.suggestion).toMatch(/mymeet_get_meeting_status/i);
  });

  it('does not mislabel a failed meeting as "processing"', () => {
    // failed is not-ready, but the neutral wording must not call it "processing".
    const report = { followup_v2: { status: 'failed', chapters: [] } };
    const payload = JSON.parse(buildTranscriptResult(report).content[0].text);

    expect(payload.status).toBe('failed');
    expect(payload.message).not.toMatch(/processing/i);
  });
});

describe('buildStatusPayload — always includes a ready flag', () => {
  it('marks new and processed as ready', () => {
    expect(buildStatusPayload('m-1', 'new')).toEqual({ meetingId: 'm-1', status: 'new', ready: true });
    expect(buildStatusPayload('m-1', 'processed')).toEqual({
      meetingId: 'm-1',
      status: 'processed',
      ready: true,
    });
  });

  it('marks processing/queued as not ready', () => {
    expect(buildStatusPayload('m-1', 'processing').ready).toBe(false);
    expect(buildStatusPayload('m-1', 'queued').ready).toBe(false);
  });

  it('includes ready and a status even for object / empty / null responses (contract)', () => {
    // Regression: a non-string (object) response used to pass through without `ready`.
    expect(buildStatusPayload('m-1', { status: 'processing' })).toEqual({
      meetingId: 'm-1',
      status: 'processing',
      ready: false,
    });
    expect(buildStatusPayload('m-1', null)).toEqual({ meetingId: 'm-1', status: 'unknown', ready: false });
    expect(buildStatusPayload('m-1', '')).toEqual({ meetingId: 'm-1', status: 'unknown', ready: false });
  });
});

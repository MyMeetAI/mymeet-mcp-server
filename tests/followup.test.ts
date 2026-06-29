import { describe, expect, it } from 'vitest';
import { buildTranscriptText, stripTranscript } from '../src/followup.js';

// Real /api/video/report shape: the payload is wrapped in `followup_v2`, with
// `feedback` and `media_type` as siblings. chapters[].transcript[] lives INSIDE
// followup_v2 — never at the top level.
const report = {
  followup_v2: {
    name: 'Braind - Bask',
    status: 'processed',
    is_transcript_empty: false,
    keywords: ['pricing'],
    chapters: [
      {
        name: 'Intro',
        transcript: [
          { speaker: { speaker: 'Alice' }, text: 'Hello everyone', timestamp: '00:00' },
          { speaker: { speaker: 'Bob' }, text: 'Hi Alice', timestamp: '00:05' },
        ],
      },
      {
        name: 'Pricing',
        transcript: [
          { speaker: { speaker: 'Alice' }, text: 'Let us discuss pricing', timestamp: '01:10' },
        ],
      },
    ],
    templates: [{ name: 'default-meeting', entities: [] }],
  },
  feedback: false,
  media_type: 'video',
};

describe('buildTranscriptText', () => {
  it('flattens followup_v2.chapters[].transcript into speaker-labelled, timestamped lines', () => {
    // Regression: previously read report.chapters (top-level) which never exists
    // on the real response — chapters are nested under followup_v2 — so a processed
    // meeting with is_transcript_empty:false returned nothing.
    expect(buildTranscriptText(report)).toBe(
      '[00:00] Alice: Hello everyone\n' +
        '[00:05] Bob: Hi Alice\n' +
        '[01:10] Alice: Let us discuss pricing',
    );
  });

  it('also reads chapters from a top-level (unwrapped) shape', () => {
    const r = { chapters: report.followup_v2.chapters };
    expect(buildTranscriptText(r)).toBe(
      '[00:00] Alice: Hello everyone\n' +
        '[00:05] Bob: Hi Alice\n' +
        '[01:10] Alice: Let us discuss pricing',
    );
  });

  it('returns an empty string when there is genuinely no transcript content', () => {
    expect(buildTranscriptText({ followup_v2: { chapters: [] } })).toBe('');
    expect(buildTranscriptText({ followup_v2: { chapters: [{ name: 'Empty', transcript: [] }] } })).toBe('');
    expect(buildTranscriptText({})).toBe('');
    expect(buildTranscriptText(null)).toBe('');
  });

  it('falls back to "Unknown" when the speaker name is missing', () => {
    const r = { followup_v2: { chapters: [{ transcript: [{ text: 'Anonymous line', timestamp: '00:01' }] }] } };
    expect(buildTranscriptText(r)).toBe('[00:01] Unknown: Anonymous line');
  });

  it('omits the timestamp prefix when no timestamp is present', () => {
    const r = { followup_v2: { chapters: [{ transcript: [{ speaker: { speaker: 'Alice' }, text: 'No ts' }] }] } };
    expect(buildTranscriptText(r)).toBe('Alice: No ts');
  });
});

describe('stripTranscript', () => {
  it('removes followup_v2.chapters[].transcript but keeps chapter names and the wrapper', () => {
    const stripped = stripTranscript(report) as {
      followup_v2: {
        name: string;
        chapters: Array<Record<string, unknown>>;
        templates: unknown;
      };
      feedback: boolean;
      media_type: string;
    };

    expect(stripped.followup_v2.chapters).toEqual([{ name: 'Intro' }, { name: 'Pricing' }]);
    expect(stripped.followup_v2.name).toBe('Braind - Bask');
    expect(stripped.followup_v2.templates).toEqual(report.followup_v2.templates);
    // The wrapper (feedback / media_type) must survive intact.
    expect(stripped.feedback).toBe(false);
    expect(stripped.media_type).toBe('video');
  });

  it('strips transcript from a top-level (unwrapped) shape too', () => {
    const r = { name: 'x', chapters: [{ name: 'Intro', transcript: [{ text: 'hi' }] }] };
    expect(stripTranscript(r)).toEqual({ name: 'x', chapters: [{ name: 'Intro' }] });
  });

  it('does not mutate the original report', () => {
    stripTranscript(report);
    expect(report.followup_v2.chapters[0].transcript).toHaveLength(2);
  });

  it('returns the input unchanged when there are no chapters', () => {
    expect(stripTranscript({ name: 'x' })).toEqual({ name: 'x' });
    expect(stripTranscript({ followup_v2: { name: 'x' } })).toEqual({ followup_v2: { name: 'x' } });
    expect(stripTranscript(null)).toBeNull();
  });
});

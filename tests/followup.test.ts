import { describe, expect, it } from 'vitest';
import { buildTranscriptText, stripTranscript } from '../src/followup.js';

// Mirrors the real /api/video/report (followup_v2) shape: the transcript is NOT
// a top-level field — it lives inside chapters[].transcript[].
const report = {
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
};

describe('buildTranscriptText', () => {
  it('flattens chapters[].transcript into speaker-labelled, timestamped lines', () => {
    // Regression: previously read report.transcript (top-level) which never exists,
    // so a processed meeting with is_transcript_empty:false returned nothing.
    expect(buildTranscriptText(report)).toBe(
      '[00:00] Alice: Hello everyone\n' +
        '[00:05] Bob: Hi Alice\n' +
        '[01:10] Alice: Let us discuss pricing',
    );
  });

  it('returns an empty string when there is genuinely no transcript content', () => {
    expect(buildTranscriptText({ chapters: [] })).toBe('');
    expect(buildTranscriptText({ chapters: [{ name: 'Empty', transcript: [] }] })).toBe('');
    expect(buildTranscriptText({})).toBe('');
    expect(buildTranscriptText(null)).toBe('');
  });

  it('falls back to "Unknown" when the speaker name is missing', () => {
    const r = { chapters: [{ transcript: [{ text: 'Anonymous line', timestamp: '00:01' }] }] };
    expect(buildTranscriptText(r)).toBe('[00:01] Unknown: Anonymous line');
  });

  it('omits the timestamp prefix when no timestamp is present', () => {
    const r = { chapters: [{ transcript: [{ speaker: { speaker: 'Alice' }, text: 'No ts' }] }] };
    expect(buildTranscriptText(r)).toBe('Alice: No ts');
  });
});

describe('stripTranscript', () => {
  it('removes chapters[].transcript but keeps chapter names and the rest of the report', () => {
    const stripped = stripTranscript(report) as {
      name: string;
      chapters: Array<Record<string, unknown>>;
      templates: unknown;
    };

    expect(stripped.chapters).toEqual([{ name: 'Intro' }, { name: 'Pricing' }]);
    expect(stripped.name).toBe('Braind - Bask');
    expect(stripped.templates).toEqual(report.templates);
  });

  it('does not mutate the original report', () => {
    stripTranscript(report);
    expect(report.chapters[0].transcript).toHaveLength(2);
  });

  it('returns the input unchanged when there are no chapters', () => {
    expect(stripTranscript({ name: 'x' })).toEqual({ name: 'x' });
    expect(stripTranscript(null)).toBeNull();
  });
});

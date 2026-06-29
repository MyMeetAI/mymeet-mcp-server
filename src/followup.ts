interface TranscriptEntry {
  speaker?: { speaker?: string } | null;
  text?: string;
  timestamp?: string;
}

interface Chapter {
  name?: string;
  transcript?: TranscriptEntry[];
}

// /api/video/report wraps the payload: { followup_v2: {...}, feedback, media_type }.
// chapters / speakers / templates live inside followup_v2, not at the top level.
// Fall back to the report itself so an already-unwrapped object still works.
function getReportBody(report: unknown): Record<string, unknown> | null {
  if (!report || typeof report !== 'object') return null;
  const r = report as Record<string, unknown>;
  return (
    r.followup_v2 && typeof r.followup_v2 === 'object' ? r.followup_v2 : r
  ) as Record<string, unknown>;
}

function getChapters(report: unknown): Chapter[] {
  const chapters = getReportBody(report)?.chapters;
  return Array.isArray(chapters) ? (chapters as Chapter[]) : [];
}

export function buildTranscriptText(report: unknown): string {
  const lines: string[] = [];

  for (const chapter of getChapters(report)) {
    const entries = Array.isArray(chapter?.transcript) ? chapter.transcript : [];
    for (const entry of entries) {
      const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
      if (!text) continue;
      const speaker = entry.speaker?.speaker?.trim() || 'Unknown';
      const ts = entry.timestamp ? `[${entry.timestamp}] ` : '';
      lines.push(`${ts}${speaker}: ${text}`);
    }
  }

  return lines.join('\n');
}

export function stripTranscript(report: unknown): unknown {
  if (!report || typeof report !== 'object') return report;

  const body = getReportBody(report);
  if (!body || !Array.isArray(body.chapters)) return report;

  const chapters = body.chapters.map((chapter) => {
    if (!chapter || typeof chapter !== 'object') return chapter;
    const { transcript: _transcript, ...rest } = chapter as Record<string, unknown>;
    return rest;
  });

  const record = report as Record<string, unknown>;
  // Preserve the wrapper: when chapters live under followup_v2, replace them
  // there and keep feedback / media_type siblings intact.
  if (record.followup_v2 && typeof record.followup_v2 === 'object') {
    return {
      ...record,
      followup_v2: { ...(record.followup_v2 as Record<string, unknown>), chapters },
    };
  }
  return { ...record, chapters };
}

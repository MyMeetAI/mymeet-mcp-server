interface TranscriptEntry {
  speaker?: { speaker?: string } | null;
  text?: string;
  timestamp?: string;
}

interface Chapter {
  name?: string;
  transcript?: TranscriptEntry[];
}

function getChapters(report: unknown): Chapter[] {
  if (!report || typeof report !== 'object') return [];
  const chapters = (report as { chapters?: unknown }).chapters;
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

  const record = report as Record<string, unknown>;
  if (!Array.isArray(record.chapters)) return report;

  return {
    ...record,
    chapters: record.chapters.map((chapter) => {
      if (!chapter || typeof chapter !== 'object') return chapter;
      const { transcript: _transcript, ...rest } = chapter as Record<string, unknown>;
      return rest;
    }),
  };
}

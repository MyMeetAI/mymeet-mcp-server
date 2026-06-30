import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema, isReadyStatus } from '../types.js';
import { formatToolError } from '../errors.js';
import { buildTranscriptText, getReportStatus } from '../followup.js';

type ToolTextResult = { content: Array<{ type: 'text'; text: string }> };

/**
 * Turn a /api/video/report response into the transcript tool result.
 *
 * Pure (no server/client) so it can be unit-tested directly. When the
 * transcript is empty the message is status-aware: a READY meeting
 * (new/processed) is genuinely empty — saying "still processing" there made the
 * model wait forever. Only a not-ready meeting should be polled, and the
 * wording stays neutral so it is also correct for `failed`/`queued`.
 */
export function buildTranscriptResult(report: unknown): ToolTextResult {
  const transcript = buildTranscriptText(report);
  if (transcript) {
    return { content: [{ type: 'text', text: transcript }] };
  }

  const status = getReportStatus(report);
  const payload = isReadyStatus(status)
    ? {
        message: 'This meeting is ready but has no transcript text.',
        status,
        suggestion:
          'The transcript is genuinely empty (audio with no detected speech, or it is locked) — do not wait for processing. The summary may still be available via mymeet_get_meeting_report.',
      }
    : {
        message: 'No transcript available — the meeting is not ready yet.',
        status: status ?? 'processing',
        suggestion:
          'Use mymeet_get_meeting_status to poll until ready is true (status "new" or "processed").',
      };
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

export function registerGetTranscript(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_get_transcript',
    'Get the full transcript of a ready meeting (status "new" or "processed" — both mean the report is ready; "new" just flips to "processed" on first open) with speaker labels and timestamps. Use only when the user needs exact quotes or full conversation text. WARNING: transcripts can be very large.',
    MeetingIdSchema.shape,
    async ({ meetingId }) => {
      try {
        return buildTranscriptResult(await client.getMeetingReport(meetingId));
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

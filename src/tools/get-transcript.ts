import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema, isReadyStatus } from '../types.js';
import { formatToolError } from '../errors.js';
import { buildTranscriptText, getReportStatus } from '../followup.js';

export function registerGetTranscript(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_get_transcript',
    'Get the full transcript of a ready meeting (status "new" or "processed" — both mean the report is ready; "new" just flips to "processed" on first open) with speaker labels and timestamps. Use only when the user needs exact quotes or full conversation text. WARNING: transcripts can be very large.',
    MeetingIdSchema.shape,
    async ({ meetingId }) => {
      try {
        const result = await client.getMeetingReport(meetingId);
        const transcript = buildTranscriptText(result);
        if (!transcript) {
          // An empty transcript on a READY meeting (new/processed) is genuinely
          // empty (audio with no detected speech, or locked) — NOT "still
          // processing". Saying "processing" here makes the model wait forever.
          const status = getReportStatus(result);
          const payload = isReadyStatus(status)
            ? {
                message: 'This meeting is ready but has no transcript text.',
                status,
                suggestion:
                  'The transcript is genuinely empty (audio with no detected speech, or it is locked) — do not wait for processing. The summary may still be available via mymeet_get_meeting_report.',
              }
            : {
                message: 'No transcript yet — the meeting is still processing.',
                status: status ?? 'processing',
                suggestion:
                  'Use mymeet_get_meeting_status to poll until the status is "new" or "processed".',
              };
          return {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          };
        }

        return {
          content: [{ type: 'text', text: transcript }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

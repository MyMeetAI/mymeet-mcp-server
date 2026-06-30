import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema } from '../types.js';
import { formatToolError } from '../errors.js';
import { stripTranscript } from '../followup.js';

export function registerGetMeetingReport(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_get_meeting_report',
    'Get the AI-generated summary for a ready meeting (status "new" or "processed" — both mean the report is ready): key points, action items, decisions. Does NOT include the full transcript — use mymeet_get_transcript for that.',
    MeetingIdSchema.shape,
    async ({ meetingId }) => {
      try {
        const result = await client.getMeetingReport(meetingId);
        const report = stripTranscript(result);

        return {
          content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema } from '../types.js';
import { formatToolError } from '../errors.js';

export function registerGetMeetingStatus(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_get_meeting_status',
    'Check processing status of a meeting (new/queued/processing/processed/failed). Use to poll until meeting is ready.',
    MeetingIdSchema.shape,
    async ({ meetingId }) => {
      try {
        const result = await client.getMeetingStatus(meetingId);
        const payload = typeof result === 'string' ? { meetingId, status: result } : result;
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

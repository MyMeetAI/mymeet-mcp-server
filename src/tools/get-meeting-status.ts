import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema, isReadyStatus } from '../types.js';
import { formatToolError } from '../errors.js';

export function registerGetMeetingStatus(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_get_meeting_status',
    'Check processing status of a meeting. Returns `status` plus a `ready` boolean. Ready means the report and transcript are available: statuses "new" and "processed" are BOTH ready — "new" just flips to "processed" on first open. "queued"/"processing" are not ready; "failed" is an error. Poll until ready is true.',
    MeetingIdSchema.shape,
    async ({ meetingId }) => {
      try {
        const result = await client.getMeetingStatus(meetingId);
        // Status is a plain-text string (e.g. "processed"). An empty body becomes
        // null in the client — fall back to an explicit value instead of "null".
        const payload =
          typeof result === 'string'
            ? { meetingId, status: result, ready: isReadyStatus(result) }
            : (result ?? { meetingId, status: 'unknown', ready: false });
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

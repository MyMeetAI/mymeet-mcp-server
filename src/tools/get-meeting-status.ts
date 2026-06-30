import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { MeetingIdSchema, isReadyStatus } from '../types.js';
import { formatToolError } from '../errors.js';

/**
 * Normalize the status endpoint response into a stable payload.
 *
 * Pure (no server/client) so it can be unit-tested directly. `/api/meeting/status`
 * returns a plain-text status string (e.g. "processed"); an empty body becomes
 * null in the client, and a future JSON `{ status }` object is tolerated too.
 * `ready` is ALWAYS present — the tool contract promises it.
 */
export function buildStatusPayload(
  meetingId: string,
  result: unknown,
): { meetingId: string; status: string; ready: boolean } {
  const objectStatus = (result as { status?: unknown } | null)?.status;
  const status =
    typeof result === 'string' && result
      ? result
      : typeof objectStatus === 'string'
        ? objectStatus
        : 'unknown';
  return { meetingId, status, ready: isReadyStatus(status) };
}

export function registerGetMeetingStatus(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_get_meeting_status',
    'Check processing status of a meeting. Returns `status` plus a `ready` boolean. Ready means the report and transcript are available: statuses "new" and "processed" are BOTH ready — "new" just flips to "processed" on first open. "queued"/"processing" are not ready; "failed" is an error. Poll until ready is true.',
    MeetingIdSchema.shape,
    async ({ meetingId }) => {
      try {
        const payload = buildStatusPayload(meetingId, await client.getMeetingStatus(meetingId));
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

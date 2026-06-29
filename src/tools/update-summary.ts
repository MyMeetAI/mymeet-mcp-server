import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { UpdateSummarySchema } from '../types.js';
import { formatToolError } from '../errors.js';

export function registerUpdateSummary(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_update_summary',
    "Edit a specific section of a meeting's AI-generated summary. Identify the section by its templateId (from the meeting report) and entityName.",
    UpdateSummarySchema.shape,
    async ({ meetingId, templateId, entityName, newSummaryText }) => {
      try {
        await client.updateSummary(meetingId, { templateId, entityName, newSummaryText });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, meetingId, templateId, entityName }),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

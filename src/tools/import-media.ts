import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { formatToolError } from '../errors.js';
import { ImportMediaSchema } from '../types.js';

export function registerImportMedia(server: McpServer, client: MyMeetApiClient): void {
  server.registerTool(
    'mymeet_import_media',
    {
      description:
        'Import one public recording from YouTube, Yandex Disk, or Google Drive. ' +
        'Creates a meeting in the MyMeet API workspace and uses its minutes during processing. ' +
        'Returns a meetingId for mymeet_get_meeting_status. Use when the user asks to import a link that permits downloading.',
      inputSchema: ImportMediaSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const accepted = await client.importMedia(input);
        return { content: [{ type: 'text', text: JSON.stringify(accepted, null, 2) }] };
      } catch (error) {
        return formatToolError(error);
      }
    },
  );
}

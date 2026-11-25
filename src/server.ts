/**
 * MyMeet MCP Server.
 *
 * Registers meeting tools and the templates resource.
 * Supports STDIO (default) and HTTP transports.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MyMeetApiClient, type Credential } from './client.js';
import { logger } from './logger.js';
import { TEMPLATES, TEMPLATE_DESCRIPTIONS } from './types.js';

// Tools
import { registerListMeetings } from './tools/list-meetings.js';
import { registerGetMeetingStatus } from './tools/get-meeting-status.js';
import { registerGetMeetingReport } from './tools/get-meeting-report.js';
import { registerGetTranscript } from './tools/get-transcript.js';
import { registerSearchMeetings } from './tools/search-meetings.js';
import { registerDownloadMeeting } from './tools/download-meeting.js';
import { registerRecordMeeting } from './tools/record-meeting.js';
import { registerImportMedia } from './tools/import-media.js';
import { registerRenameMeeting } from './tools/rename-meeting.js';
import { registerRegenerateTemplate } from './tools/regenerate-template.js';
import { registerUpdateSummary } from './tools/update-summary.js';
import { registerDeleteMeeting } from './tools/delete-meeting.js';

export function createServer(credential: Credential | string, baseUrl?: string): McpServer {
  const server = new McpServer(
    {
      name: 'mymeet',
      version: '0.1.0',
    },
    {
      capabilities: {
        logging: {},
        tools: {},
        resources: {},
      },
    },
  );

  const client = new MyMeetApiClient(credential, baseUrl);

  logger.info('Registering tools...');

  // Read-only
  registerListMeetings(server, client);
  registerGetMeetingStatus(server, client);
  registerGetMeetingReport(server, client);
  registerGetTranscript(server, client);
  if (isSearchToolEnabled()) {
    registerSearchMeetings(server, client);
  }
  registerDownloadMeeting(server, client);

  // Write
  registerRecordMeeting(server, client);
  registerImportMedia(server, client);
  registerRenameMeeting(server, client);
  registerRegenerateTemplate(server, client);
  registerUpdateSummary(server, client);
  registerDeleteMeeting(server, client);

  // ── Register templates resource ────────────────────────────────────────────

  server.resource(
    'templates',
    'mymeet://templates',
    {
      description:
        'List of available meeting analysis templates with descriptions. Use to help users choose the right template.',
    },
    async () => {
      const templates = TEMPLATES.map((name) => ({
        name,
        description: TEMPLATE_DESCRIPTIONS[name],
      }));

      return {
        contents: [
          {
            uri: 'mymeet://templates',
            mimeType: 'application/json',
            text: JSON.stringify(templates, null, 2),
          },
        ],
      };
    },
  );

  logger.info('Server ready');

  return server;
}

export function isSearchToolEnabled(value = process.env.MYMEET_ENABLE_SEARCH_TOOL): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0';
}

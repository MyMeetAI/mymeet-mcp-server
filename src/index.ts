/**
 * MyMeet MCP Server — Entry Point.
 *
 * Usage:
 *   STDIO (default):  MYMEET_API_KEY=xxx npx @mymeet/mcp-server
 *   HTTP (remote):    npx @mymeet/mcp-server --http --port 3000
 *
 * In HTTP mode, clients pass their API key via Authorization header:
 *   Authorization: Bearer <mymeet-api-key>
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { logger } from './logger.js';
import type { Credential } from './client.js';
import {
  readOAuthConfig,
  createRemoteVerifier,
  extractBearerToken,
  isJwtFormat,
  extractVerifiedEmail,
} from './auth.js';

function sendUnauthorized(res: ServerResponse, oauthConfig: ReturnType<typeof readOAuthConfig>): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (oauthConfig) {
    // RFC 9728: metadata lives on the resource's own origin, and the resource IS the
    // audience — so this server must be served on the audience's origin (true on our deploy).
    const base = new URL(oauthConfig.audience).origin;
    headers['WWW-Authenticate'] =
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;
  }
  res.writeHead(401, headers);
  res.end(
    JSON.stringify({
      error: 'Unauthorized',
      message: oauthConfig
        ? 'Provide your MyMeet API key (Authorization: Bearer <key>) or sign in via OAuth.'
        : 'Provide your MyMeet API key in the Authorization header: Bearer <your-key>',
      help: 'https://app.mymeet.ai/settings',
    }),
  );
}

async function main(): Promise<void> {
  // ── Parse args ──────────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const isHttp = args.includes('--http');
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1
    ? parseInt(args[portIndex + 1], 10)
    : parseInt(process.env.PORT ?? '3000', 10); // Railway sets PORT env
  const baseUrl = process.env.MYMEET_API_URL; // optional override for dev

  // ── STDIO mode: require API key from env ────────────────────────────────────
  if (!isHttp) {
    const apiKey = process.env.MYMEET_API_KEY;
    if (!apiKey) {
      console.error(
        'ERROR: MYMEET_API_KEY environment variable is required.\n' +
        'Get your API key at https://app.mymeet.ai/settings\n\n' +
        'Example:\n' +
        '  MYMEET_API_KEY=your-key npx @mymeet/mcp-server',
      );
      process.exit(1);
    }

    const server = createServer(apiKey, baseUrl);
    console.error('[INFO] Starting MyMeet MCP server (STDIO transport)...');

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Wire the logger only after transport is connected — sendLoggingMessage
    // throws "Not connected" if called before server.connect() completes.
    logger.setServer(server);
    logger.info('MyMeet MCP server connected and ready!');
    return;
  }

  // ── HTTP mode: credentials per request (api key or OAuth JWT) ───────────────
  logger.info(`Starting MyMeet MCP server (HTTP transport on port ${port})...`);

  const oauthConfig = readOAuthConfig();
  const verifyToken = oauthConfig ? createRemoteVerifier(oauthConfig) : null;
  if (oauthConfig) {
    if (!process.env.MYMEET_SERVICE_SECRET) {
      logger.error('MYMEET_SERVICE_SECRET is not set — OAuth requests will be rejected (cannot authenticate to the backend)');
    }
    logger.info('OAuth enabled — JWT access tokens accepted alongside api keys');
  }

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for browser-based MCP clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    const urlPath = req.url?.split('?')[0];

    // OAuth Protected Resource Metadata (RFC 9728) — tells OAuth clients where to authenticate.
    if (urlPath === '/.well-known/oauth-protected-resource') {
      if (!oauthConfig) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('OAuth is not enabled on this server');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          resource: oauthConfig.audience,
          authorization_servers: [oauthConfig.issuer],
          bearer_methods_supported: ['header'],
        }),
      );
      return;
    }

    // MCP endpoint
    if (urlPath === '/mcp') {
      // Resolve the caller: a JWT (OAuth) or a raw api key (legacy). The `Bearer `
      // prefix is optional — clients that send the bare key still authenticate.
      const authHeader = req.headers['authorization'];
      const token = extractBearerToken(authHeader);

      let credential: Credential | undefined;
      if (token && oauthConfig && verifyToken && isJwtFormat(token)) {
        try {
          const payload = await verifyToken(token);
          credential = { kind: 'oauth', email: extractVerifiedEmail(payload, oauthConfig) };
        } catch {
          logger.warn('Rejected an OAuth token'); // never log the token itself
          sendUnauthorized(res, oauthConfig);
          return;
        }
      } else if (token) {
        credential = { kind: 'apikey', apiKey: token };
      }
      // No env-key fallback in HTTP mode: each client must present its own credential.

      if (!credential) {
        sendUnauthorized(res, oauthConfig);
        return;
      }

      try {
        // Create a fresh server + transport per request (stateless mode)
        const mcpServer = createServer(credential, baseUrl);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless — simplest deployment
        });

        res.on('close', () => {
          transport.close().catch(() => {});
          mcpServer.close().catch(() => {});
        });

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        logger.error('MCP request error', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. MCP endpoint is at /mcp');
  });

  httpServer.listen(port, '0.0.0.0', () => {
    logger.info(`MyMeet MCP server running at http://0.0.0.0:${port}/mcp`);
    logger.info('Clients connect with: Authorization: Bearer <mymeet-api-key>');
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

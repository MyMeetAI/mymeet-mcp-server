# Architecture — MyMeet MCP Server

Guide for developers working on this codebase.

## Overview

```
┌─────────────────────────────────────────────────────┐
│                   MCP Client                         │
│          (Claude Desktop / Cursor / ChatGPT)         │
└──────────────────────┬──────────────────────────────┘
                       │ JSON-RPC over STDIO
┌──────────────────────▼──────────────────────────────┐
│                   index.ts                           │
│         Entry point: parse args, validate key        │
│         Start STDIO or HTTP transport                │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   server.ts                          │
│         McpServer setup, register tools/resources    │
│         Creates MyMeetApiClient instance             │
└──────┬───────────────────────────────────┬──────────┘
       │                                   │
┌──────▼──────┐                   ┌────────▼─────────┐
│  tools/*.ts  │                   │  Resource:       │
│  12 tools    │                   │  templates       │
│  Each file   │                   │  (types.ts data) │
│  = 1 tool    │                   └──────────────────┘
└──────┬──────┘
       │
┌──────▼──────────────────────────────────────────────┐
│                   client.ts                          │
│         MyMeetApiClient                              │
│         - Native fetch (no axios)                    │
│         - AbortController timeout (15s)              │
│         - Retry with exponential backoff (3x)        │
│         - Auto-detect meeting platform from URL      │
└──────┬──────────────────────────────────────────────┘
       │ HTTPS
┌──────▼──────────────────────────────────────────────┐
│           https://backend.mymeet.ai/api/             │
│                  MyMeet REST API                     │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── index.ts         # Entry point — CLI args, API key validation, transport
├── server.ts        # McpServer creation — registers all tools + resource
├── client.ts        # HTTP client — all API calls go through here
├── logger.ts        # STDIO-safe logger (CRITICAL: no console.log anywhere)
├── errors.ts        # Typed errors with LLM suggestion field
├── types.ts         # Zod schemas, TypeScript types, template/platform constants
└── tools/
    ├── list-meetings.ts
    ├── get-meeting-status.ts
    ├── get-meeting-report.ts    # Returns summary WITHOUT transcript
    ├── get-transcript.ts        # Returns ONLY transcript (separate to avoid 25K limit)
    ├── search-meetings.ts       # Client-side filtering (API has no search endpoint)
    ├── download-meeting.ts      # md/json inline, pdf/docx as URL
    ├── record-meeting.ts        # 8 platforms + cron + auto-detect source
    ├── import-media.ts          # Public recording links and idempotent submission
    ├── rename-meeting.ts
    ├── regenerate-template.ts   # Re-analyze with different template
    ├── update-summary.ts
    └── delete-meeting.ts
```

## Key Design Decisions

### 1. STDIO-Safe Logging

**Rule: NEVER use `console.log()` anywhere in the codebase.**

STDIO transport reserves stdout for JSON-RPC messages. Any stray `console.log()` corrupts the protocol and crashes the connection. This is the #1 bug in MCP servers (affects 40% of new implementations).

`logger.ts` writes to stderr before connection, then switches to MCP logging API after `server.connect()`.

### 2. Report/Transcript Split

`mymeet_get_meeting_report` strips the transcript field. `mymeet_get_transcript` returns only the transcript.

**Why:** Claude Desktop has a 25K token limit on tool responses. A 1-hour meeting transcript can be 50K+ tokens. Without this split, responses get silently truncated.

### 3. Native Fetch (No Axios)

We use the built-in `fetch()` API (Node 18+). No axios, no node-fetch.

**Why:** Zero extra dependencies = smaller bundle (24KB), smaller attack surface, fewer supply chain risks.

### 4. AbortController Timeout

Every API call has a 15-second timeout via `AbortController`.

**Why:** Without timeouts, a slow backend hangs the entire MCP server. This is the #8 most common MCP server bug.

### 5. Binary Format Handling

`mymeet_download_meeting` returns content inline for text formats (md, json) but returns a download URL for binary formats (pdf, docx).

**Why:** MCP tool responses are text-only. Binary data can't be serialized through the protocol.

### 6. Scoped Listing and Client-Side Search

`mymeet_list_meetings` defaults to `scope=mine`, maps `mine` to `/api/workspaces/active/user-meetings`, maps `workspace` to `/api/workspaces/active/all-meetings`, and converts public one-based pages to the backend's zero-based page index. `mymeet_search_meetings` fetches all pages for the selected scope in batches of 50, then filters locally.

**Why:** The MyMeet API doesn't support server-side search/filtering. Search must scan before filtering so a match on page 3 is not missed. The search tool can be hidden with `MYMEET_ENABLE_SEARCH_TOOL=false` while backend search is unavailable or under investigation.

## How to Add a New Tool

1. **Create** `src/tools/my-new-tool.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MyMeetApiClient } from '../client.js';
import { formatToolError } from '../errors.js';
import { z } from 'zod';

const MySchema = z.object({
  meetingId: z.string().describe('The unique meeting ID'),
});

export function registerMyNewTool(server: McpServer, client: MyMeetApiClient): void {
  server.tool(
    'mymeet_my_new_tool',            // Tool name (mymeet_ prefix)
    'Description for the LLM...',     // Be specific — this is how the LLM decides to use it
    MySchema.shape,                   // Zod schema → JSON Schema auto-generated
    async ({ meetingId }) => {
      try {
        const result = await client.someMethod(meetingId);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return formatToolError(error);  // Always use this — never throw from tools
      }
    },
  );
}
```

2. **Add API method** to `src/client.ts` if needed.

3. **Register** in `src/server.ts`:
```typescript
import { registerMyNewTool } from './tools/my-new-tool.js';
// ...
registerMyNewTool(server, client);
```

4. **Update** tool count in server.ts log message.

## How to Add a New Error Type

Add to `src/errors.ts`:

```typescript
export class MyNewError extends MyMeetError {
  constructor(details: string) {
    super(
      `Human-readable message: ${details}`,
      'LLM-friendly suggestion: what to do next',
      400, // HTTP status code (optional)
    );
    this.name = 'MyNewError';
  }
}
```

Then use it in `client.ts` — the `formatToolError()` function handles serialization automatically.

## TODO for Production

1. **HTTP Transport** — `src/index.ts` has a TODO for Streamable HTTP transport. Use `@modelcontextprotocol/sdk/server/streamableHttp.js` when implementing.

2. **npm publish** — Package name `@mymeet/mcp-server` is reserved. Run `npm publish --access public` after testing.

3. **Integration tests** — `tests/integration.test.ts` needs a real API key. Set `MYMEET_API_KEY` in CI secrets and skip by default.

4. **Rate limiting** — Current implementation relies on backend rate limits + retry. Consider adding client-side rate limiting (token bucket) for high-frequency usage.

5. **Webhook support** — MyMeet API doesn't document webhooks. When available, add `mymeet_subscribe_webhook` tool for real-time notifications.

## Dependencies

| Package | Purpose | Why this one |
|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation | Official SDK, required |
| `zod` | Schema validation | Already bundled with SDK, type-safe |
| `tsup` (dev) | Build/bundle | Fast ESM bundler |
| `vitest` (dev) | Tests | Fast, ESM-native |
| `tsx` (dev) | Dev runner | Hot reload for development |
| `typescript` (dev) | Type checking | Required |

**No runtime dependencies besides MCP SDK.** This is intentional — see Design Decision #3.

## Build & Distribution

```bash
npm run build     # tsup → dist/index.js (24KB, single file with shebang)
npm run dev       # tsx src/index.ts (hot reload)
npm test          # vitest
npm run lint      # tsc --noEmit
```

The built `dist/index.js` includes a `#!/usr/bin/env node` shebang, making it directly executable via `npx`.

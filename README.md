# MyMeet MCP Server

Connect your AI assistant to your meetings. Record, transcribe, search, analyze, and export meetings from Google Meet, Zoom, Microsoft Teams and 5 more platforms — directly from Claude, Cursor, Codex, or any MCP-compatible client.

- 🧰 **11 tools** — list, search, check status, summarize, transcript, download, record, rename, re-analyze, edit, delete
- 🗂️ **11 analysis templates** — sales, HR, 1:1, research, protocol, medical, and more
- 🔌 **Two ways to run** — locally over stdio (`npx`, zero config) or against a remote server over HTTP
- 🔑 **Simple auth** — your MyMeet API key (an env var locally, `Authorization: Bearer …` over HTTP)
- 📦 Published as [`@mymeet/mcp-server`](https://www.npmjs.com/package/@mymeet/mcp-server) · Node ≥ 18 · built on the official MCP SDK

> **Need a key first?** Get your API key at **[app.mymeet.ai/settings](https://app.mymeet.ai/settings)** (or email hello@mymeet.ai for B2B access), then pick a setup below.

---

## Which setup should I use?

|                | **Local — npm / stdio**                | **Remote — HTTP**                              |
| -------------- | -------------------------------------- | ---------------------------------------------- |
| **Install**    | `npx`, runs on your machine            | nothing — just point at a URL                  |
| **Best for**   | Claude Desktop, Claude Code, Cursor, Codex | Team/hosted setups, browser clients        |
| **Auth**       | `MYMEET_API_KEY` env var               | `Authorization: Bearer <key>`                  |
| **Hosting**    | n/a                                    | use hosted `mcp.mymeet.ai` or self-host        |

Both expose the **exact same tools** — choose whatever your client supports. Using a client that isn't listed below? Jump to **[Universal setup](#universal-setup-any-mcp-client)**.

---

## Option 1 — Local (npm, stdio)

The server runs on your machine through `npx`; your API key lives in the client config and never leaves it. Requires **Node 18+**.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mymeet": {
      "command": "npx",
      "args": ["-y", "@mymeet/mcp-server"],
      "env": { "MYMEET_API_KEY": "your-api-key-here" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add mymeet --transport stdio -e MYMEET_API_KEY=your-key -- npx -y @mymeet/mcp-server
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mymeet": {
      "command": "npx",
      "args": ["-y", "@mymeet/mcp-server"],
      "env": { "MYMEET_API_KEY": "your-api-key-here" }
    }
  }
}
```

### Codex (OpenAI)

```bash
codex mcp add mymeet --env MYMEET_API_KEY=your-key -- npx -y @mymeet/mcp-server
```

Or add the server to `~/.codex/config.toml` by hand:

```toml
[mcp_servers.mymeet]
command = "npx"
args = ["-y", "@mymeet/mcp-server"]
env = { MYMEET_API_KEY = "your-api-key-here" }
```

> Run `/mcp` inside Codex to confirm the server connected and see its tools.

> **Some other client?** Every stdio MCP client reduces to the same three values — see **[Universal setup](#universal-setup-any-mcp-client)** below.

---

## Option 2 — Remote (HTTP)

No local install — connect your client to the server URL and authenticate per request. Great for browser-based clients and shared team deployments.

**Hosted URL:** `https://mcp.mymeet.ai/mcp`

### Claude Desktop (custom connector)

Settings → Connectors → **Add custom connector**:

- **URL:** `https://mcp.mymeet.ai/mcp`
- **Header:** `Authorization: Bearer YOUR_API_KEY`

### Claude Code

```bash
claude mcp add mymeet --transport http https://mcp.mymeet.ai/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### Cursor

```json
{
  "mcpServers": {
    "mymeet": {
      "url": "https://mcp.mymeet.ai/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

### Codex (OpenAI)

```bash
export MYMEET_API_KEY=YOUR_API_KEY
codex mcp add mymeet --url https://mcp.mymeet.ai/mcp --bearer-token-env-var MYMEET_API_KEY
```

Or add it to `~/.codex/config.toml` directly:

```toml
[mcp_servers.mymeet]
url = "https://mcp.mymeet.ai/mcp"
bearer_token_env_var = "MYMEET_API_KEY"
```

> Codex reads the token from the named env var and sends it as `Authorization: Bearer …` on every request, so the key stays out of the config file.

---

## Universal setup (any MCP client)

Using a client that isn't listed above? Every MCP client reduces to the same handful of values — map them onto whatever shape it expects (a JSON `mcpServers` object, Codex's TOML `[mcp_servers.*]` table, or a `… mcp add` command). Both modes expose the identical tools.

| Setting   | Local — stdio                  | Remote — HTTP                     |
| --------- | ------------------------------ | --------------------------------- |
| `command` | `npx`                          | —                                 |
| `args`    | `["-y", "@mymeet/mcp-server"]` | —                                 |
| `env`     | `MYMEET_API_KEY=<your key>`    | —                                 |
| `url`     | —                              | `https://mcp.mymeet.ai/mcp`       |
| auth      | —                              | `Authorization: Bearer <your key>` |

**JSON clients** (Claude Desktop, Cursor, VS Code, Cline, Windsurf, Zed, …) — local (stdio) mode:

```json
{
  "mcpServers": {
    "mymeet": {
      "command": "npx",
      "args": ["-y", "@mymeet/mcp-server"],
      "env": { "MYMEET_API_KEY": "your-api-key-here" }
    }
  }
}
```

For remote (HTTP) mode, swap `command`/`args`/`env` for a `url` and an auth header:

```json
{
  "mcpServers": {
    "mymeet": {
      "url": "https://mcp.mymeet.ai/mcp",
      "headers": { "Authorization": "Bearer your-api-key-here" }
    }
  }
}
```

**TOML clients** (Codex) — use the `[mcp_servers.mymeet]` blocks shown in [Option 1](#option-1--local-npm-stdio) and [Option 2](#option-2--remote-http).

---

## Tools

Read-only tools default to the current user's meetings (`scope: "mine"`); pass `scope: "workspace"` to span the whole workspace (owners/admins). Full parameters, responses, and edge cases live in **[docs/TOOLS.md](docs/TOOLS.md)**.

| Tool | Type | Description |
|------|------|-------------|
| `mymeet_list_meetings` | read | List meetings (paginated). `scope: "workspace"` for all workspace meetings |
| `mymeet_get_meeting_status` | read | Processing status: `new → queued → processing → processed / failed` |
| `mymeet_get_meeting_report` | read | AI summary: key points, action items, decisions (no transcript) |
| `mymeet_get_transcript` | read | Full transcript with speaker labels and timestamps |
| `mymeet_search_meetings` | read | Search across all pages by title, people, date range, or status |
| `mymeet_download_meeting` | read | Export report — `md`/`json` inline, `pdf`/`docx` as a download URL |
| `mymeet_record_meeting` | write | Schedule/start recording on 8 platforms, with optional cron |
| `mymeet_rename_meeting` | write | Rename a meeting |
| `mymeet_regenerate_template` | write | Re-analyze a meeting with a different template |
| `mymeet_update_summary` | write | Edit AI-generated summary sections |
| `mymeet_delete_meeting` | write | ⚠️ Permanently delete a meeting |

**Resource:** `mymeet://templates` returns the list of templates with descriptions, so the assistant can suggest the right one.

---

## Templates

Used by `mymeet_record_meeting` and `mymeet_regenerate_template`:

| Template | Use case |
|----------|----------|
| `default-meeting` | Standard summary with key points and action items |
| `sales-meeting` | Sales call: objections, next steps, deal signals |
| `sales-coaching` | Sales coaching feedback: technique, improvement areas |
| `hr-interview` | Candidate evaluation: strengths, concerns, key answers |
| `research-interview` | User research: insights, patterns, methodology notes |
| `team-sync` | Per-person updates, blockers, decisions |
| `article` | SEO article/blog post from meeting content |
| `lecture-notes` | Key concepts, examples, study takeaways |
| `one-to-one` | Manager 1:1: feedback, goals, action items |
| `protocol` | Formal protocol: agenda, decisions, responsible parties |
| `medicine` | Medical consultation: anamnesis, symptoms, recommendations |

## Supported platforms

Google Meet · Zoom · Microsoft Teams · Yandex Telemost · SberJazz · TrueConf · KonturTalk · Jitsi

The platform is auto-detected from the meeting URL, or set it explicitly with the `source` parameter.

---

## Example prompts

```
"Show me my recent meetings"
"What was discussed in my last sales call?"
"Find my meetings with Vladimir from last week"
"Show all workspace meetings that failed processing"
"Record my Zoom meeting tomorrow at 2pm as a sales meeting"
"Re-analyze meeting X using the hr-interview template"
"Download the report for meeting Y as markdown"
```

---

## Configuration

All configuration is via environment variables.

| Variable | Mode | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `MYMEET_API_KEY` | stdio | ✅ (stdio) | — | Your API key. Used in local/stdio mode. |
| `MYMEET_ENABLE_SEARCH_TOOL` | both | — | `true` | Set to `false`/`0` to hide `mymeet_search_meetings`. |
| `MYMEET_API_URL` | both | — | `https://backend.mymeet.ai` | Override the backend base URL (dev/staging). |
| `PORT` | http | — | `3000` | HTTP listen port (Railway sets this automatically). |

> **Auth:** In stdio mode the key comes from `MYMEET_API_KEY`. In HTTP mode each request carries its own API key in `Authorization: Bearer …` — there is **no env-key fallback in HTTP mode**, so every client presents its own key.

---

## Self-hosting the remote server

The remote server is the same binary started with `--http`. It exposes:

| Path | Purpose |
|------|---------|
| `POST /mcp` | MCP Streamable HTTP endpoint |
| `GET /health` | Health check (returns `ok`) |

### Docker

```bash
docker build -t mymeet-mcp .
docker run -p 3000:3000 mymeet-mcp
# Clients connect to http://localhost:3000/mcp with an Authorization header
```

The image runs `node dist/index.js --http --port 3000` and ships a `/health` healthcheck.

### Railway

`railway.json` is preconfigured (NIXPACKS build, `npm start`, `/health` healthcheck, restart-on-failure). Push the repo and set env vars in the Railway dashboard.

### systemd + nginx (bare VM)

Reference units are in [`deploy/`](deploy/):

- [`deploy/mymeet-mcp.service`](deploy/mymeet-mcp.service) — runs `node dist/index.js --http --port 3100` under systemd.
- [`deploy/nginx-mcp.conf`](deploy/nginx-mcp.conf) — reverse-proxies `mcp.mymeet.ai` → `127.0.0.1:3100`. **SSE-critical settings** (`proxy_buffering off`, long read timeouts) are already in place for Streamable HTTP.

```bash
sudo cp deploy/mymeet-mcp.service /etc/systemd/system/
sudo systemctl enable --now mymeet-mcp
sudo cp deploy/nginx-mcp.conf /etc/nginx/sites-available/mcp && \
  sudo ln -s /etc/nginx/sites-available/mcp /etc/nginx/sites-enabled/ && \
  sudo nginx -s reload
# then issue TLS with certbot (see the commented lines in the conf)
```

---

## How it works

```
MCP client (Claude / Cursor / Codex / Code / …)
        │  JSON-RPC over stdio  ── or ──  Streamable HTTP
        ▼
   index.ts      parse args, resolve credential, start transport
        ▼
   server.ts     register 11 tools + templates resource
        ▼
   client.ts     native fetch · 15s timeout · retry w/ backoff
        ▼
   https://backend.mymeet.ai/api/   (MyMeet REST API)
```

Design notes (logging that's safe for stdio, the report/transcript split, client-side search) are documented in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Development

```bash
git clone https://github.com/MyMeetAI/mymeet-mcp-server.git
cd mymeet-mcp-server
npm install
cp .env.example .env   # add your MYMEET_API_KEY
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Run from source with `tsx` (hot reload, stdio) |
| `npm start` | Run the built server in HTTP mode |
| `npm run build` | Bundle to `dist/index.js` with `tsup` |
| `npm test` | Run the test suite (`vitest`) |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | Type-check with `tsc --noEmit` |

To run the remote server locally: `npm run build && node dist/index.js --http --port 3000`.

## License

MIT

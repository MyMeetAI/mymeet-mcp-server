# MyMeet MCP Server

[English](README.md) | **Русский**

Подключите вашего AI-ассистента к вашим встречам. Записывайте, транскрибируйте, ищите, анализируйте и экспортируйте встречи из Google Meet, Zoom, Microsoft Teams и ещё 5 платформ — прямо из Claude, Cursor, Codex или любого MCP-совместимого клиента.

- 🧰 **11 инструментов** — список встреч, поиск, статус обработки, саммари, транскрипт, скачивание, запись, переименование, повторный анализ, редактирование, удаление
- 🗂️ **11 шаблонов анализа** — продажи, HR, 1:1, исследования, протокол, медицина и другие
- 🔌 **Два способа запуска** — локально через stdio (`npx`, без настройки) или через удалённый сервер по HTTP
- 🔑 **Простая авторизация** — ваш API-ключ MyMeet (переменная окружения локально, `Authorization: Bearer …` по HTTP)
- 📦 Опубликован как [`@mymeet/mcp-server`](https://www.npmjs.com/package/@mymeet/mcp-server) · Node ≥ 18 · построен на официальном MCP SDK

> **Ещё нет ключа?** Получите API-ключ на **[app.mymeet.ai/settings](https://app.mymeet.ai/settings)** (или напишите на hello@mymeet.ai для B2B-доступа), затем выберите способ установки ниже.

---

## Какой вариант выбрать?

|                  | **Локально — npm / stdio**                 | **Удалённо — HTTP**                              |
| ---------------- | ------------------------------------------ | ------------------------------------------------ |
| **Установка**    | `npx`, работает на вашей машине            | не нужна — просто укажите URL                    |
| **Подходит для** | Claude Desktop, Claude Code, Cursor, Codex | командных/hosted-сценариев, браузерных клиентов  |
| **Авторизация**  | переменная окружения `MYMEET_API_KEY`      | `Authorization: Bearer <key>`                    |
| **Хостинг**      | —                                          | готовый `mcp.mymeet.ai` или self-hosted          |

Оба варианта предоставляют **одни и те же инструменты** — выбирайте тот, который поддерживает ваш клиент. Вашего клиента нет в списке ниже? Перейдите к **[универсальной настройке](#универсальная-настройка-любой-mcp-клиент)**.

---

## Вариант 1 — локально (npm, stdio)

Сервер запускается на вашей машине через `npx`; API-ключ хранится в конфиге клиента и не покидает его. Требуется **Node 18+**.

### Claude Desktop

**Проще всего — бандл `.mcpb` (установка в один клик).** Скачайте `mymeet.mcpb` со [страницы релизов](https://github.com/MyMeetAI/mymeet-mcp-server/releases) (или соберите сами командой `npm run pack:mcpb`), затем в Claude Desktop откройте **Settings → Extensions → Advanced → Install Extension…**, выберите файл и вставьте API-ключ в поле — без правки JSON, ключ хранится в системном keychain.

Или настройте вручную через `npx` — отредактируйте `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Добавьте в `.cursor/mcp.json`:

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

Или добавьте сервер в `~/.codex/config.toml` вручную:

```toml
[mcp_servers.mymeet]
command = "npx"
args = ["-y", "@mymeet/mcp-server"]
env = { MYMEET_API_KEY = "your-api-key-here" }
```

> Выполните `/mcp` внутри Codex, чтобы убедиться, что сервер подключился, и посмотреть его инструменты.

> **Другой клиент?** Любой stdio MCP-клиент сводится к одним и тем же трём значениям — см. **[универсальную настройку](#универсальная-настройка-любой-mcp-клиент)** ниже.

---

## Вариант 2 — удалённо (HTTP)

Без локальной установки — подключите клиент к URL сервера, авторизация передаётся в каждом запросе. Отлично подходит для браузерных клиентов и общих командных развёртываний.

**Hosted URL:** `https://mcp.mymeet.ai/mcp`

### Claude Desktop

JSON-конфиг Claude Desktop надёжно работает через [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) — он запускается локально по stdio и пересылает запросы на hosted MCP-эндпоинт. Отредактируйте `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mymeet": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.mymeet.ai/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer your-api-key-here"
      }
    }
  }
}
```

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

Или добавьте напрямую в `~/.codex/config.toml`:

```toml
[mcp_servers.mymeet]
url = "https://mcp.mymeet.ai/mcp"
bearer_token_env_var = "MYMEET_API_KEY"
```

> Codex читает токен из указанной переменной окружения и отправляет его как `Authorization: Bearer …` в каждом запросе — ключ не попадает в файл конфигурации.

---

## Универсальная настройка (любой MCP-клиент)

Вашего клиента нет в списке выше? Любой MCP-клиент сводится к одному и тому же набору значений — перенесите их в тот формат, который он ожидает (JSON-объект `mcpServers`, TOML-таблица `[mcp_servers.*]` в Codex или команда `… mcp add`). Оба режима предоставляют идентичные инструменты.

| Параметр    | Локально — stdio               | Удалённо — HTTP                    |
| ----------- | ------------------------------ | ---------------------------------- |
| `command`   | `npx`                          | —                                  |
| `args`      | `["-y", "@mymeet/mcp-server"]` | —                                  |
| `env`       | `MYMEET_API_KEY=<ваш ключ>`    | —                                  |
| `url`       | —                              | `https://mcp.mymeet.ai/mcp`        |
| авторизация | —                              | `Authorization: Bearer <ваш ключ>` |

**JSON-клиенты** (Claude Desktop, Cursor, VS Code, Cline, Windsurf, Zed, …) — локальный (stdio) режим:

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

Для удалённого (HTTP) режима клиенты с нативной поддержкой Streamable HTTP могут заменить `command`/`args`/`env` на `url` и заголовок авторизации:

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

Claude Desktop может использовать hosted-эндпоинт через `mcp-remote`:

```json
{
  "mcpServers": {
    "mymeet": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.mymeet.ai/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer your-api-key-here"
      }
    }
  }
}
```

**TOML-клиенты** (Codex) — используйте блоки `[mcp_servers.mymeet]` из [варианта 1](#вариант-1--локально-npm-stdio) и [варианта 2](#вариант-2--удалённо-http).

---

## Инструменты

Инструменты чтения по умолчанию работают со встречами текущего пользователя (`scope: "mine"`); передайте `scope: "workspace"`, чтобы охватить весь воркспейс (для владельцев/админов). Полные параметры, форматы ответов и граничные случаи — в **[docs/TOOLS.md](docs/TOOLS.md)**.

| Инструмент | Тип | Описание |
|------------|-----|----------|
| `mymeet_list_meetings` | чтение | Список встреч (с пагинацией). `scope: "workspace"` — все встречи воркспейса |
| `mymeet_get_meeting_status` | чтение | Статус обработки: `new → queued → processing → processed / failed` |
| `mymeet_get_meeting_report` | чтение | AI-саммари: ключевые моменты, задачи, решения (без транскрипта) |
| `mymeet_get_transcript` | чтение | Полный транскрипт с именами спикеров и таймкодами |
| `mymeet_search_meetings` | чтение | Поиск по всем страницам: название, участники, период, статус |
| `mymeet_download_meeting` | чтение | Экспорт отчёта — `md`/`json` в ответе, `pdf`/`docx` ссылкой на скачивание |
| `mymeet_record_meeting` | запись | Запланировать/начать запись на 8 платформах, опционально по cron |
| `mymeet_rename_meeting` | запись | Переименовать встречу |
| `mymeet_regenerate_template` | запись | Повторно проанализировать встречу с другим шаблоном |
| `mymeet_update_summary` | запись | Редактировать разделы AI-саммари |
| `mymeet_delete_meeting` | запись | ⚠️ Безвозвратно удалить встречу |

**Ресурс:** `mymeet://templates` возвращает список шаблонов с описаниями, чтобы ассистент мог предложить подходящий.

---

## Шаблоны

Используются в `mymeet_record_meeting` и `mymeet_regenerate_template`:

| Шаблон | Назначение |
|--------|------------|
| `default-meeting` | Стандартное саммари с ключевыми моментами и задачами |
| `sales-meeting` | Звонок по продажам: возражения, следующие шаги, сигналы по сделке |
| `sales-coaching` | Коучинг продаж: разбор техники, зоны роста |
| `hr-interview` | Оценка кандидата: сильные стороны, риски, ключевые ответы |
| `research-interview` | Пользовательское исследование: инсайты, паттерны, заметки по методологии |
| `team-sync` | Апдейты по каждому участнику, блокеры, решения |
| `article` | SEO-статья / пост в блог из содержания встречи |
| `lecture-notes` | Ключевые концепции, примеры, выводы для изучения |
| `one-to-one` | 1:1 с руководителем: фидбэк, цели, задачи |
| `protocol` | Формальный протокол: повестка, решения, ответственные |
| `medicine` | Медицинская консультация: анамнез, симптомы, рекомендации |

## Поддерживаемые платформы

Google Meet · Zoom · Microsoft Teams · Яндекс Телемост · SberJazz · TrueConf · Контур.Толк · Jitsi

Платформа определяется автоматически по ссылке на встречу, либо задайте её явно параметром `source`.

---

## Примеры запросов

```
«Покажи мои последние встречи»
«Что обсуждали на моём последнем звонке по продажам?»
«Найди мои встречи с Владимиром за прошлую неделю»
«Покажи все встречи воркспейса, у которых обработка завершилась с ошибкой»
«Запиши мою Zoom-встречу завтра в 14:00 по шаблону sales-meeting»
«Повторно проанализируй встречу X по шаблону hr-interview»
«Скачай отчёт по встрече Y в markdown»
```

---

## Конфигурация

Вся конфигурация — через переменные окружения.

| Переменная | Режим | Обязательна | По умолчанию | Описание |
|------------|-------|-------------|--------------|----------|
| `MYMEET_API_KEY` | stdio | ✅ (stdio) | — | Ваш API-ключ. Используется в локальном/stdio-режиме. |
| `MYMEET_ENABLE_SEARCH_TOOL` | оба | — | `true` | Установите `false`/`0`, чтобы скрыть `mymeet_search_meetings`. |
| `MYMEET_API_URL` | оба | — | `https://backend.mymeet.ai` | Переопределить базовый URL бэкенда (dev/staging). |
| `PORT` | http | — | `3000` | Порт HTTP-сервера (Railway задаёт автоматически). |

> **Авторизация:** в stdio-режиме ключ берётся из `MYMEET_API_KEY`. В HTTP-режиме каждый запрос несёт собственный ключ в `Authorization: Bearer …` — **fallback на ключ из окружения в HTTP-режиме отсутствует**, каждый клиент передаёт свой ключ.

---

## Самостоятельный хостинг удалённого сервера

Удалённый сервер — это тот же бинарник, запущенный с флагом `--http`. Он предоставляет:

| Путь | Назначение |
|------|------------|
| `POST /mcp` | MCP-эндпоинт (Streamable HTTP) |
| `GET /health` | Health check (возвращает `ok`) |

### Docker

```bash
docker build -t mymeet-mcp .
docker run -p 3000:3000 mymeet-mcp
# Клиенты подключаются к http://localhost:3000/mcp с заголовком Authorization
```

Образ запускает `node dist/index.js --http --port 3000` и включает healthcheck по `/health`.

### Railway

`railway.json` уже настроен (сборка NIXPACKS, `npm start`, healthcheck `/health`, перезапуск при сбое). Запушьте репозиторий и задайте переменные окружения в дашборде Railway.

### systemd + nginx (обычная VM)

Готовые конфиги — в [`deploy/`](deploy/):

- [`deploy/mymeet-mcp.service`](deploy/mymeet-mcp.service) — запускает `node dist/index.js --http --port 3100` под systemd.
- [`deploy/nginx-mcp.conf`](deploy/nginx-mcp.conf) — реверс-прокси `mcp.mymeet.ai` → `127.0.0.1:3100`. **Критичные для SSE настройки** (`proxy_buffering off`, длинные read-таймауты) уже выставлены под Streamable HTTP.

```bash
sudo cp deploy/mymeet-mcp.service /etc/systemd/system/
sudo systemctl enable --now mymeet-mcp
sudo cp deploy/nginx-mcp.conf /etc/nginx/sites-available/mcp && \
  sudo ln -s /etc/nginx/sites-available/mcp /etc/nginx/sites-enabled/ && \
  sudo nginx -s reload
# затем выпустите TLS-сертификат через certbot (см. закомментированные строки в конфиге)
```

---

## Как это работает

```
MCP-клиент (Claude / Cursor / Codex / Code / …)
        │  JSON-RPC по stdio  ── или ──  Streamable HTTP
        ▼
   index.ts      парсинг аргументов, выбор ключа, запуск транспорта
        ▼
   server.ts     регистрация 11 инструментов + ресурса шаблонов
        ▼
   client.ts     нативный fetch · таймаут 15 c · ретраи с backoff
        ▼
   https://backend.mymeet.ai/api/   (REST API MyMeet)
```

Заметки по дизайну (безопасное для stdio логирование, разделение report/transcript, поиск на стороне клиента) — в **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Разработка

```bash
git clone https://github.com/MyMeetAI/mymeet-mcp-server.git
cd mymeet-mcp-server
npm install
cp .env.example .env   # укажите ваш MYMEET_API_KEY
```

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск из исходников через `tsx` (hot reload, stdio) |
| `npm start` | Запуск собранного сервера в HTTP-режиме |
| `npm run build` | Сборка в `dist/index.js` через `tsup` |
| `npm test` | Запуск тестов (`vitest`) |
| `npm run test:watch` | Тесты в watch-режиме |
| `npm run lint` | Проверка типов `tsc --noEmit` |
| `npm run pack:mcpb` | Сборка и упаковка десктоп-бандла `.mcpb` (→ `mymeet.mcpb`) |

Запустить удалённый сервер локально: `npm run build && node dist/index.js --http --port 3000`.

Собрать десктоп-бандл: `npm run pack:mcpb` создаёт `mymeet.mcpb` (манифест + собранный сервер + production `node_modules`), устанавливается через **Install Extension…** в Claude Desktop.

## Лицензия

MIT

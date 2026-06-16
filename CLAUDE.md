# BabyAgent — Developer Notes

## What this is
A Telegram-based AI personal assistant for new mothers. Tracks baby feeds, nappies, and sleep windows; answers parenting questions grounded in uploaded reference docs; flags health concerns.

## Stack
- **Runtime**: Node.js + TypeScript (ESM)
- **Bot**: Telegraf (Telegram)
- **LLM**: Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk`
- **Baby data**: Terminal3 ADK (sensitive) — or MockDataAdapter in dev
- **RAG storage**: Postgres + pgvector
- **Scheduler**: node-cron (feed reminders every 30 min)

## Local dev setup
```bash
cp .env.example .env       # fill in TELEGRAM_BOT_TOKEN + ANTHROPIC_API_KEY
pnpm install
# Optional: start Postgres for RAG
docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 ankane/pgvector
psql $DATABASE_URL -f migrations/001_pgvector.sql
pnpm dev
```

## Key env vars
| Var | Required | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `ANTHROPIC_API_KEY` | Yes | |
| `DATABASE_URL` | No | Only needed for RAG doc upload |
| `TERMINAL3_ENABLED` | No | Set to `true` + provide API key for production data |
| `EMBEDDINGS_PROVIDER` | No | `local` (default) or `openai` |

## Tests
```bash
pnpm test
```

## Architecture
```
src/
  index.ts            Entry point
  config.ts           Env validation (Zod)
  bot/                Telegraf handlers + session store
  agent/              Claude agentic loop + tool definitions + concern rules
  data/               IDataAdapter interface + Mock + Terminal3 implementations
  rag/                pgvector ingest + retrieval + embeddings
  scheduler/          node-cron reminder jobs
```

## Terminal3 integration
The `Terminal3DataAdapter` (`src/data/terminal3.adapter.ts`) is a stub. Once Terminal3 ADK docs/SDK are confirmed, implement the REST calls there. All other code uses the `IDataAdapter` interface and is unaffected.

## Adding a new tool
1. Add schema to `toolDefinitions` array in `src/agent/tools.ts`
2. Add handler case to `dispatchTool` switch
3. Add test in `src/agent/tools.test.ts`

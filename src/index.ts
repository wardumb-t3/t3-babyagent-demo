import "dotenv/config";
import { createDataAdapter } from "./data/adapter.interface.js";
import { getPgPool } from "./rag/db.js";
import { createBot } from "./bot/index.js";
import { startScheduler } from "./scheduler/index.js";

async function main() {
  console.log("[babyagent] Starting...");

  const db = createDataAdapter();
  const pgPool = getPgPool();

  if (pgPool) {
    console.log("[babyagent] Postgres connected — RAG enabled");
  } else {
    console.log("[babyagent] No DATABASE_URL — RAG disabled");
  }

  const bot = createBot(db, pgPool);
  startScheduler(bot, db);

  await bot.launch();
  console.log("[babyagent] Bot running ✓");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

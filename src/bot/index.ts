import { Telegraf } from "telegraf";
import { config } from "../config.js";
import { registerHandlers } from "./handlers.js";
import type { IDataAdapter } from "../data/adapter.interface.js";
import type { Pool } from "pg";

export function createBot(db: IDataAdapter, pgPool: Pool | null): Telegraf {
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.catch((err, ctx) => {
    console.error("Telegraf error:", err);
    ctx.reply("An unexpected error occurred. Please try again.").catch(() => {});
  });

  registerHandlers(bot, db, pgPool);
  return bot;
}

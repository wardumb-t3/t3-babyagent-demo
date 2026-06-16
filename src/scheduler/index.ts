import cron from "node-cron";
import type { Telegraf } from "telegraf";
import type { IDataAdapter } from "../data/adapter.interface.js";
import { checkAndSendReminders } from "./reminders.js";

export function startScheduler(bot: Telegraf, db: IDataAdapter): void {
  // Run every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("[scheduler] Running reminder checks...");
    await checkAndSendReminders(bot, db);
  });

  console.log("[scheduler] Started — reminders run every 30 minutes");
}

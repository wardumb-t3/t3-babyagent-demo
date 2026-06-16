import type { Telegraf } from "telegraf";
import type { IDataAdapter } from "../data/adapter.interface.js";
import { getAllSessions } from "../bot/session.js";

const FEED_REMINDER_HOURS = 2.5;

export async function checkAndSendReminders(bot: Telegraf, db: IDataAdapter): Promise<void> {
  const sessions = getAllSessions().filter((s) => s.babyId && s.onboardingStep === "complete");

  for (const session of sessions) {
    try {
      await checkFeedReminder(bot, db, session.telegramUserId, session.babyId!);
    } catch (e) {
      console.error(`Reminder error for user ${session.telegramUserId}:`, e);
    }
  }
}

async function checkFeedReminder(
  bot: Telegraf,
  db: IDataAdapter,
  telegramUserId: string,
  babyId: string
): Promise<void> {
  const baby = await db.getBaby(babyId);
  if (!baby) return;

  const lastFeed = await db.getLastLog(babyId, "feed");
  if (!lastFeed) {
    // No feed logged at all — only nudge once per session (check if we already sent)
    return;
  }

  const hoursSince = (Date.now() - new Date(lastFeed.timestamp).getTime()) / 3600_000;

  if (hoursSince >= FEED_REMINDER_HOURS) {
    const message =
      `⏰ Just checking in — it's been ${hoursSince.toFixed(1)} hours since ${baby.name}'s last logged feed.\n\nHave you fed her recently? Just let me know and I'll log it! 🍼`;

    await bot.telegram.sendMessage(telegramUserId, message);
  }
}

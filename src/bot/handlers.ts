import type { Telegraf, Context } from "telegraf";
import type { Pool } from "pg";
import type { IDataAdapter } from "../data/adapter.interface.js";
import { getSession, clearSession } from "./session.js";
import { runAgentTurn } from "../agent/index.js";
import { ingestPdf, ingestUrl } from "../rag/ingest.js";
import { ONBOARDING_WELCOME } from "../agent/prompts.js";

function userId(ctx: Context): string {
  return String(ctx.from?.id ?? "unknown");
}

export function registerHandlers(bot: Telegraf, db: IDataAdapter, pgPool: Pool | null): void {
  // /start — begin or reset onboarding
  bot.command("start", async (ctx) => {
    const uid = userId(ctx);
    clearSession(uid);
    const session = getSession(uid);
    session.onboardingStep = "awaiting_name";
    await ctx.reply(ONBOARDING_WELCOME, { parse_mode: "Markdown" });
  });

  // /summary — shortcut
  bot.command("summary", async (ctx) => {
    const uid = userId(ctx);
    const session = getSession(uid);
    if (!session.babyId) {
      await ctx.reply("Please complete setup first with /start");
      return;
    }
    const reply = await runAgentTurn("Can you give me a summary of everything logged today?", session, { db, pgPool });
    await ctx.reply(reply, { parse_mode: "Markdown" });
  });

  // /concerns — shortcut
  bot.command("concerns", async (ctx) => {
    const uid = userId(ctx);
    const session = getSession(uid);
    if (!session.babyId) {
      await ctx.reply("Please complete setup first with /start");
      return;
    }
    const reply = await runAgentTurn("Please check for any concerns based on recent logs.", session, { db, pgPool });
    await ctx.reply(reply, { parse_mode: "Markdown" });
  });

  // /upload — prompt for file or URL
  bot.command("upload", async (ctx) => {
    const uid = userId(ctx);
    const session = getSession(uid);
    if (!session.babyId) {
      await ctx.reply("Please complete setup first with /start");
      return;
    }
    await ctx.reply(
      "📎 Send me a PDF file or paste a URL and I'll add it to your reference library.\n\nYou can also just send the file directly without using /upload."
    );
  });

  // /reset — clear session and data
  bot.command("reset", async (ctx) => {
    clearSession(userId(ctx));
    await ctx.reply("Session cleared. Use /start to begin again.");
  });

  // Document upload (PDF)
  bot.on("document", async (ctx) => {
    const uid = userId(ctx);
    const session = getSession(uid);
    if (!session.babyId) {
      await ctx.reply("Please complete setup first with /start");
      return;
    }
    if (!pgPool) {
      await ctx.reply("Reference document storage isn't configured yet (DATABASE_URL missing).");
      return;
    }

    const doc = ctx.message.document;
    if (!doc.mime_type?.includes("pdf")) {
      await ctx.reply("Only PDF files are supported right now.");
      return;
    }

    await ctx.reply("⏳ Processing your document...");
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const { default: fetch } = await import("node-fetch");
      const res = await fetch(fileLink.href);
      const buffer = Buffer.from(await res.arrayBuffer());

      const refDoc = await db.createDoc({ ownerId: uid, fileName: doc.file_name });
      const chunkCount = await ingestPdf(buffer, refDoc.id, uid, pgPool);
      await ctx.reply(`✅ Added "${doc.file_name}" to your reference library (${chunkCount} sections indexed).`);
    } catch (e) {
      console.error("PDF ingest error:", e);
      await ctx.reply("Sorry, I couldn't process that PDF. Please try again.");
    }
  });

  // Text messages — onboarding flow or agent turn
  bot.on("text", async (ctx) => {
    const uid = userId(ctx);
    const session = getSession(uid);
    const text = ctx.message.text;

    // Check if text looks like a URL for RAG ingest
    if (session.babyId && /^https?:\/\//i.test(text) && pgPool) {
      await ctx.reply("⏳ Fetching and indexing that URL...");
      try {
        const refDoc = await db.createDoc({ ownerId: uid, sourceUrl: text });
        const chunkCount = await ingestUrl(text, refDoc.id, uid, pgPool);
        await ctx.reply(`✅ Added that article to your reference library (${chunkCount} sections indexed).`);
      } catch (e) {
        console.error("URL ingest error:", e);
        await ctx.reply("Sorry, I couldn't fetch that URL. Please check it and try again.");
      }
      return;
    }

    // Onboarding flow
    if (session.onboardingStep && session.onboardingStep !== "complete") {
      await handleOnboarding(ctx, text, uid, session, db);
      return;
    }

    // Normal agent turn
    try {
      const reply = await runAgentTurn(text, session, { db, pgPool });
      await ctx.reply(reply, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Agent error:", e);
      await ctx.reply("Sorry, something went wrong. Please try again.");
    }
  });
}

async function handleOnboarding(
  ctx: Context,
  text: string,
  uid: string,
  session: ReturnType<typeof getSession>,
  db: IDataAdapter
): Promise<void> {
  switch (session.onboardingStep) {
    case "awaiting_name": {
      session.pendingBabyName = text.trim();
      session.onboardingStep = "awaiting_dob";
      await ctx.reply(
        `Lovely name! 🥰 When was *${session.pendingBabyName}* born?\n\nPlease send the date in format: *DD/MM/YYYY*`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "awaiting_dob": {
      const match = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (!match) {
        await ctx.reply("I didn't quite catch that date. Please use the format *DD/MM/YYYY* — for example, 01/03/2025", {
          parse_mode: "Markdown",
        });
        return;
      }
      const [, day, month, year] = match;
      const dob = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
      if (isNaN(Date.parse(dob))) {
        await ctx.reply("That doesn't look like a valid date. Please try again with *DD/MM/YYYY*", { parse_mode: "Markdown" });
        return;
      }
      session.onboardingStep = "awaiting_feeding_method";
      (session as unknown as Record<string, unknown>)._pendingDob = dob;
      await ctx.reply(
        `And how are you feeding *${session.pendingBabyName}*?\n\nReply with:\n• *breast* — breastfeeding\n• *bottle* — formula or expressed milk\n• *both* — mixed`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "awaiting_feeding_method": {
      const method = text.toLowerCase().trim();
      if (!["breast", "bottle", "both"].includes(method)) {
        await ctx.reply("Please reply with *breast*, *bottle*, or *both*", { parse_mode: "Markdown" });
        return;
      }
      const dob = (session as unknown as Record<string, unknown>)._pendingDob as string;
      const baby = await db.createBaby(uid, {
        name: session.pendingBabyName!,
        dateOfBirth: dob,
        feedingMethod: method as "breast" | "bottle" | "both",
      });
      session.babyId = baby.id;
      session.onboardingStep = "complete";
      delete (session as unknown as Record<string, unknown>)._pendingDob;
      delete session.pendingBabyName;

      await ctx.reply(
        `You're all set! 🎉\n\nI'm here to help you track *${baby.name}*'s feeds, nappies, and sleep.\n\nYou can talk to me naturally — for example:\n• _"Just fed for 20 minutes on the left"_\n• _"She just pooped — yellow and seedy"_\n• _"She woke up"_\n• _"What did we do today?"_\n\nUse /summary for a daily overview or /upload to add reference documents.`,
        { parse_mode: "Markdown" }
      );
      break;
    }
  }
}

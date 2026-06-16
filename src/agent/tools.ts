import type Anthropic from "@anthropic-ai/sdk";
import type { Pool } from "pg";
import type { IDataAdapter } from "../data/adapter.interface.js";
import type { FeedMetadata, PoopMetadata, WakeWindowMetadata } from "../data/types.js";
import { checkConcerns } from "./concerns.js";
import { retrieveRelevantChunks } from "../rag/retrieval.js";

export interface ToolContext {
  babyId: string;
  ownerId: string;
  db: IDataAdapter;
  pgPool: Pool | null; // null when DATABASE_URL not configured
}

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "log_feed",
    description: "Log a feeding event for the baby. Call this when the mother mentions feeding, nursing, breastfeeding, bottle feeding, or pumping.",
    input_schema: {
      type: "object" as const,
      properties: {
        method: { type: "string", enum: ["breast", "bottle", "both"], description: "How the baby was fed" },
        durationMinutes: { type: "number", description: "How long the feed lasted in minutes" },
        volumeMl: { type: "number", description: "Volume in ml if bottle fed" },
        side: { type: "string", enum: ["left", "right", "both"], description: "Which breast if breastfeeding" },
        timestamp: { type: "string", description: "ISO datetime of the feed, defaults to now if omitted" },
      },
      required: ["method"],
    },
  },
  {
    name: "log_poop",
    description: "Log a nappy/diaper change with poop. Call this when the mother mentions a dirty nappy, poop, or bowel movement.",
    input_schema: {
      type: "object" as const,
      properties: {
        consistency: { type: "string", enum: ["watery", "seedy", "pasty", "formed", "hard"] },
        color: { type: "string", enum: ["yellow", "green", "brown", "black", "red", "white"] },
        volume: { type: "string", enum: ["small", "medium", "large"] },
        timestamp: { type: "string", description: "ISO datetime, defaults to now" },
      },
      required: ["consistency", "color", "volume"],
    },
  },
  {
    name: "log_wake_window",
    description: "Log when the baby woke up or fell asleep. Call this when the mother mentions the baby waking, sleeping, or napping.",
    input_schema: {
      type: "object" as const,
      properties: {
        event: { type: "string", enum: ["woke", "slept"], description: "Whether the baby just woke up or just fell asleep" },
        timestamp: { type: "string", description: "ISO datetime, defaults to now" },
      },
      required: ["event"],
    },
  },
  {
    name: "get_today_summary",
    description: "Get a summary of all logged activities (feeds, poops, sleep) for the last 24 hours.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "search_reference_docs",
    description: "Search the mother's uploaded reference documents (parenting guides, doctor recommendations, articles) for relevant information. Always use this before answering parenting or development questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The question or topic to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "check_concerns",
    description: "Analyse recent logs for potential health or development concerns. Call this proactively if something seems off, or when explicitly asked.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  switch (name) {
    case "log_feed": {
      const metadata: FeedMetadata = {
        method: input.method as FeedMetadata["method"],
        durationMinutes: input.durationMinutes as number | undefined,
        volumeMl: input.volumeMl as number | undefined,
        side: input.side as FeedMetadata["side"] | undefined,
      };
      const log = await ctx.db.createLog({
        babyId: ctx.babyId,
        type: "feed",
        timestamp: (input.timestamp as string | undefined) ?? new Date().toISOString(),
        metadata,
      });
      return JSON.stringify({ success: true, logId: log.id, timestamp: log.timestamp });
    }

    case "log_poop": {
      const metadata: PoopMetadata = {
        consistency: input.consistency as PoopMetadata["consistency"],
        color: input.color as PoopMetadata["color"],
        volume: input.volume as PoopMetadata["volume"],
      };
      const log = await ctx.db.createLog({
        babyId: ctx.babyId,
        type: "poop",
        timestamp: (input.timestamp as string | undefined) ?? new Date().toISOString(),
        metadata,
      });
      return JSON.stringify({ success: true, logId: log.id, timestamp: log.timestamp });
    }

    case "log_wake_window": {
      const event = input.event as "woke" | "slept";
      const ts = (input.timestamp as string | undefined) ?? new Date().toISOString();

      if (event === "woke") {
        const metadata: WakeWindowMetadata = { wokeAt: ts };
        const log = await ctx.db.createLog({
          babyId: ctx.babyId,
          type: "wake_window",
          timestamp: ts,
          metadata,
        });
        return JSON.stringify({ success: true, logId: log.id, event: "woke", timestamp: ts });
      } else {
        // Close the last open wake window
        const lastWake = await ctx.db.getLastLog(ctx.babyId, "wake_window");
        if (lastWake) {
          const meta = lastWake.metadata as WakeWindowMetadata;
          if (!meta.sleptAt) {
            meta.sleptAt = ts;
            const durationMin = Math.round((new Date(ts).getTime() - new Date(meta.wokeAt).getTime()) / 60_000);
            return JSON.stringify({ success: true, event: "slept", timestamp: ts, awakeMinutes: durationMin });
          }
        }
        const log = await ctx.db.createLog({
          babyId: ctx.babyId,
          type: "wake_window",
          timestamp: ts,
          metadata: { wokeAt: ts, sleptAt: ts } as WakeWindowMetadata,
        });
        return JSON.stringify({ success: true, logId: log.id, event: "slept", timestamp: ts });
      }
    }

    case "get_today_summary": {
      const logs = await ctx.db.getLogs(ctx.babyId, undefined, 24);
      const feeds = logs.filter((l) => l.type === "feed");
      const poops = logs.filter((l) => l.type === "poop");
      const wakes = logs.filter((l) => l.type === "wake_window");

      const formatTime = (iso: string) =>
        new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

      const summary = {
        feedCount: feeds.length,
        feeds: feeds.map((l) => {
          const m = l.metadata as FeedMetadata;
          return `${formatTime(l.timestamp)} — ${m.method}${m.side ? ` (${m.side})` : ""}${m.durationMinutes ? ` for ${m.durationMinutes}min` : ""}${m.volumeMl ? ` ${m.volumeMl}ml` : ""}`;
        }),
        poopCount: poops.length,
        poops: poops.map((l) => {
          const m = l.metadata as PoopMetadata;
          return `${formatTime(l.timestamp)} — ${m.color}, ${m.consistency}, ${m.volume}`;
        }),
        wakeWindows: wakes.map((l) => {
          const m = l.metadata as WakeWindowMetadata;
          const awake = m.sleptAt
            ? `${Math.round((new Date(m.sleptAt).getTime() - new Date(m.wokeAt).getTime()) / 60_000)}min awake`
            : "still awake";
          return `Woke ${formatTime(m.wokeAt)}${m.sleptAt ? `, slept ${formatTime(m.sleptAt)}` : ""} (${awake})`;
        }),
      };
      return JSON.stringify(summary);
    }

    case "search_reference_docs": {
      if (!ctx.pgPool) {
        return JSON.stringify({ results: [], note: "No database configured — upload documents to enable reference search." });
      }
      const query = input.query as string;
      const chunks = await retrieveRelevantChunks(query, ctx.ownerId, ctx.pgPool);
      return JSON.stringify({ results: chunks });
    }

    case "check_concerns": {
      const baby = await ctx.db.getBaby(ctx.babyId);
      if (!baby) return JSON.stringify({ concerns: [], error: "Baby profile not found" });
      const logs = await ctx.db.getLogs(ctx.babyId, undefined, 48);
      const concerns = checkConcerns(baby, logs);
      return JSON.stringify({ concerns });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

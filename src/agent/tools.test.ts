import { describe, it, expect, beforeEach } from "vitest";
import { dispatchTool } from "./tools.js";
import { MockDataAdapter } from "../data/mock.adapter.js";
import type { ToolContext } from "./tools.js";

async function makeCtx(): Promise<{ ctx: ToolContext; db: MockDataAdapter }> {
  const db = new MockDataAdapter();
  const baby = await db.createBaby("user1", { name: "Emma", dateOfBirth: "2025-03-01" });
  const ctx: ToolContext = {
    babyId: baby.id,
    ownerId: "user1",
    db,
    pgPool: null,
  };
  return { ctx, db };
}

describe("dispatchTool — log_feed", () => {
  it("creates a feed log and returns success", async () => {
    const { ctx } = await makeCtx();
    const result = JSON.parse(await dispatchTool("log_feed", { method: "breast", durationMinutes: 15, side: "left" }, ctx));
    expect(result.success).toBe(true);
    expect(result.logId).toBeTruthy();
  });
});

describe("dispatchTool — log_poop", () => {
  it("creates a poop log", async () => {
    const { ctx } = await makeCtx();
    const result = JSON.parse(await dispatchTool("log_poop", { consistency: "seedy", color: "yellow", volume: "medium" }, ctx));
    expect(result.success).toBe(true);
  });
});

describe("dispatchTool — log_wake_window", () => {
  it("logs woke event", async () => {
    const { ctx } = await makeCtx();
    const result = JSON.parse(await dispatchTool("log_wake_window", { event: "woke" }, ctx));
    expect(result.success).toBe(true);
    expect(result.event).toBe("woke");
  });
});

describe("dispatchTool — get_today_summary", () => {
  it("returns summary with counts", async () => {
    const { ctx } = await makeCtx();
    await dispatchTool("log_feed", { method: "breast" }, ctx);
    await dispatchTool("log_feed", { method: "bottle", volumeMl: 90 }, ctx);
    await dispatchTool("log_poop", { consistency: "seedy", color: "yellow", volume: "small" }, ctx);

    const result = JSON.parse(await dispatchTool("get_today_summary", {}, ctx));
    expect(result.feedCount).toBe(2);
    expect(result.poopCount).toBe(1);
  });
});

describe("dispatchTool — check_concerns", () => {
  it("returns concerns array", async () => {
    const { ctx } = await makeCtx();
    const result = JSON.parse(await dispatchTool("check_concerns", {}, ctx));
    expect(Array.isArray(result.concerns)).toBe(true);
  });
});

describe("dispatchTool — search_reference_docs without db", () => {
  it("returns graceful message when no pgPool", async () => {
    const { ctx } = await makeCtx();
    const result = JSON.parse(await dispatchTool("search_reference_docs", { query: "how often to feed" }, ctx));
    expect(result.note).toBeTruthy();
  });
});

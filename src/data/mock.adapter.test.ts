import { describe, it, expect, beforeEach } from "vitest";
import { MockDataAdapter } from "./mock.adapter.js";

describe("MockDataAdapter", () => {
  let db: MockDataAdapter;

  beforeEach(() => {
    db = new MockDataAdapter();
  });

  it("creates and retrieves a baby", async () => {
    const baby = await db.createBaby("user1", { name: "Emma", dateOfBirth: "2025-01-01" });
    expect(baby.id).toBeTruthy();
    expect(baby.name).toBe("Emma");
    const fetched = await db.getBaby(baby.id);
    expect(fetched?.name).toBe("Emma");
  });

  it("lists babies by owner", async () => {
    await db.createBaby("user1", { name: "Emma", dateOfBirth: "2025-01-01" });
    await db.createBaby("user2", { name: "Jack", dateOfBirth: "2025-02-01" });
    const babies = await db.listBabies("user1");
    expect(babies).toHaveLength(1);
    expect(babies[0]!.name).toBe("Emma");
  });

  it("creates and retrieves logs", async () => {
    const baby = await db.createBaby("user1", { name: "Emma", dateOfBirth: "2025-01-01" });
    await db.createLog({
      babyId: baby.id,
      type: "feed",
      timestamp: new Date().toISOString(),
      metadata: { method: "breast", durationMinutes: 15, side: "left" },
    });
    const logs = await db.getLogs(baby.id, "feed");
    expect(logs).toHaveLength(1);
  });

  it("getLastLog returns most recent log", async () => {
    const baby = await db.createBaby("user1", { name: "Emma", dateOfBirth: "2025-01-01" });
    const t1 = new Date(Date.now() - 3600_000).toISOString();
    const t2 = new Date().toISOString();
    await db.createLog({ babyId: baby.id, type: "feed", timestamp: t1, metadata: { method: "breast" } });
    const log2 = await db.createLog({ babyId: baby.id, type: "feed", timestamp: t2, metadata: { method: "bottle", volumeMl: 90 } });
    const last = await db.getLastLog(baby.id, "feed");
    expect(last?.id).toBe(log2.id);
  });

  it("filters logs by sinceHours", async () => {
    const baby = await db.createBaby("user1", { name: "Emma", dateOfBirth: "2025-01-01" });
    const old = await db.createLog({
      babyId: baby.id,
      type: "feed",
      timestamp: new Date(Date.now() - 10 * 3600_000).toISOString(),
      metadata: { method: "breast" },
    });
    await db.createLog({
      babyId: baby.id,
      type: "feed",
      timestamp: new Date().toISOString(),
      metadata: { method: "breast" },
    });
    const recent = await db.getLogs(baby.id, "feed", 5);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.id).not.toBe(old.id);
  });
});

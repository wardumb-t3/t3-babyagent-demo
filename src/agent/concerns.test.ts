import { describe, it, expect } from "vitest";
import { checkConcerns } from "./concerns.js";
import type { BabyProfile, BabyLog } from "../data/types.js";
import { randomUUID } from "crypto";

function makeBaby(overrides: Partial<BabyProfile> = {}): BabyProfile {
  const dob = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10); // 1 week old
  return {
    id: randomUUID(),
    ownerId: "user1",
    name: "Emma",
    dateOfBirth: dob,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLog(type: BabyLog["type"], metadata: BabyLog["metadata"], hoursAgo = 0): BabyLog {
  return {
    id: randomUUID(),
    babyId: "baby1",
    type,
    timestamp: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
    metadata,
    createdAt: new Date().toISOString(),
  };
}

describe("checkConcerns", () => {
  it("returns no concerns when recent feed logged", () => {
    const baby = makeBaby();
    const logs = [makeLog("feed", { method: "breast" }, 1)];
    const concerns = checkConcerns(baby, logs);
    expect(concerns.filter((c) => c.type === "overdue_feed" || c.type === "feed_due")).toHaveLength(0);
  });

  it("flags warning when feed is overdue for newborn (>3h)", () => {
    const baby = makeBaby({ dateOfBirth: new Date(Date.now() - 10 * 24 * 3600_000).toISOString().slice(0, 10) });
    const logs = [makeLog("feed", { method: "breast" }, 3.5)];
    const concerns = checkConcerns(baby, logs);
    const feedConcern = concerns.find((c) => c.type === "feed_due" || c.type === "overdue_feed");
    expect(feedConcern).toBeTruthy();
  });

  it("flags urgent for abnormal poop color (black)", () => {
    const baby = makeBaby();
    const logs = [
      makeLog("feed", { method: "breast" }, 1),
      makeLog("poop", { consistency: "watery", color: "black", volume: "small" }, 0.5),
    ];
    const concerns = checkConcerns(baby, logs);
    const urgent = concerns.find((c) => c.severity === "urgent" && c.type === "abnormal_poop_color");
    expect(urgent).toBeTruthy();
  });

  it("flags urgent for red poop", () => {
    const baby = makeBaby();
    const logs = [
      makeLog("feed", { method: "breast" }, 1),
      makeLog("poop", { consistency: "watery", color: "red", volume: "small" }, 0.5),
    ];
    const concerns = checkConcerns(baby, logs);
    expect(concerns.find((c) => c.type === "abnormal_poop_color")?.severity).toBe("urgent");
  });

  it("flags long wake window for young baby", () => {
    const baby = makeBaby(); // 1 week old
    const wokeAt = new Date(Date.now() - 100 * 60_000).toISOString(); // 100 min ago
    const logs = [
      makeLog("feed", { method: "breast" }, 1),
      { ...makeLog("wake_window", { wokeAt }, 100 / 60), metadata: { wokeAt } },
    ];
    const concerns = checkConcerns(baby, logs);
    expect(concerns.find((c) => c.type === "long_wake_window")).toBeTruthy();
  });

  it("returns no wake window concern when baby slept", () => {
    const baby = makeBaby();
    const wokeAt = new Date(Date.now() - 100 * 60_000).toISOString();
    const sleptAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const logs = [
      makeLog("feed", { method: "breast" }, 1),
      { ...makeLog("wake_window", { wokeAt, sleptAt }, 100 / 60), metadata: { wokeAt, sleptAt } },
    ];
    const concerns = checkConcerns(baby, logs);
    expect(concerns.find((c) => c.type === "long_wake_window")).toBeFalsy();
  });
});

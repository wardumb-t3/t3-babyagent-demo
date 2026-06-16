import { randomUUID } from "crypto";
import type { IDataAdapter } from "./adapter.interface.js";
import type { BabyProfile, BabyLog, LogType, ReferenceDoc } from "./types.js";

export class MockDataAdapter implements IDataAdapter {
  private babies = new Map<string, BabyProfile>();
  private logs = new Map<string, BabyLog>();
  private docs = new Map<string, ReferenceDoc>();

  async createBaby(ownerId: string, data: Omit<BabyProfile, "id" | "ownerId" | "createdAt">): Promise<BabyProfile> {
    const baby: BabyProfile = {
      id: randomUUID(),
      ownerId,
      createdAt: new Date().toISOString(),
      ...data,
    };
    this.babies.set(baby.id, baby);
    return baby;
  }

  async getBaby(babyId: string): Promise<BabyProfile | null> {
    return this.babies.get(babyId) ?? null;
  }

  async listBabies(ownerId: string): Promise<BabyProfile[]> {
    return Array.from(this.babies.values()).filter((b) => b.ownerId === ownerId);
  }

  async createLog(data: Omit<BabyLog, "id" | "createdAt">): Promise<BabyLog> {
    const log: BabyLog = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    };
    this.logs.set(log.id, log);
    return log;
  }

  async getLogs(babyId: string, type?: LogType, sinceHours?: number): Promise<BabyLog[]> {
    const cutoff = sinceHours ? new Date(Date.now() - sinceHours * 3600_000) : null;
    return Array.from(this.logs.values()).filter((l) => {
      if (l.babyId !== babyId) return false;
      if (type && l.type !== type) return false;
      if (cutoff && new Date(l.timestamp) < cutoff) return false;
      return true;
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async getLastLog(babyId: string, type: LogType): Promise<BabyLog | null> {
    const logs = await this.getLogs(babyId, type);
    return logs[logs.length - 1] ?? null;
  }

  async createDoc(data: Omit<ReferenceDoc, "id" | "createdAt">): Promise<ReferenceDoc> {
    const doc: ReferenceDoc = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    };
    this.docs.set(doc.id, doc);
    return doc;
  }

  async listDocs(ownerId: string): Promise<ReferenceDoc[]> {
    return Array.from(this.docs.values()).filter((d) => d.ownerId === ownerId);
  }

  // Test helper: directly set a log's timestamp (e.g. to simulate old logs for scheduler tests)
  setLogTimestamp(logId: string, timestamp: string): void {
    const log = this.logs.get(logId);
    if (log) log.timestamp = timestamp;
  }
}

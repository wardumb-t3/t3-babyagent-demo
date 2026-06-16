import type { BabyProfile, BabyLog, LogType, ReferenceDoc } from "./types.js";
import { MockDataAdapter } from "./mock.adapter.js";
import { Terminal3DataAdapter } from "./terminal3.adapter.js";

export interface IDataAdapter {
  // Baby profiles
  createBaby(ownerId: string, data: Omit<BabyProfile, "id" | "ownerId" | "createdAt">): Promise<BabyProfile>;
  getBaby(babyId: string): Promise<BabyProfile | null>;
  listBabies(ownerId: string): Promise<BabyProfile[]>;

  // Logs
  createLog(data: Omit<BabyLog, "id" | "createdAt">): Promise<BabyLog>;
  getLogs(babyId: string, type?: LogType, sinceHours?: number): Promise<BabyLog[]>;
  getLastLog(babyId: string, type: LogType): Promise<BabyLog | null>;

  // Reference docs metadata (chunks stored in pgvector separately)
  createDoc(data: Omit<ReferenceDoc, "id" | "createdAt">): Promise<ReferenceDoc>;
  listDocs(ownerId: string): Promise<ReferenceDoc[]>;
}

export function createDataAdapter(): IDataAdapter {
  if (process.env.TERMINAL3_ENABLED === "true") {
    return new Terminal3DataAdapter();
  }
  return new MockDataAdapter();
}

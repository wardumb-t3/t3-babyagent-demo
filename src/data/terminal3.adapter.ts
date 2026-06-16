import type { IDataAdapter } from "./adapter.interface.js";
import type { BabyProfile, BabyLog, LogType, ReferenceDoc } from "./types.js";

/**
 * Terminal3 ADK adapter for storing sensitive baby profiles and logs.
 * Stub implementation — fill in once Terminal3 ADK docs / SDK are confirmed.
 * See: https://docs.terminal3.io/developers/adk/overview/what-is-adk
 */
export class Terminal3DataAdapter implements IDataAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const baseUrl = process.env.TERMINAL3_BASE_URL;
    const apiKey = process.env.TERMINAL3_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("TERMINAL3_BASE_URL and TERMINAL3_API_KEY must be set when TERMINAL3_ENABLED=true");
    }
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // TODO: replace stub calls with actual Terminal3 ADK SDK calls
  private async request<T>(path: string, options: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<T> {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      body: options.body,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Terminal3 API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async createBaby(ownerId: string, data: Omit<BabyProfile, "id" | "ownerId" | "createdAt">): Promise<BabyProfile> {
    return this.request<BabyProfile>("/babies", {
      method: "POST",
      body: JSON.stringify({ ownerId, ...data }),
    });
  }

  async getBaby(babyId: string): Promise<BabyProfile | null> {
    try {
      return await this.request<BabyProfile>(`/babies/${babyId}`);
    } catch {
      return null;
    }
  }

  async listBabies(ownerId: string): Promise<BabyProfile[]> {
    return this.request<BabyProfile[]>(`/babies?ownerId=${encodeURIComponent(ownerId)}`);
  }

  async createLog(data: Omit<BabyLog, "id" | "createdAt">): Promise<BabyLog> {
    return this.request<BabyLog>("/logs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getLogs(babyId: string, type?: LogType, sinceHours?: number): Promise<BabyLog[]> {
    const params = new URLSearchParams({ babyId });
    if (type) params.set("type", type);
    if (sinceHours) params.set("sinceHours", String(sinceHours));
    return this.request<BabyLog[]>(`/logs?${params}`);
  }

  async getLastLog(babyId: string, type: LogType): Promise<BabyLog | null> {
    try {
      return await this.request<BabyLog>(`/logs/last?babyId=${babyId}&type=${type}`);
    } catch {
      return null;
    }
  }

  async createDoc(data: Omit<ReferenceDoc, "id" | "createdAt">): Promise<ReferenceDoc> {
    return this.request<ReferenceDoc>("/docs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listDocs(ownerId: string): Promise<ReferenceDoc[]> {
    return this.request<ReferenceDoc[]>(`/docs?ownerId=${encodeURIComponent(ownerId)}`);
  }
}

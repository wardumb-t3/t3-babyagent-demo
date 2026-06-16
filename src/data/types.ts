export interface BabyProfile {
  id: string;
  ownerId: string; // Telegram user ID (string)
  name: string;
  dateOfBirth: string; // ISO date YYYY-MM-DD
  weightKg?: number;
  feedingMethod?: "breast" | "bottle" | "both";
  notes?: string;
  createdAt: string;
}

export type LogType = "feed" | "poop" | "wake_window";

export interface FeedMetadata {
  method: "breast" | "bottle" | "both";
  durationMinutes?: number;
  volumeMl?: number;
  side?: "left" | "right" | "both";
}

export interface PoopMetadata {
  consistency: "watery" | "seedy" | "pasty" | "formed" | "hard";
  color: "yellow" | "green" | "brown" | "black" | "red" | "white";
  volume: "small" | "medium" | "large";
}

export interface WakeWindowMetadata {
  wokeAt: string; // ISO datetime
  sleptAt?: string; // ISO datetime, absent if still awake
}

export type LogMetadata = FeedMetadata | PoopMetadata | WakeWindowMetadata;

export interface BabyLog {
  id: string;
  babyId: string;
  type: LogType;
  timestamp: string; // ISO datetime of the event
  metadata: LogMetadata;
  createdAt: string;
}

export interface ReferenceDoc {
  id: string;
  ownerId: string;
  sourceUrl?: string;
  fileName?: string;
  createdAt: string;
}

export interface ConversationContext {
  telegramUserId: string;
  babyId: string | null; // null until onboarding complete
  onboardingStep?: "awaiting_name" | "awaiting_dob" | "awaiting_feeding_method" | "complete";
  pendingBabyName?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

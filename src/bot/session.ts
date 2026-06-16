import type { ConversationContext } from "../data/types.js";

const sessions = new Map<string, ConversationContext>();

export function getSession(telegramUserId: string): ConversationContext {
  let session = sessions.get(telegramUserId);
  if (!session) {
    session = {
      telegramUserId,
      babyId: null,
      onboardingStep: "awaiting_name",
      messages: [],
    };
    sessions.set(telegramUserId, session);
  }
  return session;
}

export function clearSession(telegramUserId: string): void {
  sessions.delete(telegramUserId);
}

// Expose for scheduler use
export function getAllSessions(): ConversationContext[] {
  return Array.from(sessions.values());
}

import type { BabyLog, BabyProfile, PoopMetadata } from "../data/types.js";

export type ConcernSeverity = "info" | "warning" | "urgent";

export interface Concern {
  type: string;
  severity: ConcernSeverity;
  message: string;
}

export function checkConcerns(baby: BabyProfile, recentLogs: BabyLog[]): Concern[] {
  const concerns: Concern[] = [];
  const now = Date.now();

  const ageWeeks = Math.floor((now - new Date(baby.dateOfBirth).getTime()) / (7 * 24 * 3600_000));
  const isNewborn = ageWeeks < 4;

  // --- Feed checks ---
  const feedLogs = recentLogs.filter((l) => l.type === "feed");
  const lastFeed = feedLogs[feedLogs.length - 1];

  if (!lastFeed) {
    concerns.push({
      type: "no_feed_logged",
      severity: "info",
      message: "No feed has been logged yet. Have you fed your baby recently?",
    });
  } else {
    const hoursSinceLastFeed = (now - new Date(lastFeed.timestamp).getTime()) / 3600_000;
    const feedThreshold = isNewborn ? 3 : 4;
    if (hoursSinceLastFeed > feedThreshold + 1) {
      concerns.push({
        type: "overdue_feed",
        severity: "urgent",
        message: `It's been ${hoursSinceLastFeed.toFixed(1)} hours since the last feed. ${isNewborn ? "Newborns need feeding every 2–3 hours." : "Babies this age typically feed every 3–4 hours."}`,
      });
    } else if (hoursSinceLastFeed > feedThreshold) {
      concerns.push({
        type: "feed_due",
        severity: "warning",
        message: `It's been ${hoursSinceLastFeed.toFixed(1)} hours since the last feed — ${baby.name} may be due for a feed soon.`,
      });
    }
  }

  // --- Poop checks (last 24h) ---
  const last24hPoops = recentLogs.filter(
    (l) => l.type === "poop" && new Date(l.timestamp).getTime() > now - 24 * 3600_000
  );

  // Abnormal colors — urgent
  const urgentPoopColors = ["red", "black", "white"] as const;
  for (const log of last24hPoops) {
    const meta = log.metadata as PoopMetadata;
    if (urgentPoopColors.includes(meta.color as (typeof urgentPoopColors)[number])) {
      concerns.push({
        type: "abnormal_poop_color",
        severity: "urgent",
        message: `A ${meta.color} poop was logged — this color can indicate a medical issue. Please contact your doctor or health visitor today.`,
      });
    }
  }

  // Low poop frequency
  if (isNewborn && baby.feedingMethod !== "breast" && last24hPoops.length === 0) {
    concerns.push({
      type: "no_poop",
      severity: "warning",
      message: "No poop logged in the last 24 hours. Formula-fed newborns typically poop at least once a day.",
    });
  }

  // --- Wake window checks (last logged wake window) ---
  const wakeLogs = recentLogs.filter((l) => l.type === "wake_window");
  const lastWake = wakeLogs[wakeLogs.length - 1];
  if (lastWake && ageWeeks < 13) {
    const meta = lastWake.metadata as { wokeAt: string; sleptAt?: string };
    if (!meta.sleptAt) {
      const minutesAwake = (now - new Date(meta.wokeAt).getTime()) / 60_000;
      if (minutesAwake > 90) {
        concerns.push({
          type: "long_wake_window",
          severity: "info",
          message: `${baby.name} has been awake for ${Math.round(minutesAwake)} minutes. Babies under 3 months typically need sleep after 60–90 minutes of wake time.`,
        });
      }
    }
  }

  return concerns;
}

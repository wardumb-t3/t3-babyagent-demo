import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().optional(),
  TERMINAL3_ENABLED: z.enum(["true", "false"]).default("false"),
  TERMINAL3_API_KEY: z.string().optional(),
  TERMINAL3_BASE_URL: z.string().optional(),
  EMBEDDINGS_PROVIDER: z.enum(["local", "openai"]).default("local"),
  OPENAI_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const config = envSchema.parse(process.env);

export const isTerminal3Enabled = config.TERMINAL3_ENABLED === "true";
export const isProduction = config.NODE_ENV === "production";

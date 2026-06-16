// Set required env vars for tests that don't need real credentials
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test-token";
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER ?? "groq";
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? "test-key";
process.env.EMBEDDINGS_PROVIDER = process.env.EMBEDDINGS_PROVIDER ?? "local";

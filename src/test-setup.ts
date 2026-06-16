// Set required env vars for tests that don't need real credentials
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test-token";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "test-key";
process.env.EMBEDDINGS_PROVIDER = process.env.EMBEDDINGS_PROVIDER ?? "local";

import type { Pool } from "pg";
import type { IDataAdapter } from "../data/adapter.interface.js";
import type { ConversationContext } from "../data/types.js";
import { config } from "../config.js";
import { buildSystemPrompt } from "./prompts.js";
import { toolDefinitions, dispatchTool } from "./tools.js";

const MAX_TOOL_ITERATIONS = 10;

export interface AgentDeps {
  db: IDataAdapter;
  pgPool: Pool | null;
}

export async function runAgentTurn(
  userMessage: string,
  context: ConversationContext,
  deps: AgentDeps
): Promise<string> {
  if (!context.babyId) {
    return "I don't have your baby's details yet. Please complete setup first by using /start.";
  }

  const baby = await deps.db.getBaby(context.babyId);
  if (!baby) {
    return "I couldn't find your baby's profile. Please use /start to set up again.";
  }

  const systemPrompt = buildSystemPrompt(baby.name, baby.dateOfBirth);

  if (config.LLM_PROVIDER === "groq") {
    return runWithGroq(userMessage, context, deps, systemPrompt);
  }
  return runWithClaude(userMessage, context, deps, systemPrompt);
}

// ── Claude (Anthropic) ────────────────────────────────────────────────────────

async function runWithClaude(
  userMessage: string,
  context: ConversationContext,
  deps: AgentDeps,
  systemPrompt: string
): Promise<string> {
  if (!config.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude");

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  type InternalMessage =
    | { role: "user" | "assistant"; content: string }
    | { role: "user" | "assistant"; content: import("@anthropic-ai/sdk").Anthropic.ContentBlock[] | import("@anthropic-ai/sdk").Anthropic.ToolResultBlockParam[] };

  const history: InternalMessage[] = [
    ...context.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools: toolDefinitions as import("@anthropic-ai/sdk").Anthropic.Tool[],
      messages: history as import("@anthropic-ai/sdk").Anthropic.MessageParam[],
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const reply = textBlock?.type === "text" ? textBlock.text : "I'm not sure how to respond to that.";
      context.messages.push({ role: "user", content: userMessage });
      context.messages.push({ role: "assistant", content: reply });
      return reply;
    }

    if (response.stop_reason === "tool_use") {
      history.push({ role: "assistant", content: response.content });
      const toolResults: import("@anthropic-ai/sdk").Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await dispatchTool(block.name, block.input as Record<string, unknown>, {
          babyId: context.babyId!,
          ownerId: context.telegramUserId,
          db: deps.db,
          pgPool: deps.pgPool,
        });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
      history.push({ role: "user", content: toolResults });
      continue;
    }
    break;
  }
  return "I hit an unexpected issue processing that. Please try again.";
}

// ── Groq (OpenAI-compatible, free tier) ──────────────────────────────────────

async function runWithGroq(
  userMessage: string,
  context: ConversationContext,
  deps: AgentDeps,
  systemPrompt: string
): Promise<string> {
  if (!config.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required when LLM_PROVIDER=groq");

  const OpenAI = (await import("openai")).default;
  const groq = new OpenAI({
    apiKey: config.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  type OAITool = Parameters<typeof groq.chat.completions.create>[0]["tools"] extends (infer T)[] | undefined ? T : never;
  type OAIMessage = Parameters<typeof groq.chat.completions.create>[0]["messages"][number];

  const tools: OAITool[] = toolDefinitions.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const messages: OAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...context.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1024,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const msg = choice.message;
    messages.push(msg);

    if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
      const reply = msg.content ?? "I'm not sure how to respond to that.";
      context.messages.push({ role: "user", content: userMessage });
      context.messages.push({ role: "assistant", content: reply });
      return reply;
    }

    if (choice.finish_reason === "tool_calls" || msg.tool_calls?.length) {
      for (const toolCall of msg.tool_calls ?? []) {
        const tc = toolCall as { id: string; function: { name: string; arguments: string } };
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {}
        const result = await dispatchTool(tc.function.name, input, {
          babyId: context.babyId!,
          ownerId: context.telegramUserId,
          db: deps.db,
          pgPool: deps.pgPool,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        } as OAIMessage);
      }
      continue;
    }
    break;
  }
  return "I hit an unexpected issue processing that. Please try again.";
}

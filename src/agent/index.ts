import Anthropic from "@anthropic-ai/sdk";
import type { Pool } from "pg";
import type { IDataAdapter } from "../data/adapter.interface.js";
import type { ConversationContext } from "../data/types.js";
import { buildSystemPrompt } from "./prompts.js";
import { toolDefinitions, dispatchTool } from "./tools.js";

const anthropic = new Anthropic();
const MAX_TOOL_ITERATIONS = 10;

export interface AgentDeps {
  db: IDataAdapter;
  pgPool: Pool | null;
}

// Internal message format that supports both string content and Anthropic block arrays
type InternalMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user" | "assistant"; content: Anthropic.ContentBlock[] | Anthropic.ToolResultBlockParam[] };

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

  // Build full message history from context (string messages) + current turn
  const history: InternalMessage[] = context.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  history.push({ role: "user", content: userMessage });

  const systemPrompt = buildSystemPrompt(baby.name, baby.dateOfBirth);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: history as Anthropic.MessageParam[],
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const reply = textBlock?.type === "text" ? textBlock.text : "I'm not sure how to respond to that.";
      // Persist the user message and reply to context for next turn
      context.messages.push({ role: "user", content: userMessage });
      context.messages.push({ role: "assistant", content: reply });
      return reply;
    }

    if (response.stop_reason === "tool_use") {
      // Append full assistant response (may include text + tool_use blocks)
      history.push({ role: "assistant", content: response.content });

      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
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

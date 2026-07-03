import { Message, StreamChunk } from "../types";

/**
 * Apply one stream chunk to a session's message list.
 *
 * Pure function extracted from ChatPage's hermes:chunk listener so the
 * streaming pipeline is unit-testable. Returns the SAME array reference
 * when the chunk produced no change (no streaming assistant to receive it),
 * letting callers skip state updates.
 *
 * Only transcript-shaping kinds are handled here; session-level kinds
 * (status, session_stat, new_session_id, …) stay in ChatPage.
 */
export function applyChunk(messages: Message[], chunk: StreamChunk): Message[] {
  const lastAssistantIdx = [...messages]
    .reverse()
    .findIndex((m) => m.role === "assistant" && m.status === "streaming");
  if (lastAssistantIdx < 0) return messages;
  const idx = messages.length - 1 - lastAssistantIdx;

  const msg = { ...messages[idx] };
  const blocks = [...msg.blocks];

  switch (chunk.kind) {
    case "raw": {
      msg.rawOutput = msg.rawOutput ? `${msg.rawOutput}\n${chunk.content}` : chunk.content;
      break;
    }
    case "text": {
      const last = blocks[blocks.length - 1];
      if (last?.type === "text") {
        const next = last.content + chunk.content;
        blocks[blocks.length - 1] = {
          ...last,
          content: next.replace(/\n{3,}/g, "\n\n"),
        };
      } else if (chunk.content.trim()) {
        blocks.push({ type: "text", content: chunk.content });
      }
      break;
    }
    case "think_start":
      blocks.push({ type: "think", content: "" });
      break;
    case "think": {
      const last = blocks[blocks.length - 1];
      if (last?.type === "think") {
        blocks[blocks.length - 1] = {
          ...last,
          content: last.content + (last.content ? "\n" : "") + chunk.content,
        };
      }
      break;
    }
    case "think_end":
      break;
    case "tool_name":
      blocks.push({
        type: "tool",
        name: chunk.content || "tool",
        input: "",
        output: "",
        outputDone: false,
      });
      break;
    case "tool_input": {
      const last = blocks[blocks.length - 1];
      if (last?.type === "tool") {
        blocks[blocks.length - 1] = {
          ...last,
          input: last.input + (last.input ? "\n" : "") + chunk.content,
        };
      }
      break;
    }
    case "tool_output": {
      const last = blocks[blocks.length - 1];
      if (last?.type === "tool") {
        blocks[blocks.length - 1] = {
          ...last,
          output: last.output + (last.output ? "\n" : "") + chunk.content,
        };
      }
      break;
    }
    case "tool_output_end": {
      const last = blocks[blocks.length - 1];
      if (last?.type === "tool") {
        blocks[blocks.length - 1] = { ...last, outputDone: true };
      }
      break;
    }
  }

  if (chunk.kind === "error") {
    msg.status = "error";
    msg.rawOutput = msg.rawOutput ? `${msg.rawOutput}\n${chunk.content}` : chunk.content;
  }

  if (chunk.kind === "done" && msg.status !== "error") {
    msg.status = "done";
  }

  const next = [...messages];
  next[idx] = { ...msg, blocks };
  return next;
}

import { describe, it, expect } from "vitest";
import { applyChunk } from "./chunkReducer";
import { Message, StreamChunk } from "../types";

function streamingAssistant(blocks: Message["blocks"] = []): Message {
  return { id: "a1", role: "assistant", blocks, timestamp: "", status: "streaming" };
}

function chunk(kind: StreamChunk["kind"], content = ""): StreamChunk {
  return { kind, content, session_id: "s1" };
}

describe("applyChunk", () => {
  it("returns the same reference when no streaming assistant exists", () => {
    const done: Message[] = [{ id: "u", role: "user", blocks: [], timestamp: "", status: "done" }];
    expect(applyChunk(done, chunk("text", "hi"))).toBe(done);
    expect(applyChunk([], chunk("done"))).toEqual([]);
  });

  it("accumulates text into one block and collapses 3+ newlines", () => {
    let msgs = [streamingAssistant()];
    msgs = applyChunk(msgs, chunk("text", "Hello"));
    msgs = applyChunk(msgs, chunk("text", "\n\n\nworld"));
    expect(msgs[0].blocks).toEqual([{ type: "text", content: "Hello\n\nworld" }]);
  });

  it("ignores whitespace-only text when starting a new block", () => {
    const msgs = applyChunk([streamingAssistant()], chunk("text", "   "));
    expect(msgs[0].blocks).toHaveLength(0);
  });

  it("builds think blocks between think_start and think_end", () => {
    let msgs = [streamingAssistant()];
    msgs = applyChunk(msgs, chunk("think_start"));
    msgs = applyChunk(msgs, chunk("think", "step 1"));
    msgs = applyChunk(msgs, chunk("think", "step 2"));
    expect(msgs[0].blocks).toEqual([{ type: "think", content: "step 1\nstep 2" }]);
  });

  it("runs the tool lifecycle: name, input, output, end", () => {
    let msgs = [streamingAssistant()];
    msgs = applyChunk(msgs, chunk("tool_name", "web_search"));
    msgs = applyChunk(msgs, chunk("tool_input", '{"q":"x"}'));
    msgs = applyChunk(msgs, chunk("tool_output", "result A"));
    msgs = applyChunk(msgs, chunk("tool_output", "result B"));
    msgs = applyChunk(msgs, chunk("tool_output_end"));
    expect(msgs[0].blocks).toEqual([
      {
        type: "tool",
        name: "web_search",
        input: '{"q":"x"}',
        output: "result A\nresult B",
        outputDone: true,
      },
    ]);
  });

  it("keeps text after a tool call in a separate block", () => {
    let msgs = [streamingAssistant()];
    msgs = applyChunk(msgs, chunk("text", "before"));
    msgs = applyChunk(msgs, chunk("tool_name", "t"));
    msgs = applyChunk(msgs, chunk("tool_output_end"));
    msgs = applyChunk(msgs, chunk("text", "after"));
    expect(msgs[0].blocks.map((b) => b.type)).toEqual(["text", "tool", "text"]);
  });

  it("marks error status and appends to rawOutput; done does not override error", () => {
    let msgs = [streamingAssistant()];
    msgs = applyChunk(msgs, chunk("error", "boom"));
    expect(msgs[0].status).toBe("error");
    expect(msgs[0].rawOutput).toBe("boom");
    msgs = applyChunk(msgs, chunk("done"));
    // done arrives for an errored message that is no longer "streaming" — no-op
    expect(msgs[0].status).toBe("error");
  });

  it("marks done status on a clean finish", () => {
    let msgs = [streamingAssistant([{ type: "text", content: "hi" }])];
    msgs = applyChunk(msgs, chunk("done"));
    expect(msgs[0].status).toBe("done");
  });

  it("targets the LAST streaming assistant when several assistants exist", () => {
    const older: Message = { ...streamingAssistant(), id: "a0", status: "done" };
    let msgs = [older, streamingAssistant()];
    msgs = applyChunk(msgs, chunk("text", "new"));
    expect(msgs[0].blocks).toHaveLength(0);
    expect(msgs[1].blocks).toEqual([{ type: "text", content: "new" }]);
  });
});

import type { Message } from "../types";

export function removeLastTurn(messages: Message[]): Message[] {
  const assistantIndex = [...messages]
    .reverse()
    .findIndex((message) => message.role === "assistant");
  if (assistantIndex < 0) return messages;

  const lastAssistantIndex = messages.length - 1 - assistantIndex;
  const lastUserIndex = messages
    .slice(0, lastAssistantIndex)
    .map((message, index) => ({ message, index }))
    .reverse()
    .find((item) => item.message.role === "user")?.index;

  if (lastUserIndex === undefined) {
    return messages.slice(0, lastAssistantIndex);
  }

  return [
    ...messages.slice(0, lastUserIndex),
    ...messages.slice(lastAssistantIndex + 1),
  ];
}

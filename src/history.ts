import type { SessionMessageInfo } from "@opencode/client";

export type SessionMessageLoader = (sessionID: string) => SessionMessageInfo[];

function createdAt(message: SessionMessageInfo): number {
  return typeof message.time?.created === "number" ? message.time.created : 0;
}

export function mergeSessionMessages(
  existing: readonly SessionMessageInfo[],
  incoming: readonly SessionMessageInfo[],
  limit: number,
): SessionMessageInfo[] {
  const messages = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);

  return [...messages.values()]
    .sort((left, right) => createdAt(left) - createdAt(right) || left.id.localeCompare(right.id))
    .slice(-limit);
}

export function createSessionMessageCache(load: SessionMessageLoader, limit: number) {
  const sessions = new Map<string, SessionMessageInfo[]>();

  return {
    get(sessionID: string, current: readonly SessionMessageInfo[]): SessionMessageInfo[] {
      const existing = sessions.get(sessionID) ?? load(sessionID);
      const messages = mergeSessionMessages(existing, current, limit);
      sessions.set(sessionID, messages);
      return messages;
    },
  };
}

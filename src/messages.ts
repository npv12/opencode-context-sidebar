import type { SessionMessageInfo } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";

export const MAX_SESSION_MESSAGES = 5_000;
export const MESSAGE_PAGE_SIZE = 100;

export async function loadSessionMessages(context: Plugin.Context, sessionID: string): Promise<SessionMessageInfo[]> {
  const messages: SessionMessageInfo[] = [];
  let cursor: string | undefined;

  while (messages.length < MAX_SESSION_MESSAGES) {
    const limit = Math.min(MESSAGE_PAGE_SIZE, MAX_SESSION_MESSAGES - messages.length);
    const response = await context.client.message.list({
      sessionID,
      limit,
      ...(cursor ? { cursor } : { order: "asc" }),
    });
    const page = Array.isArray(response?.data) ? response.data : [];
    messages.push(...page);
    const nextCursor = response?.cursor?.next ?? undefined;
    if (!nextCursor || nextCursor === cursor || page.length === 0) break;
    cursor = nextCursor;
  }

  return messages.slice(0, MAX_SESSION_MESSAGES);
}

import type { ModelInfo, ModelRef, SessionMessageAssistant, SessionMessageInfo } from "@opencode/client";

export type AssistantWithUsage = SessionMessageAssistant & {
  tokens: NonNullable<SessionMessageAssistant["tokens"]>;
};

function nonNegativeFinite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function tokenParts(message: AssistantWithUsage) {
  const tokens = message.tokens;
  return {
    input: nonNegativeFinite(tokens?.input),
    output: nonNegativeFinite(tokens?.output),
    reasoning: nonNegativeFinite(tokens?.reasoning),
    cacheRead: nonNegativeFinite(tokens?.cache?.read),
    cacheWrite: nonNegativeFinite(tokens?.cache?.write),
  };
}

function boundaryIndex(messages: readonly SessionMessageInfo[], boundary?: string): number {
  if (!boundary) return messages.length;
  return messages.findIndex((message) => message?.id === boundary);
}

function isAssistantWithUsage(message: SessionMessageInfo | null | undefined): message is AssistantWithUsage {
  return message?.type === "assistant" && message.tokens != null;
}

export function assistantMessagesWithUsage(
  messages: readonly SessionMessageInfo[],
  boundary?: string,
): AssistantWithUsage[] {
  // Cache-hit reporting intentionally spans completed compactions and covers the lifetime before the revert boundary.
  const end = boundaryIndex(messages, boundary);
  if (end < 0) return [];
  return messages.filter((message, index): message is AssistantWithUsage => index < end && isAssistantWithUsage(message));
}

export function lastAssistantWithUsage(
  messages: readonly SessionMessageInfo[],
  boundary?: string,
): AssistantWithUsage | undefined {
  const end = boundaryIndex(messages, boundary);
  if (end < 0) return undefined;
  const compactionIndex = messages.findLastIndex(
    (message, index) => message?.type === "compaction" && message.status === "completed" && index < end,
  );
  return messages.findLast(
    (message, index): message is AssistantWithUsage =>
      index > compactionIndex && index < end && isAssistantWithUsage(message),
  );
}

export function calculateUsage(
  messages: readonly SessionMessageInfo[],
  boundary: string | undefined,
  models: readonly ModelInfo[] | undefined,
  selectedModel?: ModelRef,
): { tokens: number; contextWindow: number; cacheHitPercent?: number } | undefined {
  const last = lastAssistantWithUsage(messages, boundary);
  if (boundary && !last && !messages.some((message) => message?.id === boundary)) return undefined;

  const current = last ? tokenParts(last) : undefined;
  const modelRef = last?.model ?? selectedModel;
  const model = modelRef
    ? models?.find((item) => item.providerID === modelRef.providerID && item.id === modelRef.id)
    : undefined;
  const contextWindow = nonNegativeFinite(model?.limit.context);
  if (!current) return { tokens: 0, contextWindow };
  const tokens = current.input + current.output + current.reasoning + current.cacheRead + current.cacheWrite;
  if (tokens <= 0) return { tokens: 0, contextWindow };
  return {
    tokens,
    contextWindow,
  };
}

export function calculateCacheHitPercent(messages: readonly SessionMessageInfo[], boundary?: string): number | undefined {
  const totals = assistantMessagesWithUsage(messages, boundary).reduce(
    (total, message) => {
      const parts = tokenParts(message);
      return {
        cacheRead: total.cacheRead + parts.cacheRead,
        input: total.input + parts.input,
        cacheWrite: total.cacheWrite + parts.cacheWrite,
      };
    },
    { cacheRead: 0, input: 0, cacheWrite: 0 },
  );
  const totalInputTokens = totals.input + totals.cacheRead + totals.cacheWrite;
  return totalInputTokens > 0 ? Math.round((totals.cacheRead / totalInputTokens) * 10000) / 100 : undefined;
}

export function safeNumber(value: unknown): number {
  return nonNegativeFinite(value);
}

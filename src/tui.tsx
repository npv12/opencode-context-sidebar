/** @jsxImportSource @opentui/solid */
/**
 * Context usage widget for the OpenCode V2 TUI sidebar.
 *
 * Claimed as the first element inside `sidebar.content`, so it renders above
 * every section the host appends to the sidebar, regardless of enable order.
 */

import type { ModelInfo, SessionMessageAssistant, SessionMessageInfo } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";

const BAR_WIDTH = 24;
const MAX_SESSION_MESSAGES = 5_000;
const MESSAGE_PAGE_SIZE = 100;

async function loadSessionMessages(context: Plugin.Context, sessionID: string): Promise<SessionMessageInfo[]> {
  const messages: SessionMessageInfo[] = [];
  let cursor: string | undefined;

  while (messages.length < MAX_SESSION_MESSAGES) {
    const limit = Math.min(MESSAGE_PAGE_SIZE, MAX_SESSION_MESSAGES - messages.length);
    const response = await context.client.message.list({
      sessionID,
      limit,
      ...(cursor ? { cursor } : { order: "asc" }),
    });
    messages.push(...response.data);
    const nextCursor = response.cursor.next ?? undefined;
    if (!nextCursor || nextCursor === cursor || response.data.length === 0) break;
    cursor = nextCursor;
  }

  return messages.slice(0, MAX_SESSION_MESSAGES);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function buildBar(percent: number): { filled: string; empty: string } {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * BAR_WIDTH)) : 0;
  return { filled: "█".repeat(filled), empty: "░".repeat(BAR_WIDTH - filled) };
}

/** Last assistant step carrying token usage, after the most recent completed
 * compaction and before the revert boundary — the same window the host uses
 * for its own context readout. */
type AssistantWithUsage = SessionMessageAssistant & {
  tokens: NonNullable<SessionMessageAssistant["tokens"]>;
};

function assistantMessagesWithUsage(messages: readonly SessionMessageInfo[], boundary?: string): AssistantWithUsage[] {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return [];
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  return messages.filter(
    (message, index): message is AssistantWithUsage =>
      message.type === "assistant" && message.tokens !== undefined && index < end,
  );
}

function lastAssistantWithUsage(messages: readonly SessionMessageInfo[], boundary?: string) {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return undefined;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  const compactionIndex = messages.findLastIndex(
    (message, index) => message.type === "compaction" && message.status === "completed" && index < end,
  );
  return messages.findLast(
    (message, index): message is AssistantWithUsage =>
      message.type === "assistant" && message.tokens !== undefined && index > compactionIndex && index < end,
  );
}

function View(props: { context: Plugin.Context; sessionID: string }) {
  const [messageRevision, setMessageRevision] = createSignal(0);
  const [sessionMessages] = createResource(
    () => {
      messageRevision();
      return props.sessionID;
    },
    (sessionID) => loadSessionMessages(props.context, sessionID),
  );
  const session = createMemo(() => props.context.data.session.get(props.sessionID));
  const cost = createMemo(() => props.context.data.session.cost(props.sessionID));
  const models = createMemo(() => props.context.data.location.model.list(session()?.location));

  onMount(() => {
    const stop = props.context.data.on("session.usage.updated", (event) => {
      if (event.data.sessionID === props.sessionID) setMessageRevision((revision) => revision + 1);
    });
    onCleanup(stop);
  });

  const usage = createMemo(() => {
    const messages = sessionMessages() ?? [];
    const previous = assistantMessagesWithUsage(messages, session()?.revert?.messageID);
    const last = lastAssistantWithUsage(messages, session()?.revert?.messageID);
    if (!last) return undefined;
    const cacheReadTokens = previous.reduce((total, message) => total + message.tokens.cache.read, 0);
    const totalInputTokens = previous.reduce(
      (total, message) => total + message.tokens.input + message.tokens.cache.read + message.tokens.cache.write,
      0,
    );
    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write;
    if (tokens <= 0) return undefined;
    const model: ModelInfo | undefined = models()?.find(
      (item) => item.providerID === last.model.providerID && item.id === last.model.id,
    );
    return {
      tokens,
      contextWindow: model?.limit.context ?? 0,
      cacheHitPercent:
        totalInputTokens > 0 ? Math.round((cacheReadTokens / totalInputTokens) * 10000) / 100 : undefined,
    };
  });

  const percent = createMemo(() => {
    const state = usage();
    return state && state.contextWindow > 0 ? Math.round((state.tokens / state.contextWindow) * 100) : 0;
  });

  const detailLine = createMemo(() => {
    const state = usage();
    const limitText = state && state.contextWindow > 0 ? formatInt(state.contextWindow) : "--";
    const cacheText = state?.cacheHitPercent === undefined ? "--" : `${state.cacheHitPercent}%`;
    return `${formatInt(state?.tokens ?? 0)} / ${limitText} / ${cacheText} / ${formatMoney(cost())}`;
  });

  const bar = createMemo(() => buildBar(percent()));

  const color = createMemo(() => {
    const value = percent();
    const feedback = props.context.theme.text.feedback;
    return value >= 90 ? feedback.error.base : value >= 70 ? feedback.warning.base : feedback.success.base;
  });

  return (
    <Show when={usage()}>
      <box>
        <text fg={props.context.theme.text.base} attributes={TextAttributes.BOLD}>
          Context
        </text>
        <box flexDirection="row" gap={1}>
          <text fg={color()}>{bar().filled}</text>
          <text fg={props.context.theme.text.muted}>{bar().empty}</text>
          <text fg={color()}> {percent()}%</text>
        </box>
        <text fg={props.context.theme.text.base}>{detailLine()}</text>
      </box>
    </Show>
  );
}

export default {
  id: "npv12.context-sidebar",
  setup(context) {
    return context.ui.slot({
      prepend: "sidebar.content",
      render: (props) => <View context={context} sessionID={props.sessionID} />,
    });
  },
} satisfies Plugin.Definition;

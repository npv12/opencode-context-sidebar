/** @jsxImportSource @opentui/solid */
/**
 * Context usage widget for the OpenCode V2 TUI sidebar.
 *
 * Claimed as the first element inside `sidebar.content`, so it renders above
 * every section the host appends to the sidebar, regardless of enable order.
 */

import type { Plugin } from "@opencode-ai/plugin/tui";
import type { ModelInfo, SessionMessageAssistant, SessionMessageInfo } from "@opencode-ai/client";
import { TextAttributes } from "@opentui/core";
import { createMemo, Show } from "solid-js";

const BAR_WIDTH = 24;

function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function buildBar(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((clamped / 100) * BAR_WIDTH)));
  return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
}

/** Last assistant step carrying token usage, after the most recent completed
 * compaction and before the revert boundary — the same window the host uses
 * for its own context readout. */
function lastAssistantWithUsage(messages: readonly SessionMessageInfo[], boundary?: string) {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return undefined;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  const compactionIndex = messages.findLastIndex(
    (message, index) => message.type === "compaction" && message.status === "completed" && index < end,
  );
  return messages.findLast(
    (
      message,
      index,
    ): message is SessionMessageAssistant & { tokens: NonNullable<SessionMessageAssistant["tokens"]> } =>
      message.type === "assistant" && message.tokens !== undefined && index > compactionIndex && index < end,
  );
}

function View(props: { context: Plugin.Context; sessionID: string }) {
  const messages = createMemo(() => props.context.data.session.message.list(props.sessionID));
  const session = createMemo(() => props.context.data.session.get(props.sessionID));
  const cost = createMemo(() => props.context.data.session.cost(props.sessionID));
  const models = createMemo(() => props.context.data.location.model.list(session()?.location));

  const usage = createMemo(() => {
    const last = lastAssistantWithUsage(messages(), session()?.revert?.messageID);
    if (!last) return undefined;
    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write;
    if (tokens <= 0) return undefined;
    const model: ModelInfo | undefined = models()?.find(
      (item) => item.providerID === last.model.providerID && item.id === last.model.id,
    );
    return {
      tokens,
      contextWindow: model?.limit.context ?? 0,
      cachePercent:
        last.tokens.input + last.tokens.cache.read + last.tokens.cache.write > 0
          ? Math.round(
              (last.tokens.cache.read /
                (last.tokens.input + last.tokens.cache.read + last.tokens.cache.write)) *
                100,
            )
          : undefined,
    };
  });

  const percent = createMemo(() => {
    const state = usage();
    return state && state.contextWindow > 0 ? Math.round((state.tokens / state.contextWindow) * 100) : 0;
  });

  const detailLine = createMemo(() => {
    const state = usage();
    const limitText = state && state.contextWindow > 0 ? formatInt(state.contextWindow) : "--";
    const cacheText = state?.cachePercent === undefined ? "--" : `${state.cachePercent}%`;
    return `${formatInt(state?.tokens ?? 0)} / ${limitText} / ${cacheText} / ${formatMoney(cost())}`;
  });

  const color = createMemo(() => {
    const value = percent();
    const feedback = props.context.theme.text.feedback;
    return value >= 90 ? feedback.error.default : value >= 70 ? feedback.warning.default : feedback.success.default;
  });

  return (
    <Show when={usage()}>
      <box>
        <text fg={props.context.theme.text.default} attributes={TextAttributes.BOLD}>
          Context
        </text>
        <box flexDirection="row" gap={1}>
          <text fg={color()}>{buildBar(percent())}</text>
          <text fg={color()}> {percent()}%</text>
        </box>
        <text fg={props.context.theme.text.subdued}>{detailLine()}</text>
      </box>
    </Show>
  );
}

export default {
  id: "npv12.context-sidebar",
  setup(context) {
    context.ui.slot({
      prepend: "sidebar.content",
      render: (props) => <View context={context} sessionID={props.sessionID} />,
    });
  },
} satisfies Plugin.Definition;

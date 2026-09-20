/** @jsxImportSource @opentui/solid */
/**
 * Context usage widget for the OpenCode V2 TUI sidebar.
 *
 * Claimed as the first element inside `sidebar.content`, so it renders above
 * every section the host appends to the sidebar, regardless of enable order.
 */

import type { Plugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import { createMemo, Show } from "solid-js";
import { calculateUsage, safeNumber } from "./context";

const BAR_WIDTH = 24;

function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(safeNumber(value))));
}

function formatMoney(value: number): string {
  return `$${safeNumber(value).toFixed(2)}`;
}

function buildBar(percent: number): { filled: string; empty: string } {
  const clamped = Math.max(0, Math.min(100, safeNumber(percent)));
  const filled = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * BAR_WIDTH)) : 0;
  return { filled: "█".repeat(filled), empty: "░".repeat(BAR_WIDTH - filled) };
}

function View(props: { context: Plugin.Context; sessionID: string }) {
  const sessionMessages = createMemo(() => props.context.data.session.message.list(props.sessionID));
  const session = createMemo(() => props.context.data.session.get(props.sessionID));
  const cost = createMemo(() => props.context.data.session.cost(props.sessionID));
  const models = createMemo(() => props.context.data.location.model.list(session()?.location));

  const usage = createMemo(() => {
    const messages = sessionMessages();
    return calculateUsage(messages, session()?.revert?.messageID, models(), session()?.model);
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
    <Show when={usage() || cost() > 0}>
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

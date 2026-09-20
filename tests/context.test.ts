import assert from "node:assert/strict";
import test from "node:test";
import type { ModelInfo, SessionMessageInfo } from "@opencode/client";
import { calculateCacheHitPercent, calculateUsage, lastAssistantWithUsage } from "../src/context.ts";

const model = { providerID: "provider", id: "model", limit: { context: 1_000 } } as ModelInfo;

function assistant(id: string, tokens: Record<string, unknown>): SessionMessageInfo {
  return {
    id,
    type: "assistant",
    agent: "build",
    model: { providerID: "provider", id: "model" },
    content: [],
    tokens,
  } as unknown as SessionMessageInfo;
}

test("calculates current usage", () => {
  const usage = calculateUsage(
    [assistant("one", { input: 100, output: 20, reasoning: 5, cache: { read: 50, write: 10 } })],
    undefined,
    [model],
  );

  assert.deepEqual(usage, { tokens: 185, contextWindow: 1_000 });
});

test("keeps lifetime cache aggregation across completed compaction", () => {
  const usage = calculateUsage(
    [
      assistant("one", { input: 100, output: 1, reasoning: 0, cache: { read: 50, write: 0 } }),
      { id: "compact", type: "compaction", status: "completed" } as SessionMessageInfo,
      assistant("two", { input: 100, output: 2, reasoning: 0, cache: { read: 25, write: 0 } }),
    ],
    undefined,
    [model],
  );

  assert.equal(usage?.tokens, 127);
});

test("does not use messages after a revert boundary", () => {
  const messages = [
    assistant("one", { input: 10, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }),
    { id: "revert", type: "user" } as SessionMessageInfo,
    assistant("two", { input: 100, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }),
  ];

  assert.equal(lastAssistantWithUsage(messages, "revert")?.id, "one");
  assert.equal(calculateUsage(messages, "missing", [model]), undefined);
});

test("ignores invalid numeric values and missing model metadata", () => {
  const usage = calculateUsage(
    [
      assistant("invalid", {
        input: Number.NaN,
        output: Number.POSITIVE_INFINITY,
        reasoning: -10,
        cache: { read: null, write: 10 },
      }),
    ],
    undefined,
    undefined,
  );

  assert.deepEqual(usage, { tokens: 10, contextWindow: 0 });
});

test("calculates lifetime cache hit percentage separately from current usage", () => {
  assert.equal(
    calculateCacheHitPercent([
      assistant("one", { input: 100, output: 1, reasoning: 0, cache: { read: 50, write: 0 } }),
      assistant("two", { input: 100, output: 1, reasoning: 0, cache: { read: 25, write: 0 } }),
    ]),
    27.27,
  );
});

test("returns zero usage for an empty or zero-token session", () => {
  assert.deepEqual(calculateUsage([], undefined, [model], { providerID: "provider", id: "model" }), {
    tokens: 0,
    contextWindow: 1_000,
  });
  assert.deepEqual(
    calculateUsage(
      [assistant("zero", { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })],
      undefined,
      [model],
    ),
    { tokens: 0, contextWindow: 1_000 },
  );
});

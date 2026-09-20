import assert from "node:assert/strict";
import test from "node:test";
import type { SessionMessageInfo } from "@opencode/client";
import { createSessionMessageCache, mergeSessionMessages } from "../src/history.ts";

function message(id: string, created: number): SessionMessageInfo {
  return { id, type: "user", time: { created }, content: [] } as unknown as SessionMessageInfo;
}

test("merges current messages and replaces stale versions by id", () => {
  const result = mergeSessionMessages(
    [message("one", 1), message("two", 2)],
    [message("two", 3), message("three", 4)],
    5,
  );

  assert.deepEqual(result.map((item) => [item.id, item.time?.created]), [
    ["one", 1],
    ["two", 3],
    ["three", 4],
  ]);
});

test("keeps only the newest messages at the configured limit", () => {
  const result = mergeSessionMessages(
    [message("one", 1), message("two", 2), message("three", 3)],
    [message("four", 4)],
    2,
  );

  assert.deepEqual(result.map((item) => item.id), ["three", "four"]);
});

test("hydrates each session once and merges later reactive updates", () => {
  let loads = 0;
  const cache = createSessionMessageCache(() => {
    loads++;
    return [message("stored", 1)];
  }, 5_000);

  assert.deepEqual(cache.get("session", [message("current", 2)]).map((item) => item.id), ["stored", "current"]);
  assert.deepEqual(cache.get("session", [message("latest", 3)]).map((item) => item.id), [
    "stored",
    "current",
    "latest",
  ]);
  assert.equal(loads, 1);
});

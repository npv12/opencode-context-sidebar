import assert from "node:assert/strict";
import test from "node:test";
import { loadSessionMessages, MAX_SESSION_MESSAGES } from "../src/messages.ts";

function context(pages: unknown[]) {
  let index = 0;
  return {
    client: {
      message: {
        list: async () => pages[index++] ?? { data: [], cursor: {} },
      },
    },
  } as never;
}

test("loads pages until the cursor is exhausted", async () => {
  const messages = await loadSessionMessages(
    context([
      { data: [{ id: "one" }], cursor: { next: "next" } },
      { data: [{ id: "two" }], cursor: {} },
    ]),
    "session",
  );

  assert.deepEqual(messages, [{ id: "one" }, { id: "two" }]);
});

test("stops on a repeated cursor and tolerates malformed page data", async () => {
  const messages = await loadSessionMessages(
    context([
      { data: null, cursor: { next: "next" } },
      { data: [{ id: "should-not-load" }], cursor: { next: "next" } },
    ]),
    "session",
  );

  assert.deepEqual(messages, []);
});

test("caps pagination at the configured message limit", async () => {
  let calls = 0;
  const page = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
  const contextValue = {
    client: {
      message: {
        list: async () => {
          calls++;
          return { data: page, cursor: { next: String(calls) } };
        },
      },
    },
  } as never;

  const messages = await loadSessionMessages(contextValue, "session");
  assert.equal(messages.length, MAX_SESSION_MESSAGES);
  assert.equal(calls, MAX_SESSION_MESSAGES / page.length);
});

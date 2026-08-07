import assert from "node:assert/strict";
import test from "node:test";

import { createLegacyClient } from "../electron/search/legacy-client.mjs";

function hangingFetch(_url, { signal } = {}) {
  return new Promise((_resolve, reject) => {
    const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (signal?.aborted) fail();
    else signal?.addEventListener("abort", fail, { once: true });
  });
}

test("public retrieval keeps its own timeout even when an outer session signal exists", async () => {
  const client = createLegacyClient({
    fetchImpl: hangingFetch,
    duckTimeoutMs: 25,
    bingTimeoutMs: 20,
    logger: { warn() {} },
  });
  const startedAt = Date.now();
  await assert.rejects(
    () => client.search("test", { signal: new AbortController().signal }),
    /aborted/,
  );
  assert.ok(Date.now() - startedAt < 250, "a hanging upstream must not stall the search stage");
});

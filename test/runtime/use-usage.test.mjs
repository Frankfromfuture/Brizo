import assert from "node:assert/strict";
import test from "node:test";

import {
  createUseUsageTracker,
  formatUseUsage,
  normalizeUseUsage,
} from "../../runtime/shared/use-usage.mjs";

test("usage tracker combines provider token formats without double settling", () => {
  const tracker = createUseUsageTracker();
  const first = tracker.startRequest("model-a");
  const second = tracker.startRequest("model-b");
  first({ model: "model-a", usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
  first({ usage: { total_tokens: 9999 } });
  second({ usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 } });

  assert.deepEqual(tracker.snapshot(), {
    complete: true,
    inputTokens: 150,
    models: ["model-a", "model-b"],
    outputTokens: 30,
    reportedRequests: 2,
    requests: 2,
    totalTokens: 180,
  });
});

test("usage formatting reports partial provider data accurately", () => {
  const normalized = normalizeUseUsage({
    complete: false,
    models: ["model-a", "model-a", "model-b\nignored"],
    reportedRequests: 1,
    requests: 2,
    totalTokens: 120,
  });
  assert.deepEqual(normalized.models, ["model-a", "model-b ignored"]);
  assert.match(formatUseUsage(normalized), /至少 120 token（部分调用未提供用量）/u);
});

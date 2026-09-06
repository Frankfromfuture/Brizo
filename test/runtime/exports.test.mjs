import assert from "node:assert/strict";
import test from "node:test";

import * as adapters from "../../runtime/adapters.mjs";
import * as command from "../../runtime/command.mjs";
import * as pageInput from "../../runtime/page-input.mjs";
import * as policies from "../../runtime/policies.mjs";
import * as result from "../../runtime/result.mjs";
import * as usage from "../../runtime/usage.mjs";

test("public pure-Node runtime entry points link without Electron", () => {
  for (const exported of [
    adapters.parseCtripFlightCommand,
    adapters.parseTaobaoPriceCommand,
    command.runBrowserCommandAgent,
    command.createBrowserExecutionEvidence,
    pageInput.dispatchPageEvents,
    policies.assertBrowserNavigationUrl,
    result.formatUseResult,
    usage.createUseUsageTracker,
  ]) {
    assert.equal(typeof exported, "function");
  }
});

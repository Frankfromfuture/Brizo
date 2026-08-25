import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeUsePlannerNavigation,
  useOriginEntryUrl,
} from "../electron/browser-use-entry-policy.mjs";

test("Use model navigation keeps an ordinary public origin entry unchanged", () => {
  assert.equal(useOriginEntryUrl("https://example.com/"), "https://example.com/");
  assert.deepEqual(normalizeUsePlannerNavigation("https://example.com/"), {
    requestedUrl: "https://example.com/",
    rewritten: false,
    url: "https://example.com/",
  });
});

test("Use model navigation cannot cold-load a generated business deep link", () => {
  assert.deepEqual(
    normalizeUsePlannerNavigation("https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-08-27#lowest"),
    {
      requestedUrl: "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-08-27#lowest",
      rewritten: true,
      url: "https://flights.ctrip.com/",
    },
  );
  assert.equal(
    useOriginEntryUrl("https://shop.example.com/product/42?buy=1"),
    "https://shop.example.com/",
  );
});

test("Use origin normalization preserves a public non-default port", () => {
  assert.equal(
    useOriginEntryUrl("https://example.com:8443/app/results?q=brizo"),
    "https://example.com:8443/",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSiteHygieneSettings,
  sanitizeSiteHygieneSettings,
  shouldBlockPageRequest,
} from "../electron/site-hygiene.mjs";

test("site hygiene defaults to essential cookies and balanced cleanup", () => {
  assert.deepEqual(sanitizeSiteHygieneSettings(), {
    cleanupLevel: "balanced",
    cookieConsent: "essential",
    credentialAutofill: true,
    enabled: true,
    siteOverrides: {},
  });
});

test("per-site disable wins without changing the global preference", () => {
  const settings = sanitizeSiteHygieneSettings({
    siteOverrides: { "https://shop.example": { enabled: false } },
  });
  assert.equal(resolveSiteHygieneSettings(settings, "https://shop.example/checkout").enabled, false);
  assert.equal(resolveSiteHygieneSettings(settings, "https://news.example/").enabled, true);
});

test("balanced cleanup blocks ad hosts but never main-frame navigation", () => {
  const settings = sanitizeSiteHygieneSettings();
  assert.equal(shouldBlockPageRequest({
    pageUrl: "https://news.example/article",
    resourceType: "script",
    url: "https://securepubads.g.doubleclick.net/tag.js",
  }, settings), true);
  assert.equal(shouldBlockPageRequest({
    pageUrl: "https://news.example/article",
    resourceType: "mainFrame",
    url: "https://doubleclick.net/",
  }, settings), false);
  assert.equal(shouldBlockPageRequest({
    pageUrl: "https://shop.example/checkout",
    resourceType: "script",
    url: "https://cdn.shop.example/payment.js",
  }, settings), false);
});

test("strict mode adds common trackers and site disable restores them", () => {
  const strict = sanitizeSiteHygieneSettings({ cleanupLevel: "strict" });
  const request = {
    pageUrl: "https://news.example/article",
    resourceType: "xhr",
    url: "https://api.mixpanel.com/track",
  };
  assert.equal(shouldBlockPageRequest(request, strict), true);
  strict.siteOverrides["https://news.example"] = { enabled: false };
  assert.equal(shouldBlockPageRequest(request, strict), false);
});

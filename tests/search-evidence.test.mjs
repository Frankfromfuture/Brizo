import assert from "node:assert/strict";
import test from "node:test";

import { auditAnswerCitations, selectRelevantPassages } from "../electron/search/evidence.mjs";

const sources = [{
  title: "Electron releases",
  url: "https://electronjs.org/releases",
  body: "Electron 43 was released in August 2026. The package size was 120 MB.",
  summary: "Electron 43 release notes",
}];

test("citation audit requires every factual claim to carry a valid citation", () => {
  const complete = auditAnswerCitations("Electron 43 于 2026 年发布[1]。安装包为 120 MB[1]。", sources);
  assert.equal(complete.grounded, true);
  assert.equal(complete.coverage, 1);

  const missing = auditAnswerCitations("Electron 43 于 2026 年发布[1]。安装包为 120 MB。", sources);
  assert.equal(missing.grounded, false);
  assert.ok(missing.coverage < 1);
});

test("citation audit rejects invalid references and numbers absent from cited evidence", () => {
  const invalid = auditAnswerCitations("Electron 43 于 2026 年发布[9]。", sources);
  assert.equal(invalid.grounded, false);
  assert.equal(invalid.invalidCitationCount, 1);

  const unsupported = auditAnswerCitations("安装包为 999 MB[1]。", sources);
  assert.equal(unsupported.grounded, false);
  assert.equal(unsupported.unsupportedNumericClaimCount, 1);
});

test("passage selection prefers query-relevant middle sections over a long page head", () => {
  const body = [
    "网站导航。".repeat(500),
    "Electron 使用 Chromium 多进程架构，并为不同页面创建渲染进程。",
    "完全无关的页脚。".repeat(300),
  ].join("\n\n");
  const selected = selectRelevantPassages(body, "Electron Chromium 多进程", { maxPassages: 1, maxChars: 1_000 });
  assert.match(selected, /Electron 使用 Chromium 多进程架构/);
  assert.doesNotMatch(selected, /^网站导航/u);
});

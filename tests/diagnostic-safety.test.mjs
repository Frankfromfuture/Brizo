import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  sanitizeDiagnosticText,
  summarizeDiagnosticUrl,
} from "../electron/diagnostic-safety.mjs";

test("diagnostic URL summaries discard credentials, paths, queries and fragments", () => {
  const credentialValue = randomUUID();
  const queryValue = randomUUID();
  const fragmentValue = randomUUID();
  const sensitiveUrl = `https://user:${credentialValue}@example.com/private/account?token=${queryValue}#${fragmentValue}`;
  const summary = summarizeDiagnosticUrl(sensitiveUrl);

  assert.equal(summary, "https://example.com/[path]");
  assert.equal(summary.includes(credentialValue), false);
  assert.equal(summary.includes("private"), false);
  assert.equal(summary.includes(queryValue), false);
  assert.equal(summary.includes(fragmentValue), false);
  assert.equal(summarizeDiagnosticUrl("file:///Users/person/private.txt"), "file:///[path]");
  assert.equal(summarizeDiagnosticUrl("not a url"), "[redacted-url]");
});

test("diagnostic text redacts common secrets and embedded URL details", () => {
  const credentialValue = randomUUID();
  const serviceValue = randomUUID();
  const headerValue = randomUUID();
  const queryValue = randomUUID();
  const fragmentValue = randomUUID();
  const message = [
    `password=${credentialValue}`,
    `api_key:${serviceValue}`,
    `Authorization: Bearer ${headerValue}`,
    `https://example.com/search?q=${queryValue}#${fragmentValue}`,
  ].join(" ");
  const sanitized = sanitizeDiagnosticText(message);

  for (const sensitivePart of [
    credentialValue,
    serviceValue,
    headerValue,
    queryValue,
    fragmentValue,
  ]) {
    assert.equal(sanitized.includes(sensitivePart), false);
  }
  assert.match(sanitized, /password=\[redacted\]/iu);
  assert.match(sanitized, /https:\/\/example\.com\/\[path\]/u);
});

test("diagnostic text is bounded", () => {
  assert.equal(sanitizeDiagnosticText("x".repeat(2_000), 120).length, 120);
});

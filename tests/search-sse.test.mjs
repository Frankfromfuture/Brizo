import assert from "node:assert/strict";
import test from "node:test";

import { createSseDecoder, safeJsonParse } from "../electron/search/sse.mjs";

const encode = (text) => new TextEncoder().encode(text);

test("reassembles a data line split across chunk boundaries", () => {
  const decoder = createSseDecoder();
  assert.deepEqual(decoder.push(encode('data: {"a":')), []);
  assert.deepEqual(decoder.push(encode('1}\n\n')), ['{"a":1}']);
});

test("a multi-byte character split across chunks decodes without corruption", () => {
  // "英" is 3 bytes in UTF-8. Split it down the middle across two TCP-sized chunks.
  const payload = 'data: {"t":"英伟达"}\n\n';
  const bytes = encode(payload);
  const splitAt = payload.indexOf("英") + 1; // lands inside the 3-byte sequence
  const decoder = createSseDecoder();

  const first = decoder.push(bytes.slice(0, splitAt));
  const second = decoder.push(bytes.slice(splitAt));
  const events = [...first, ...second];

  assert.equal(events.length, 1);
  assert.equal(JSON.parse(events[0]).t, "英伟达");
  assert.ok(!events[0].includes("�"), "must not contain a replacement character");
});

test("handles CRLF line endings", () => {
  const decoder = createSseDecoder();
  assert.deepEqual(decoder.push('data: {"a":1}\r\n\r\n'), ['{"a":1}']);
});

test("skips comment and keepalive lines", () => {
  const decoder = createSseDecoder();
  assert.deepEqual(decoder.push(': keepalive\n\ndata: {"a":1}\n\n'), ['{"a":1}']);
});

test("joins consecutive data lines of one event with a newline", () => {
  const decoder = createSseDecoder();
  assert.deepEqual(decoder.push("data: line one\ndata: line two\n\n"), ["line one\nline two"]);
});

test("emits [DONE] as an ordinary payload the caller can terminate on", () => {
  const decoder = createSseDecoder();
  const events = decoder.push('data: {"a":1}\n\ndata: [DONE]\n\n');
  assert.deepEqual(events, ['{"a":1}', "[DONE]"]);
});

test("a malformed frame yields null from safeJsonParse without throwing", () => {
  const decoder = createSseDecoder();
  const events = decoder.push('data: {broken\n\ndata: {"a":2}\n\n');
  assert.equal(events.length, 2);
  assert.equal(safeJsonParse(events[0]), null);
  assert.deepEqual(safeJsonParse(events[1]), { a: 2 });
});

test("byte-by-byte delivery produces the same events as one whole chunk", () => {
  const payload =
    'data: {"choices":[{"delta":{"content":"深度求索"}}]}\n\n' +
    ': ping\n\n' +
    'data: {"choices":[{"delta":{"content":"发布了 V4"}}]}\n\n' +
    "data: [DONE]\n\n";
  const bytes = encode(payload);

  const whole = createSseDecoder();
  const expected = [...whole.push(bytes), ...whole.flush()];

  const drip = createSseDecoder();
  const actual = [];
  for (const byte of bytes) actual.push(...drip.push(Uint8Array.of(byte)));
  actual.push(...drip.flush());

  assert.deepEqual(actual, expected);
  assert.deepEqual(expected, [
    '{"choices":[{"delta":{"content":"深度求索"}}]}',
    '{"choices":[{"delta":{"content":"发布了 V4"}}]}',
    "[DONE]",
  ]);
});

test("flush emits a trailing event when the stream ends without a blank line", () => {
  const decoder = createSseDecoder();
  assert.deepEqual(decoder.push('data: {"a":1}'), []);
  assert.deepEqual(decoder.flush(), ['{"a":1}']);
});

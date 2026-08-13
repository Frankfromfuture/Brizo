import assert from "node:assert/strict";
import test from "node:test";
import {
  SMART_FUNCTIONS,
  SMART_INDUSTRIES,
  SMART_BOOKMARK_BATCH_SIZE,
  buildSmartBookmarkClusters,
  buildSmartBookmarkSnapshot,
  canonicalSmartBookmarkUrl,
  createSmartBookmarkService,
  mergeVisitWeights,
  sanitizeSmartBookmark,
} from "../electron/smart-bookmark-service.mjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function bookmarks(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Bookmark ${index}`,
    updatedAt: 1_000 + index,
    url: `https://example${index}.com/page?utm_source=test#part`,
  }));
}

test("smart bookmark metadata removes query tracking, fragments, visits, and source fields", () => {
  const sanitized = sanitizeSmartBookmark({
    folder: "Private / Work",
    source: "chrome",
    title: " Example ",
    url: "https://www.Example.com/docs/?utm_source=x&token=secret#part",
    visits: 99,
  });
  assert.equal(sanitized.domain, "example.com");
  assert.equal(sanitized.path, "/docs");
  assert.equal("source" in sanitized, false);
  assert.equal("visits" in sanitized, false);
  assert.equal(JSON.stringify(sanitized).includes("secret"), false);
});

test("visit weights use the maximum imported count plus Brizo visits", () => {
  const input = [{ url: "https://example.com/page" }];
  const weights = mergeVisitWeights(
    input,
    [{ url: "https://example.com/page", visits: 3, updatedAt: 20 }],
    [{ url: "https://www.example.com/page#x", visits: 8, lastVisitedAt: 10 }, { url: "https://example.com/page", visits: 5 }],
  );
  const key = sanitizeSmartBookmark(input[0]).key;
  assert.equal(weights[key].visitWeight, 11);
  assert.equal(weights[key].lastVisitedAt, 20);
});

test("full smart taxonomy keeps eight primary and five secondary categories plus other", () => {
  const input = bookmarks(14);
  const industries = SMART_INDUSTRIES.filter((item) => item.id !== "other-industry");
  const functions = SMART_FUNCTIONS.filter((item) => item.id !== "other-function");
  const assignments = input.map((bookmark, index) => ({
    confidence: 0.9,
    functionId: functions[index % 7].id,
    industryId: industries[index % 10].id,
    key: sanitizeSmartBookmark(bookmark).key,
  }));
  const snapshot = buildSmartBookmarkSnapshot({ assignments, bookmarks: input, forceFull: true });
  assert.ok(snapshot.folders.length <= 9);
  assert.ok(snapshot.folders.some((folder) => folder.id === "other-industry"));
  assert.ok(snapshot.folders.every((folder) => folder.children.length <= 6));
  const keys = snapshot.folders.flatMap((folder) => folder.children.flatMap((child) => child.bookmarkKeys));
  assert.equal(keys.length, input.length);
  assert.equal(new Set(keys).size, input.length);
});

test("incremental classification preserves folder order and maps new categories to other", () => {
  const initial = bookmarks(2);
  const initialAssignments = initial.map((bookmark, index) => ({
    confidence: 0.9,
    functionId: index ? "learning" : "news",
    industryId: "technology",
    key: sanitizeSmartBookmark(bookmark).key,
  }));
  const previous = buildSmartBookmarkSnapshot({ assignments: initialAssignments, bookmarks: initial, forceFull: true });
  const added = { title: "Bank", url: "https://bank.example/new" };
  const next = buildSmartBookmarkSnapshot({
    assignments: [{ confidence: 0.95, functionId: "transaction", industryId: "business", key: sanitizeSmartBookmark(added).key }],
    bookmarks: [...initial, added],
    previousSnapshot: previous,
  });
  assert.deepEqual(next.folders.slice(0, previous.folders.length).map((folder) => folder.id), previous.folders.map((folder) => folder.id));
  assert.equal(next.folders.at(-1).id, "other-industry");
});

test("canonical URL strips known trackers but keeps meaningful query parameters", () => {
  assert.equal(
    canonicalSmartBookmarkUrl("https://www.example.com/a/?id=7&utm_campaign=x#top"),
    "https://example.com/a?id=7",
  );
});

test("smart bookmark clustering covers every bookmark once and limits cluster size", () => {
  const input = Array.from({ length: 8 }, (_, index) => ({
    folder: "开发资料",
    title: `API 文档 ${index + 1}`,
    url: `https://docs.example.com/docs/${1_000 + index}`,
  }));
  const clusters = buildSmartBookmarkClusters(input);
  const keys = clusters.flatMap((cluster) => cluster.members.map((bookmark) => bookmark.key));
  assert.equal(keys.length, input.length);
  assert.equal(new Set(keys).size, input.length);
  assert.ok(clusters.every((cluster) => cluster.members.length <= 6));
  assert.ok(clusters.length < input.length);
});

test("DeepSeek payload contains only sanitized bookmark metadata and persists no raw URL", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const storePath = path.join(directory, "snapshot.json");
  let requestBody = "";
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      requestBody = String(options.body || "");
      const request = JSON.parse(requestBody);
      const input = JSON.parse(request.messages[1].content);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          assignments: input.bookmarks.map((bookmark) => ({
            confidence: 0.95,
            functionId: "tools",
            industryId: "technology",
            key: bookmark.key,
          })),
        }) } }],
      }), { headers: { "Content-Type": "application/json" }, status: 200 });
    },
    readSourceHistory: async () => [{ url: "https://example.com/app?token=secret", visits: 30 }],
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath,
  });
  const result = await service.sync({
    bookmarks: [{ folder: "Work", source: "chrome", title: "Example", url: "https://example.com/app?token=secret#x", visits: 20 }],
    history: [{ url: "https://example.com/app?token=secret", visits: 5 }],
  });
  assert.equal(result.status, "success");
  assert.equal(requestBody.includes("api-secret"), false);
  assert.equal(requestBody.includes("token=secret"), false);
  assert.equal(requestBody.includes("\"visits\""), false);
  assert.equal(requestBody.includes("\"source\""), false);
  const persisted = await readFile(storePath, "utf8");
  assert.equal(persisted.includes("example.com"), false);
  assert.equal(persisted.includes("token=secret"), false);
});

test("large DeepSeek collections use compact bounded batches and restore local URL hashes", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-compact-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const inputBookmarks = bookmarks(112);
  const firstLocalKey = sanitizeSmartBookmark(inputBookmarks[0]).key;
  let fetchCalls = 0;
  const requestBookmarkKeyBatches = [];
  const requestBodies = [];
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      fetchCalls += 1;
      const requestBody = String(options.body || "");
      requestBodies.push(requestBody);
      const request = JSON.parse(requestBody);
      const input = JSON.parse(request.messages[1].content);
      requestBookmarkKeyBatches.push(input.bookmarks.map((bookmark) => bookmark.key));
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
          assignments: input.bookmarks.map((bookmark) => ({
            confidence: 0.95,
            functionId: "tools",
            industryId: "technology",
            key: bookmark.key,
          })),
        }) } }],
      }), { headers: { "Content-Type": "application/json" }, status: 200 });
    },
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath: path.join(directory, "snapshot.json"),
  });
  const result = await service.sync({ bookmarks: inputBookmarks, forceFull: true });
  assert.equal(result.status, "success");
  assert.equal(fetchCalls, Math.ceil(inputBookmarks.length / SMART_BOOKMARK_BATCH_SIZE));
  assert.ok(requestBookmarkKeyBatches.every((batch) => batch.length <= SMART_BOOKMARK_BATCH_SIZE));
  assert.ok(requestBookmarkKeyBatches.every((batch) => new Set(batch).size === batch.length));
  assert.deepEqual(requestBookmarkKeyBatches[0].slice(0, 3), ["b0", "b1", "b2"]);
  assert.equal(requestBodies.some((body) => body.includes(firstLocalKey)), false);
  assert.equal(result.snapshot.assignments[0].key, firstLocalKey);
});

test("invalid DeepSeek output retries once and accepts fenced compatible output", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-retry-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  let fetchCalls = 0;
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      fetchCalls += 1;
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      if (fetchCalls === 1) {
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "" } }] }), {
          headers: { "Content-Type": "application/json" }, status: 200,
        });
      }
      const output = {
        assignments: input.bookmarks.map((bookmark) => ({
          confidence: 0.9,
          functionId: "learning",
          industryId: "education",
          key: bookmark.key,
        })),
      };
      return new Response(JSON.stringify({ output_text: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\`` }), {
        headers: { "Content-Type": "application/json" }, status: 200,
      });
    },
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath: path.join(directory, "snapshot.json"),
  });
  const result = await service.sync({ bookmarks: bookmarks(1), forceFull: true });
  assert.equal(result.status, "success");
  assert.equal(fetchCalls, 2);
});

test("DeepSeek SSE responses are reassembled when a gateway ignores stream false", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-sse-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      const output = JSON.stringify({ assignments: input.bookmarks.map((bookmark) => ({
        confidence: 0.91,
        functionId: "news",
        industryId: "media",
        key: bookmark.key,
      })) });
      const midpoint = Math.ceil(output.length / 2);
      const events = [output.slice(0, midpoint), output.slice(midpoint)].map((content, index) =>
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: index ? "stop" : null }] })}`
      );
      return new Response(`${events.join("\n\n")}\n\ndata: [DONE]\n\n`, {
        headers: { "Content-Type": "text/event-stream" }, status: 200,
      });
    },
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath: path.join(directory, "snapshot.json"),
  });
  const result = await service.sync({ bookmarks: bookmarks(2), forceFull: true });
  assert.equal(result.status, "success");
  assert.equal(result.snapshot.assignments.length, 2);
});

test("an incomplete large response is retried as two smaller batches", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-split-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const requestSizes = [];
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      requestSizes.push(input.bookmarks.length);
      if (requestSizes.length === 1) {
        return new Response("upstream response truncated", { headers: { "Content-Type": "text/plain" }, status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        assignments: input.bookmarks.map((bookmark) => ({
          confidence: 0.94,
          functionId: "tools",
          industryId: "technology",
          key: bookmark.key,
        })),
      }) } }] }), { headers: { "Content-Type": "application/json" }, status: 200 });
    },
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath: path.join(directory, "snapshot.json"),
  });
  const result = await service.sync({ bookmarks: bookmarks(4), forceFull: true });
  assert.equal(result.status, "success");
  assert.deepEqual(requestSizes, [4, 2, 2]);
});

test("a timed-out classification request is retried as two smaller batches", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-timeout-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const requestSizes = [];
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      requestSizes.push(input.bookmarks.length);
      if (requestSizes.length === 1) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        assignments: input.bookmarks.map((bookmark) => ({
          confidence: 0.93,
          functionId: "learning",
          industryId: "education",
          key: bookmark.key,
        })),
      }) } }] }), { headers: { "Content-Type": "application/json" }, status: 200 });
    },
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath: path.join(directory, "snapshot.json"),
  });
  const result = await service.sync({ bookmarks: bookmarks(4), forceFull: true });
  assert.equal(result.status, "success");
  assert.deepEqual(requestSizes, [4, 2, 2]);
});

test("failed cluster batches checkpoint completed work and resume without restarting", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-checkpoint-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const storePath = path.join(directory, "snapshot.json");
  const inputBookmarks = bookmarks(SMART_BOOKMARK_BATCH_SIZE + 1);
  let failSmallBatch = true;
  const requestSizes = [];
  const service = createSmartBookmarkService({
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      requestSizes.push(input.bookmarks.length);
      if (input.bookmarks.length === 1 && failSmallBatch) {
        failSmallBatch = false;
        return new Response("busy", { status: 503 });
      }
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        assignments: input.bookmarks.map((bookmark) => ({
          confidence: 0.96,
          functionId: "tools",
          industryId: "technology",
          key: bookmark.key,
        })),
      }) } }] }), { headers: { "Content-Type": "application/json" }, status: 200 });
    },
    resolveDeepSeekProvider: async () => ({ apiKey: "api-secret", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" }),
    storePath,
  });
  const first = await service.sync({ bookmarks: inputBookmarks, forceFull: true });
  assert.equal(first.status, "error");
  const checkpoint = JSON.parse(await readFile(`${storePath}.progress`, "utf8"));
  assert.equal(checkpoint.assignments.length, SMART_BOOKMARK_BATCH_SIZE);
  const callsBeforeResume = requestSizes.length;
  const resumed = await service.sync({ bookmarks: inputBookmarks, forceFull: true });
  assert.equal(resumed.status, "success");
  assert.equal(resumed.snapshot.assignments.length, inputBookmarks.length);
  assert.deepEqual(requestSizes.slice(callsBeforeResume), [1]);
  await assert.rejects(readFile(`${storePath}.progress`, "utf8"));
});

test("smart organizer requires DeepSeek and never calls a fallback provider", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-smart-provider-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  let fetchCalls = 0;
  const service = createSmartBookmarkService({
    fetchImpl: async () => { fetchCalls += 1; throw new Error("unexpected"); },
    resolveDeepSeekProvider: async () => null,
    storePath: path.join(directory, "snapshot.json"),
  });
  const result = await service.sync({ bookmarks: [{ title: "Example", url: "https://example.com" }] });
  assert.equal(result.status, "missing-provider");
  assert.equal(fetchCalls, 0);
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAdblockManager } from "../electron/adblock-manager.mjs";

function fakeApi(matchResult = {}) {
  class FakeBlocker {
    static async fromPrebuiltAdsAndTracking(_fetch, caching) {
      await caching.write(caching.path, new Uint8Array([1, 2, 3]));
      return new FakeBlocker();
    }

    static deserialize() {
      return new FakeBlocker();
    }

    config = { guessRequestTypeFromUrl: false };

    match() {
      return matchResult;
    }
  }
  return {
    FiltersEngine: FakeBlocker,
    Request: {
      fromRawDetails: (details) => ({
        details,
        isMainFrame: () => details.type === "mainFrame",
        type: details.type,
      }),
    },
  };
}

test("loads one cached engine lazily and never blocks a main-frame navigation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-adblock-test-"));
  try {
    let imports = 0;
    const manager = createAdblockManager({
      cachePath: path.join(directory, "engine.bin"),
      fetchImpl: async () => new Response(""),
      importEngine: async () => {
        imports += 1;
        return fakeApi({ match: true });
      },
    });
    assert.equal(manager.match({ resourceType: "script" }), null);
    await Promise.all([manager.load(), manager.load()]);
    assert.equal(imports, 1);
    assert.equal(manager.match({ resourceType: "mainFrame" }), null);
    assert.deepEqual(manager.match({ resourceType: "script" }), { cancel: true });
    assert.equal(manager.status().blockedCount, 1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("preserves safe redirect filters returned by the compiled engine", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-adblock-test-"));
  try {
    const manager = createAdblockManager({
      cachePath: path.join(directory, "engine.bin"),
      fetchImpl: async () => new Response(""),
      importEngine: async () => fakeApi({ redirect: { dataUrl: "data:text/plain," } }),
    });
    await manager.load();
    assert.deepEqual(manager.match({ resourceType: "script" }), {
      redirectURL: "data:text/plain,",
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("matches a real compiled network rule while preserving its exception", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-adblock-test-"));
  try {
    const realApi = await import("@ghostery/adblocker");
    class LocalRulesEngine extends realApi.FiltersEngine {
      static async fromPrebuiltAdsAndTracking() {
        return realApi.FiltersEngine.parse([
          "||ads.example.com^",
          "@@||ads.example.com/allowed.js$script",
        ].join("\n"));
      }
    }
    const manager = createAdblockManager({
      cachePath: path.join(directory, "engine.bin"),
      importEngine: async () => ({
        ...realApi,
        FiltersEngine: LocalRulesEngine,
      }),
    });
    await manager.load();
    assert.deepEqual(manager.match({
      id: 1,
      pageUrl: "https://news.example/article",
      resourceType: "script",
      url: "https://ads.example.com/tracker.js",
      webContentsId: 7,
    }), { cancel: true });
    assert.equal(manager.match({
      id: 2,
      pageUrl: "https://news.example/article",
      resourceType: "script",
      url: "https://ads.example.com/allowed.js",
      webContentsId: 7,
    }), null);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

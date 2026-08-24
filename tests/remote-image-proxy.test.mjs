import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createRemoteImageProxy,
  REMOTE_IMAGE_CACHE_TTL_MS,
  REMOTE_IMAGE_TIMEOUT_MS,
} from "../electron/remote-image-proxy.mjs";

const PUBLIC_IPV4 = "93.184.216.34";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const GIF = Buffer.from("GIF89a", "ascii");
const WEBP = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii")]);
const AVIF = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypavif", "ascii"), Buffer.alloc(8)]);

function createResolver(addressesByHost = {}) {
  const calls = [];
  return {
    calls,
    resolveHostFn: async (hostname) => {
      calls.push(hostname);
      return addressesByHost[hostname] || [{ address: PUBLIC_IPV4, family: 4 }];
    },
  };
}

function createRequestHarness(routes) {
  const calls = [];
  const requestImpl = (url, options, onResponse) => {
    const request = new EventEmitter();
    const call = { options, pinnedAddress: "", url: url.href };
    calls.push(call);
    request.end = () => {
      if (routes[url.href]?.neverRespond) return;
      options.lookup(url.hostname, { all: false, family: 0 }, (lookupError, address, family) => {
        if (lookupError) {
          queueMicrotask(() => request.emit("error", lookupError));
          return;
        }
        call.pinnedAddress = address;
        call.pinnedFamily = family;
        const route = routes[url.href];
        if (!route) {
          queueMicrotask(() => request.emit("error", new Error("Missing fake route.")));
          return;
        }
        if (route.requestError) {
          queueMicrotask(() => request.emit("error", new Error("Synthetic request failure.")));
          return;
        }
        queueMicrotask(() => {
          const response = Readable.from(route.chunks || [route.body || Buffer.alloc(0)]);
          response.statusCode = route.statusCode ?? 200;
          response.headers = route.headers || {};
          onResponse(response);
        });
      });
    };
    request.destroy = (error) => {
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    return request;
  };
  return { calls, requestImpl };
}

function refedSetTimeout(callback, delay) {
  const timer = setTimeout(callback, delay);
  timer.unref = () => timer;
  return timer;
}

function createProxyForRoutes(routes, options = {}) {
  const resolver = createResolver(options.addressesByHost);
  const requests = createRequestHarness(routes);
  const proxy = createRemoteImageProxy({
    requestImpl: requests.requestImpl,
    resolveHostFn: resolver.resolveHostFn,
    ...options.proxyOptions,
  });
  return { proxy, requests, resolver };
}

async function expectProxyError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RemoteImageProxyError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("valid raster images use pinned public DNS and return only a local data URL", async () => {
  const url = "https://images.example.com/photo.png?variant=one";
  const { proxy, requests, resolver } = createProxyForRoutes({
    [url]: {
      body: PNG,
      headers: { "content-type": "image/png", "cache-control": "public, max-age=120" },
    },
  });

  const result = await proxy.getDataUrl(url);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.byteLength, PNG.length);
  assert.equal(result.fromCache, false);
  assert.equal(result.dataUrl, `data:image/png;base64,${PNG.toString("base64")}`);
  assert.deepEqual(resolver.calls, ["images.example.com"]);
  assert.equal(requests.calls[0].pinnedAddress, PUBLIC_IPV4);
  assert.equal(requests.calls[0].options.agent, false);
  assert.equal(requests.calls[0].options.rejectUnauthorized, true);
  const headers = Object.fromEntries(Object.entries(requests.calls[0].options.headers)
    .map(([name, value]) => [name.toLowerCase(), value]));
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.referer, undefined);
  assert.match(headers.accept, /image\/avif/u);

  const cached = await proxy.getDataUrl(url);
  assert.equal(cached.fromCache, true);
  assert.equal(requests.calls.length, 1);
});

test("all supported declared types must agree with their file magic", async () => {
  const fixtures = [
    ["avif", "image/avif", AVIF],
    ["gif", "image/gif", GIF],
    ["jpg", "image/jpeg", JPEG],
    ["png", "image/png", PNG],
    ["webp", "image/webp", WEBP],
  ];
  const routes = Object.fromEntries(fixtures.map(([extension, mimeType, body]) => [
    `https://images.example.com/image.${extension}`,
    { body, headers: { "content-type": mimeType } },
  ]));
  const { proxy } = createProxyForRoutes(routes);

  for (const [extension, mimeType] of fixtures) {
    const result = await proxy.getDataUrl(`https://images.example.com/image.${extension}`);
    assert.equal(result.mimeType, mimeType);
  }
});

test("HTTP, credentials, metadata hosts and local addresses are rejected before requests", async () => {
  const requests = createRequestHarness({});
  const resolver = createResolver();
  const proxy = createRemoteImageProxy({
    requestImpl: requests.requestImpl,
    resolveHostFn: resolver.resolveHostFn,
  });
  const embeddedCredential = randomUUID();
  const unsafeUrls = [
    "http://images.example.com/image.png",
    `https://user:${embeddedCredential}@images.example.com/image.png`,
    "https://metadata.google.internal/image.png",
    "https://127.0.0.1/image.png",
    "https://169.254.169.254/latest/meta-data/image.png",
    `https://images.example.com/${"x".repeat(4_100)}.png`,
  ];
  for (const url of unsafeUrls) await expectProxyError(proxy.getDataUrl(url), "url");
  const error = await proxy.getDataUrl(`https://user:${embeddedCredential}@images.example.com/image.png`)
    .catch((caught) => caught);
  assert.equal(error.message.includes(embeddedCredential), false);
  assert.equal(requests.calls.length, 0);
  assert.equal(resolver.calls.length, 0);
});

test("DNS rejects private answers and mixed public/private answer sets", async () => {
  const url = "https://images.example.com/image.png";
  for (const answers of [
    [{ address: "10.0.0.2", family: 4 }],
    [{ address: PUBLIC_IPV4, family: 4 }, { address: "192.168.1.2", family: 4 }],
    [{ address: "::1", family: 6 }],
  ]) {
    const { proxy, requests } = createProxyForRoutes({}, {
      addressesByHost: { "images.example.com": answers },
    });
    await expectProxyError(proxy.getDataUrl(url), "dns");
    assert.equal(requests.calls.length, 0);
  }
});

test("every redirect is revalidated and cannot reach a private DNS answer", async () => {
  const start = "https://images.example.com/start";
  const target = "https://redirect.example.com/final.png";
  const { proxy, requests, resolver } = createProxyForRoutes({
    [start]: { headers: { location: target }, statusCode: 302 },
  }, {
    addressesByHost: {
      "images.example.com": [{ address: PUBLIC_IPV4, family: 4 }],
      "redirect.example.com": [{ address: "127.0.0.1", family: 4 }],
    },
  });

  await expectProxyError(proxy.getDataUrl(start), "dns");
  assert.deepEqual(resolver.calls, ["images.example.com", "redirect.example.com"]);
  assert.equal(requests.calls.length, 1);
});

test("redirect loops, insecure locations and redirect limits are rejected", async () => {
  const first = "https://images.example.com/first";
  const second = "https://images.example.com/second";
  const loop = createProxyForRoutes({
    [first]: { headers: { location: second }, statusCode: 302 },
    [second]: { headers: { location: first }, statusCode: 302 },
  });
  await expectProxyError(loop.proxy.getDataUrl(first), "redirect");

  const insecure = createProxyForRoutes({
    [first]: { headers: { location: "http://images.example.com/image.png" }, statusCode: 302 },
  });
  await expectProxyError(insecure.proxy.getDataUrl(first), "url");

  const limited = createProxyForRoutes({
    [first]: { headers: { location: second }, statusCode: 302 },
    [second]: { headers: { location: "https://images.example.com/third" }, statusCode: 302 },
  }, { proxyOptions: { maxRedirects: 1 } });
  await expectProxyError(limited.proxy.getDataUrl(first), "redirect");
  assert.equal(limited.requests.calls.length, 2);
});

test("unsupported declarations, SVG, and magic mismatches are rejected", async () => {
  const cases = [
    ["html-type", "text/html", PNG, "content_type"],
    ["svg", "image/svg+xml", Buffer.from("<svg/>", "utf8"), "content_type"],
    ["html-body", "image/png", Buffer.from("<html/>", "utf8"), "magic"],
    ["mismatch", "image/jpeg", PNG, "magic"],
  ];
  const routes = Object.fromEntries(cases.map(([name, contentType, body]) => [
    `https://images.example.com/${name}`,
    { body, headers: { "content-type": contentType } },
  ]));
  const { proxy } = createProxyForRoutes(routes);
  for (const [name, , , code] of cases) {
    await expectProxyError(proxy.getDataUrl(`https://images.example.com/${name}`), code);
  }
});

test("declared and streamed image sizes are both bounded", async () => {
  const declared = "https://images.example.com/declared.png";
  const streamed = "https://images.example.com/streamed.png";
  const { proxy } = createProxyForRoutes({
    [declared]: {
      body: PNG,
      headers: { "content-length": "11", "content-type": "image/png" },
    },
    [streamed]: {
      chunks: [PNG, Buffer.alloc(4)],
      headers: { "content-type": "image/png" },
    },
  }, { proxyOptions: { maxBytes: 10 } });

  await expectProxyError(proxy.getDataUrl(declared), "size");
  await expectProxyError(proxy.getDataUrl(streamed), "size");
});

test("a stalled DNS resolution is terminated by the total timeout", async () => {
  const proxy = createRemoteImageProxy({
    requestImpl: createRequestHarness({}).requestImpl,
    resolveHostFn: () => new Promise(() => {}),
    setTimeoutFn: refedSetTimeout,
    timeoutMs: 15,
  });

  await expectProxyError(proxy.getDataUrl("https://images.example.com/stalled.png"), "timeout");
});

test("a server that never responds is terminated by the same total timeout", async () => {
  const url = "https://images.example.com/stalled-response.png";
  const requests = createRequestHarness({ [url]: { neverRespond: true } });
  const resolver = createResolver();
  const proxy = createRemoteImageProxy({
    requestImpl: requests.requestImpl,
    resolveHostFn: resolver.resolveHostFn,
    setTimeoutFn: refedSetTimeout,
    timeoutMs: 15,
  });

  await expectProxyError(proxy.getDataUrl(url), "timeout");
  assert.equal(requests.calls.length, 1);
});

test("LRU and TTL cache eviction refetches only stale or least-recent entries", async () => {
  let now = 1_000;
  const urls = ["a", "b", "c"].map((name) => `https://images.example.com/${name}.png`);
  const routes = Object.fromEntries(urls.map((url) => [url, {
    body: PNG,
    headers: { "content-type": "image/png" },
  }]));
  const { proxy, requests } = createProxyForRoutes(routes, {
    proxyOptions: {
      maxCacheEntries: 2,
      nowFn: () => now,
    },
  });

  await proxy.getDataUrl(urls[0]);
  await proxy.getDataUrl(urls[1]);
  await proxy.getDataUrl(urls[0]);
  await proxy.getDataUrl(urls[2]);
  await proxy.getDataUrl(urls[1]);
  assert.equal(requests.calls.length, 4);
  assert.equal(proxy.stats().entries, 2);

  now += REMOTE_IMAGE_CACHE_TTL_MS + 1;
  await proxy.getDataUrl(urls[1]);
  assert.equal(requests.calls.length, 5);
});

test("no-store/no-cache responses and concurrent misses behave safely", async () => {
  const noStoreUrl = "https://images.example.com/no-store.png";
  const noCacheUrl = "https://images.example.com/no-cache.png";
  const sharedUrl = "https://images.example.com/shared.png";
  const { proxy, requests } = createProxyForRoutes({
    [noStoreUrl]: {
      body: PNG,
      headers: { "cache-control": "no-store", "content-type": "image/png" },
    },
    [noCacheUrl]: {
      body: PNG,
      headers: { "cache-control": "no-cache", "content-type": "image/png" },
    },
    [sharedUrl]: {
      body: PNG,
      headers: { "content-type": "image/png" },
    },
  });

  await proxy.getDataUrl(noStoreUrl);
  await proxy.getDataUrl(noStoreUrl);
  assert.equal(requests.calls.filter((call) => call.url === noStoreUrl).length, 2);
  await proxy.getDataUrl(noCacheUrl);
  await proxy.getDataUrl(noCacheUrl);
  assert.equal(requests.calls.filter((call) => call.url === noCacheUrl).length, 2);

  const [first, second] = await Promise.all([
    proxy.getDataUrl(sharedUrl),
    proxy.getDataUrl(sharedUrl),
  ]);
  assert.equal(first.dataUrl, second.dataUrl);
  assert.equal(requests.calls.filter((call) => call.url === sharedUrl).length, 1);
});

test("cache byte limits evict old entries and clear prevents an in-flight refill", async () => {
  const firstUrl = "https://images.example.com/first.png";
  const secondUrl = "https://images.example.com/second.png";
  const pendingUrl = "https://images.example.com/pending.png";
  const { proxy, requests } = createProxyForRoutes({
    [firstUrl]: { body: PNG, headers: { "content-type": "image/png" } },
    [secondUrl]: { body: PNG, headers: { "content-type": "image/png" } },
    [pendingUrl]: { body: PNG, headers: { "content-type": "image/png" } },
  }, { proxyOptions: { maxCacheBytes: 40 } });

  await proxy.getDataUrl(firstUrl);
  await proxy.getDataUrl(secondUrl);
  await proxy.getDataUrl(firstUrl);
  assert.equal(requests.calls.length, 3);
  assert.equal(proxy.stats().entries, 1);

  const pending = proxy.getDataUrl(pendingUrl);
  proxy.clear();
  await pending;
  assert.equal(proxy.stats().entries, 0);
});

test("module defaults remain bounded", () => {
  assert.equal(REMOTE_IMAGE_TIMEOUT_MS, 8_000);
  assert.equal(REMOTE_IMAGE_CACHE_TTL_MS, 30 * 60 * 1_000);
});

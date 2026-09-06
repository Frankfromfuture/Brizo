const TAOBAO_CARD_SELECTORS = [
  "[class*='doubleCardWrapper']",
  "[class*='cardWrapper']",
  "[class*='Card--']",
  "#mainsrp-itemlist .item",
  "[data-category='auctions'] .item",
  ".item.J_MouserOnverReq",
];

function decodeRepeated(value) {
  let result = String(value || "");
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result.replace(/\s+/g, " ").trim();
}

export function taobaoQueryFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:"
      || url.hostname.toLocaleLowerCase() !== "s.taobao.com"
      || url.pathname.replace(/\/+$/, "") !== "/search"
      || url.username
      || url.password
      || (url.port && url.port !== "443")) return "";
    return decodeRepeated(url.searchParams.get("q") || "").replace(/[，。；、]+$/u, "").trim();
  } catch {
    return "";
  }
}

export function parseTaobaoPriceCommand(value, currentUrl = "") {
  const command = String(value || "").replace(/\s+/g, " ").trim();
  if (!command || !/(价格|价钱|多少钱|报价)/.test(command)) return null;
  const urlQuery = taobaoQueryFromUrl(currentUrl);
  const commandQuery = command.match(/不同的(.+?)(?:的)?(?:价格|价钱|报价)/)?.[1]
    || command.match(/搜(?:索)?(?:一下)?(?:几个)?(.+?)(?:的)?(?:价格|价钱|报价)/)?.[1]
    || "";
  const query = String(commandQuery || urlQuery)
    .replace(/^(?:几个|一些|不同的)+/, "")
    .replace(/的$/, "")
    .trim();
  if (!query) return null;
  return { command, query, wantsDistinct: /(几个|不同|比较|对比|列出|看看)/.test(command) };
}

export function buildTaobaoSearchUrl(query) {
  const clean = String(query || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) throw new Error("淘宝搜索词为空。");
  return `https://s.taobao.com/search?q=${encodeURIComponent(clean)}`;
}

function queryMatchesResult(value, intent) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && url.hostname.toLocaleLowerCase() === "s.taobao.com"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && url.pathname.replace(/\/+$/, "") === "/search"
      && taobaoQueryFromUrl(url.href).toLocaleLowerCase()
        === String(intent?.query || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  } catch {
    return false;
  }
}

function safeMarketplaceItemUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value));
    const hostname = url.hostname.toLocaleLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && (hostname === "taobao.com" || hostname.endsWith(".taobao.com")
        || hostname === "tmall.com" || hostname.endsWith(".tmall.com")
        || hostname === "tb.cn" || hostname.endsWith(".tb.cn"));
  } catch {
    return false;
  }
}

function validObservedItem(item) {
  return Boolean(item)
    && Number.isInteger(item.index)
    && item.index >= 0
    && Number.isFinite(Number(item.price))
    && Number(item.price) > 0
    && Boolean(String(item.title || "").trim())
    && safeMarketplaceItemUrl(item.url);
}

function compactVerification(checks) {
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    ok: failures.length === 0,
    checks: Object.freeze({ ...checks }),
    failures: Object.freeze(failures),
  });
}

export function verifyTaobaoPriceObservation(result, intent) {
  const items = Array.isArray(result?.items) ? result.items : [];
  return compactVerification({
    queryUrl: queryMatchesResult(result?.url, intent),
    observedItems: items.length >= 2 && items.every(validObservedItem),
    loginClear: result?.loginRequired !== true,
  });
}

export function verifyTaobaoPriceSelection(result, intent, selectedItems, minimumItems = 2) {
  const observation = verifyTaobaoPriceObservation(result, intent);
  const observed = Array.isArray(result?.items) ? result.items.filter(validObservedItem) : [];
  const selected = Array.isArray(selectedItems) ? selectedItems : [];
  const requiredCount = Math.max(2, Math.min(10, Number(minimumItems) || 2));
  const fromObservation = selected.length >= requiredCount && selected.every((item) =>
    observed.some((candidate) => candidate.index === item.index
      && Number(candidate.price) === Number(item.price)
      && String(candidate.title || "") === String(item.title || "")
      && String(candidate.url || "") === String(item.url || ""))
  );
  const prices = selected.map((item) => Number(item.price).toFixed(2));
  return compactVerification({
    ...observation.checks,
    selectedItems: selected.length >= requiredCount,
    selectionFromObservation: fromObservation,
    distinctPrices: fromObservation && new Set(prices).size === prices.length,
  });
}

const READ_TAOBAO_RESULTS_SCRIPT = `
  (() => {
    const clean = (value, limit = 800) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, limit);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden"
        && Number(style.opacity || 1) > 0.02 && rect.width > 100 && rect.height > 80;
    };
    const selectors = ${JSON.stringify(TAOBAO_CARD_SELECTORS)};
    let cards = [];
    for (const selector of selectors) {
      const matches = [...document.querySelectorAll(selector)].filter(visible);
      if (matches.length >= 2) {
        cards = matches;
        break;
      }
    }
    const priceFor = (card) => {
      const preferred = [
        "[class*='priceInt']", "[class*='Price--price']", ".price strong",
        "[class*='priceWrapper']", "[class*='price']",
      ].flatMap((selector) => [...card.querySelectorAll(selector)]);
      for (const node of preferred) {
        const text = clean(
          /priceInt/i.test(node.className) ? node.parentElement?.textContent : node.textContent,
          80,
        );
        const match = text.match(/[¥￥]?\\s*([0-9]{1,7}(?:\\.[0-9]{1,2})?)/);
        const price = Number(match?.[1]);
        if (Number.isFinite(price) && price > 0) return price;
      }
      const fallback = clean(card.innerText).match(/[¥￥]\\s*([0-9]{1,7}(?:\\.[0-9]{1,2})?)/);
      return fallback ? Number(fallback[1]) : null;
    };
    const items = cards.slice(0, 80).map((card, index) => {
      const rect = card.getBoundingClientRect();
      const link = card.matches("a[href]") ? card : card.querySelector("a[href]");
      const titleNode = card.querySelector("[class*='title'], .title, [class*='Title']");
      const title = clean(titleNode?.innerText || link?.getAttribute("title") || card.innerText, 240);
      return {
        index,
        price: priceFor(card),
        rect: { height: rect.height, left: rect.left, top: rect.top, width: rect.width },
        title,
        url: clean(link?.href, 1000),
      };
    }).filter((item) => Number.isFinite(item.price) && item.title);
    const bodyText = clean(document.body?.innerText, 6000);
    return {
      items,
      loginRequired: /请重新登录|亲，请登录|扫码登录更安全/.test(bodyText) && items.length === 0,
      pageText: bodyText,
      title: clean(document.title, 240),
      url: location.href,
    };
  })()
`;

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function boundedResult(promise, timeout) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readTaobaoPriceResults(webContents) {
  return await webContents.executeJavaScript(READ_TAOBAO_RESULTS_SCRIPT);
}

export async function waitForTaobaoPriceResults(webContents, {
  expectedIntent = null,
  observationTimeout = 2_500,
  pollInterval = 500,
  timeout = 25_000,
} = {}) {
  const deadline = Date.now() + timeout;
  let latest = null;
  let lastSignature = "";
  while (!webContents.isDestroyed() && Date.now() < deadline) {
    latest = await boundedResult(
      readTaobaoPriceResults(webContents).catch(() => null),
      Math.max(10, Math.min(observationTimeout, deadline - Date.now())),
    );
    if (latest?.loginRequired) throw new Error("淘宝要求重新登录，请先在当前页面完成登录后再试。");
    const observationVerified = !expectedIntent
      || verifyTaobaoPriceObservation(latest, expectedIntent).ok;
    if (latest?.items?.length && observationVerified) {
      const signature = latest.items.map((item) => `${item.price}:${item.title}`).join("|");
      if (signature === lastSignature) return latest;
      lastSignature = signature;
    } else {
      lastSignature = "";
    }
    await sleep(Math.max(10, Math.min(pollInterval, deadline - Date.now())));
  }
  throw new Error(latest?.url?.includes("taobao.com")
    ? "淘宝商品结果在 25 秒内没有完成加载，已自动停止。"
    : "淘宝搜索页没有成功打开。");
}

export function selectDistinctPriceItems(items, limit = 5) {
  const selected = [];
  const prices = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!validObservedItem(item)) continue;
    const key = Number(item?.price).toFixed(2);
    if (!Number.isFinite(Number(item?.price)) || prices.has(key)) continue;
    prices.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function highlightTaobaoItems(webContents, indexes) {
  const safeIndexes = (Array.isArray(indexes) ? indexes : [])
    .filter((index) => Number.isInteger(index) && index >= 0)
    .slice(0, 12);
  return await webContents.executeJavaScript(`
    (() => {
      document.querySelectorAll("[data-brizo-price-highlight]").forEach((node) => node.remove());
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 100 && rect.height > 80;
      };
      const selectors = ${JSON.stringify(TAOBAO_CARD_SELECTORS)};
      let cards = [];
      for (const selector of selectors) {
        const matches = [...document.querySelectorAll(selector)].filter(visible);
        if (matches.length >= 2) { cards = matches; break; }
      }
      const selected = ${JSON.stringify(safeIndexes)}.map((index) => cards[index]).filter(Boolean);
      selected[0]?.scrollIntoView({ block: "center", behavior: "instant" });
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const card of selected) {
          const rect = card.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > innerHeight) continue;
          const overlay = document.createElement("div");
          overlay.dataset.brizoPriceHighlight = "true";
          overlay.style.cssText = [
            "position:fixed", "pointer-events:none", "z-index:2147483647",
            "border:3px solid #e53935", "border-radius:8px", "box-sizing:border-box",
            "left:" + Math.max(0, rect.left) + "px", "top:" + Math.max(0, rect.top) + "px",
            "width:" + Math.min(innerWidth - Math.max(0, rect.left), rect.width) + "px",
            "height:" + Math.min(innerHeight - Math.max(0, rect.top), rect.height) + "px",
          ].join(";");
          document.body.appendChild(overlay);
        }
        resolve(document.querySelectorAll("[data-brizo-price-highlight]").length);
      })));
    })()
  `);
}

export async function clearTaobaoHighlights(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  await webContents.executeJavaScript(
    `document.querySelectorAll("[data-brizo-price-highlight]").forEach((node) => node.remove())`,
  ).catch(() => {});
}

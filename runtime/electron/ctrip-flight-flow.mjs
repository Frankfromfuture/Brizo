import { detectBrowserSecurityBlock } from "./browser-security-block.mjs";

const CITY_CODES = [
  { code: "BJS", names: ["北京", "北京市", "beijing"] },
  { code: "SHA", names: ["上海", "上海市", "shanghai"] },
  { code: "CAN", names: ["广州", "广州市", "guangzhou"] },
  { code: "SZX", names: ["深圳", "深圳市", "shenzhen"] },
  { code: "CTU", names: ["成都", "成都市", "chengdu"] },
  { code: "CKG", names: ["重庆", "重庆市", "chongqing"] },
  { code: "HGH", names: ["杭州", "杭州市", "hangzhou"] },
  { code: "NKG", names: ["南京", "南京市", "nanjing"] },
  { code: "WUH", names: ["武汉", "武汉市", "wuhan"] },
  { code: "XIY", names: ["西安", "西安市", "xian"] },
  { code: "KMG", names: ["昆明", "昆明市", "kunming"] },
  { code: "CSX", names: ["长沙", "长沙市", "changsha"] },
  { code: "TAO", names: ["青岛", "青岛市", "qingdao"] },
  { code: "XMN", names: ["厦门", "厦门市", "xiamen"] },
  { code: "HAK", names: ["海口", "海口市", "haikou"] },
  { code: "SYX", names: ["三亚", "三亚市", "sanya"] },
];

function localDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function cityAfterMarker(text, marker, startAt = 0) {
  const lowerText = text.toLocaleLowerCase();
  const lowerMarker = marker.toLocaleLowerCase();
  const names = CITY_CODES.flatMap((city) => city.names.map((name) => ({ city, name })))
    .sort((left, right) => right.name.length - left.name.length);
  let markerIndex = lowerText.indexOf(lowerMarker, Math.max(0, startAt));
  while (markerIndex >= 0) {
    const suffix = lowerText.slice(markerIndex + marker.length).trimStart();
    const match = names.find(({ name }) => suffix.startsWith(name.toLocaleLowerCase()));
    if (match) return match.city;
    markerIndex = lowerText.indexOf(lowerMarker, markerIndex + marker.length);
  }
  return null;
}

function cityRoutePair(text) {
  const lowerText = text.toLocaleLowerCase();
  const names = CITY_CODES.flatMap((city) => city.names.map((name) => ({ city, name: name.toLocaleLowerCase() })))
    .sort((left, right) => right.name.length - left.name.length);
  for (const origin of names) {
    let originIndex = lowerText.indexOf(origin.name);
    while (originIndex >= 0) {
      const afterOrigin = lowerText.slice(originIndex + origin.name.length);
      const separator = afterOrigin.match(/^\s*(?:到|至|飞往|飞|[-–—~～→])\s*/u)?.[0];
      if (separator) {
        const destinationText = afterOrigin.slice(separator.length);
        const destination = names.find((candidate) => destinationText.startsWith(candidate.name));
        if (destination && destination.city.code !== origin.city.code) {
          return { destination: destination.city, origin: origin.city };
        }
      }
      originIndex = lowerText.indexOf(origin.name, originIndex + origin.name.length);
    }
  }
  return null;
}

function requestedDate(command, now) {
  const explicit = command.match(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?\b/);
  if (explicit) {
    const date = new Date(now);
    date.setFullYear(Number(explicit[1]), Number(explicit[2]) - 1, Number(explicit[3]));
    date.setHours(12, 0, 0, 0);
    return localDateString(date);
  }
  const offset = command.includes("后天") ? 2 : command.includes("明天") ? 1 : command.includes("今天") ? 0 : null;
  if (offset !== null) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return localDateString(date);
  }
  const weekday = command.match(/(下(?:个)?(?:周|星期)|本周|这周|本星期|这星期|周|星期)([一二三四五六日天])/);
  if (!weekday) return "";
  const weekdayIndexes = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  const targetIndex = weekdayIndexes[weekday[2]];
  const date = new Date(now);
  const currentIndex = (date.getDay() + 6) % 7;
  const daysUntil = weekday[1].startsWith("下")
    ? 7 - currentIndex + targetIndex
    : (targetIndex - currentIndex + 7) % 7;
  date.setDate(date.getDate() + daysUntil);
  return localDateString(date);
}

function clockMinutes(period, hour, minute = 0) {
  let normalizedHour = Number(hour);
  const normalizedMinute = Number(minute || 0);
  if (!Number.isInteger(normalizedHour) || normalizedHour < 0 || normalizedHour > 23
    || !Number.isInteger(normalizedMinute) || normalizedMinute < 0 || normalizedMinute > 59) return null;
  if (/下午|傍晚|晚上/.test(period || "") && normalizedHour < 12) normalizedHour += 12;
  if (/凌晨|上午|早上/.test(period || "") && normalizedHour === 12) normalizedHour = 0;
  return normalizedHour * 60 + normalizedMinute;
}

function departureWindow(command) {
  const period = "(凌晨|早上|上午|中午|下午|傍晚|晚上)?";
  const clock = "(\\d{1,2})(?:\\s*[:：]\\s*(\\d{1,2})|\\s*(?:点|时)(?:\\s*(\\d{1,2})\\s*分?)?)";
  const match = command.match(new RegExp(`${period}\\s*${clock}\\s*(?:到|至|[-—~～])\\s*${period}\\s*${clock}`));
  const label = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  if (match) {
    const startPeriod = match[1] || "";
    const endPeriod = match[5] || startPeriod;
    const start = clockMinutes(startPeriod, match[2], match[3] || match[4]);
    const end = clockMinutes(endPeriod, match[6], match[7] || match[8]);
    if (start !== null && end !== null && end > start) {
      return { end, label: `${label(start)}–${label(end)}`, start };
    }
  }
  const nearby = command.match(new RegExp(`${period}\\s*${clock}\\s*(?:左右|附近|前后)`));
  if (!nearby) {
    return /下午(?!\s*[0-9一二三四五六七八九十])/.test(command)
      ? { start: 12 * 60, end: 18 * 60 - 1, label: "12:00–18:00（不含18:00）" }
      : null;
  }
  const center = clockMinutes(nearby[1] || "", nearby[2], nearby[3] || nearby[4]);
  if (center === null) return null;
  const start = Math.max(0, center - 60);
  const end = Math.min(23 * 60 + 59, center + 60);
  return { end, label: `${label(start)}–${label(end)}（${label(center)} 附近）`, start };
}

export function parseCtripFlightCommand(value, now = new Date()) {
  const command = String(value || "").replace(/\s+/g, " ").trim();
  if (!command || !/(机票|航班|flight)/i.test(command)) return null;
  const fromIndex = command.indexOf("从");
  const routePair = cityRoutePair(command);
  const origin = cityAfterMarker(command, "从") || routePair?.origin;
  const destination = cityAfterMarker(command, "到", fromIndex >= 0 ? fromIndex + 1 : 0)
    || cityAfterMarker(command, "飞往", fromIndex >= 0 ? fromIndex + 1 : 0)
    || routePair?.destination;
  const date = requestedDate(command, now);
  if (!origin || !destination || origin.code === destination.code || !date) return null;
  return {
    command,
    date,
    departureWindow: departureWindow(command),
    destination,
    origin,
    wantsCheapest: /(最便宜|最低价|价格最低|cheapest|lowest price)/i.test(command),
  };
}

export function buildCtripFlightUrl(intent) {
  const origin = String(intent?.origin?.code || "").toLocaleLowerCase();
  const destination = String(intent?.destination?.code || "").toLocaleLowerCase();
  const date = String(intent?.date || "");
  if (!/^[a-z]{3}$/.test(origin) || !/^[a-z]{3}$/.test(destination) || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("航班路线或日期不完整。");
  }
  return `https://flights.ctrip.com/online/list/oneway-${origin}-${destination}?depdate=${encodeURIComponent(date)}`;
}

function validClock(value) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):[0-5]\d$/);
  return Boolean(match);
}

function validObservedFlight(card) {
  if (!card || !Number.isInteger(card.index) || card.index < 0) return false;
  if (!Number.isFinite(Number(card.price)) || Number(card.price) <= 0) return false;
  const times = Array.isArray(card.times) ? card.times.filter(validClock) : [];
  const flightNumber = String(card.flightNumber || "").replace(/\s+/g, "");
  return times.length >= 2 || /^[A-Z0-9]{2}\d{3,4}$/i.test(flightNumber);
}

function trustedCtripResultUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && url.hostname.toLocaleLowerCase() === "flights.ctrip.com"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && /^\/online\/list\/oneway-[a-z]{3}-[a-z]{3}$/i.test(url.pathname.replace(/\/+$/, ""))
      && /^20\d{2}-\d{2}-\d{2}$/.test(url.searchParams.get("depdate") || "");
  } catch {
    return false;
  }
}

function routeAndDateMatch(value, intent) {
  if (!trustedCtripResultUrl(value)) return false;
  if (!intent) return true;
  const url = new URL(String(value));
  const origin = String(intent?.origin?.code || "").toLocaleLowerCase();
  const destination = String(intent?.destination?.code || "").toLocaleLowerCase();
  const expectedPath = `/online/list/oneway-${origin}-${destination}`;
  return url.pathname.replace(/\/+$/, "").toLocaleLowerCase() === expectedPath
    && url.searchParams.get("depdate") === String(intent?.date || "");
}

function compactVerification(checks) {
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    ok: failures.length === 0,
    checks: Object.freeze({ ...checks }),
    failures: Object.freeze(failures),
  });
}

export function verifyCtripFlightObservation(result, intent) {
  const cards = Array.isArray(result?.cards) ? result.cards : [];
  return compactVerification({
    routeAndDate: routeAndDateMatch(result?.url, intent),
    observedFlights: cards.length > 0 && cards.every(validObservedFlight),
  });
}

export function verifyCtripFlightSelection(result, intent, selectedFlights) {
  const observation = verifyCtripFlightObservation(result, intent);
  const cards = Array.isArray(result?.cards) ? result.cards.filter(validObservedFlight) : [];
  const selected = Array.isArray(selectedFlights) ? selectedFlights : [];
  const eligible = intent?.departureWindow
    ? cards.filter((card) => {
      const departure = minutesForTime(card?.times?.[0]);
      return departure !== null
        && departure >= intent.departureWindow.start
        && departure <= intent.departureWindow.end;
    })
    : cards;
  const lowestEligiblePrice = eligible.length
    ? Math.min(...eligible.map((card) => Number(card.price)))
    : null;
  const fromObservation = selected.length > 0 && selected.every((flight) =>
    eligible.some((card) => card.index === flight.index
      && Number(card.price) === Number(flight.price)
      && String(card.flightNumber || "") === String(flight.flightNumber || "")
      && String(card.times?.[0] || "") === String(flight.times?.[0] || ""))
  );
  const matchesIntent = fromObservation && (!intent?.wantsCheapest
    || selected.every((flight) => Number(flight.price) === lowestEligiblePrice));
  return compactVerification({
    ...observation.checks,
    selectedFlights: selected.length > 0,
    selectionFromObservation: fromObservation,
    selectionMatchesIntent: matchesIntent,
  });
}

const READ_CTRIP_RESULTS_SCRIPT = `
  (() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden"
        && Number(style.opacity || 1) > 0.02 && rect.width > 80 && rect.height > 30;
    };
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const priceFor = (card) => {
      const preferred = card.querySelector(".flight-price .price, .flight-price, [class*='price'] .price, .price");
      const candidates = [preferred?.textContent, ...[...card.querySelectorAll("[class*='price']")].map((node) => node.textContent)];
      for (const text of candidates) {
        const match = clean(text).match(/[¥￥]\\s*([0-9][0-9,]*)/);
        if (match) return Number(match[1].replace(/,/g, ""));
      }
      return null;
    };
    const selectors = [".flight-box", "[class*='flight-card']", "[class*='flightCard']"];
    const cards = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter(visible)
      .map((card, index) => {
        const text = clean(card.innerText);
        const rect = card.getBoundingClientRect();
        const price = priceFor(card);
        const times = [...text.matchAll(/(?:^|\\s)((?:[01]\\d|2[0-3]):[0-5]\\d)(?=\\s|$)/g)].map((match) => match[1]).slice(0, 2);
        const flightNumber = text.match(/(?:^|\\s)([A-Z0-9]{2}\\s?\\d{3,4})(?=\\s|$)/i)?.[1]?.replace(/\\s+/g, "") || "";
        const lines = String(card.innerText || "").split(/\\n+/).map(clean).filter(Boolean);
        const airports = lines.filter((line) => /机场|航站楼|T\\d/i.test(line) && line.length < 50).slice(0, 2);
        const airline = lines.find((line) => /航空|航司|海航/.test(line) && line.length < 50) || "";
        return {
          airline,
          airports,
          flightNumber,
          index,
          price,
          rect: { height: rect.height, left: rect.left, top: rect.top, width: rect.width },
          text: text.slice(0, 800),
          times,
        };
      })
      .filter((card) => Number.isFinite(card.price));
    const frames = [...document.querySelectorAll("iframe,frame")]
      .filter(visible)
      .slice(0, 24)
      .map((frame) => {
        let url = "";
        try {
          const parsed = new URL(frame.src || "", location.href);
          url = /^https?:$/.test(parsed.protocol) ? parsed.origin + parsed.pathname : parsed.protocol;
        } catch {}
        return {
          name: clean(frame.getAttribute("aria-label") || frame.title || frame.name).slice(0, 240),
          url,
        };
      });
    return {
      cards,
      frames,
      pageText: clean(document.body?.innerText || "").slice(0, 12000),
      title: document.title,
      url: location.href,
    };
  })()
`;

function throwIfCtripSecurityBlocked(observation) {
  const block = detectBrowserSecurityBlock(observation);
  if (!block) return;
  const error = new Error(block.message);
  error.code = "BRIZO_SITE_SECURITY_BLOCK";
  error.blockCode = block.code;
  error.progress = block.progress;
  throw error;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function boundedResult(promise, timeout) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readCtripFlightResults(webContents) {
  return await webContents.executeJavaScript(READ_CTRIP_RESULTS_SCRIPT);
}

export async function waitForCtripFlightResults(webContents, {
  expectedIntent = null,
  observationTimeout = 2_500,
  pollInterval = 450,
  timeout = 30_000,
} = {}) {
  const deadline = Date.now() + timeout;
  let latest = null;
  let lastError = null;
  let lastSignature = "";
  while (!webContents.isDestroyed() && Date.now() < deadline) {
    try {
      latest = await boundedResult(
        readCtripFlightResults(webContents),
        Math.max(10, Math.min(observationTimeout, deadline - Date.now())),
      );
      throwIfCtripSecurityBlocked(latest);
      const observationVerified = verifyCtripFlightObservation(latest, expectedIntent).ok;
      if (latest?.cards?.length && observationVerified) {
        const signature = latest.cards
          .map((card) => `${card.flightNumber || "flight"}:${card.price}`)
          .join("|");
        if (signature === lastSignature) return latest;
        lastSignature = signature;
      } else {
        lastSignature = "";
      }
    } catch (error) {
      if (error?.code === "BRIZO_SITE_SECURITY_BLOCK") throw error;
      lastError = error;
      // The previous document can disappear between navigation and the first result paint.
    }
    await sleep(Math.max(10, Math.min(pollInterval, deadline - Date.now())));
  }
  throw new Error(latest?.url?.includes("ctrip.com")
    ? `携程结果页未在限定时间内显示可读取的航班${lastError?.message ? `（${lastError.message}）` : ""}，可能遇到登录、验证码或网络限制。`
    : "携程航班结果页在限定时间内没有成功打开。");
}

export async function collectCtripFlightResults(webContents, {
  expectedIntent = null,
  pollInterval = 300,
  timeout = 6_000,
} = {}) {
  const deadline = Date.now() + timeout;
  let latest = await boundedResult(
    readCtripFlightResults(webContents),
    Math.max(10, Math.min(1_500, timeout)),
  );
  throwIfCtripSecurityBlocked(latest);
  if (!verifyCtripFlightObservation(latest, expectedIntent).ok) latest = null;
  let stableAtBottom = 0;
  let previousSignature = "";
  while (!webContents.isDestroyed() && Date.now() < deadline) {
    const scrollState = await boundedResult(webContents.executeJavaScript(`(() => {
      const root = document.scrollingElement || document.documentElement;
      const before = root.scrollTop;
      root.scrollTo({ behavior: "instant", top: root.scrollHeight });
      return { before, height: root.scrollHeight, top: root.scrollTop, viewport: root.clientHeight };
    })()`), Math.max(10, Math.min(1_000, deadline - Date.now())));
    await sleep(Math.max(10, Math.min(pollInterval, deadline - Date.now())));
    const current = await boundedResult(
      readCtripFlightResults(webContents),
      Math.max(10, Math.min(1_500, deadline - Date.now())),
    );
    throwIfCtripSecurityBlocked(current);
    if (current?.cards?.length
      && verifyCtripFlightObservation(current, expectedIntent).ok) latest = current;
    const signature = latest?.cards
      ?.map((card) => `${card.flightNumber || "flight"}:${card.times?.[0] || ""}:${card.price}`)
      .join("|") || "";
    const atBottom = scrollState
      && scrollState.top + scrollState.viewport >= scrollState.height - 4;
    stableAtBottom = atBottom && signature === previousSignature ? stableAtBottom + 1 : 0;
    previousSignature = signature;
    if (stableAtBottom >= 2) break;
  }
  return latest ? { ...latest, collectionComplete: stableAtBottom >= 2 } : null;
}

export function selectCheapestFlights(cards) {
  const priced = (Array.isArray(cards) ? cards : []).filter((card) => Number.isFinite(card?.price));
  if (!priced.length) return { flights: [], price: null };
  const price = Math.min(...priced.map((card) => card.price));
  return { flights: priced.filter((card) => card.price === price), price };
}

function minutesForTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function selectCtripFlights(cards, intent, limit = 8) {
  let flights = (Array.isArray(cards) ? cards : []).filter(validObservedFlight);
  if (intent?.departureWindow) {
    flights = flights.filter((flight) => {
      const departure = minutesForTime(flight?.times?.[0]);
      return departure !== null
        && departure >= intent.departureWindow.start
        && departure <= intent.departureWindow.end;
    });
  }
  if (intent?.wantsCheapest && flights.length) {
    const lowestPrice = Math.min(...flights.map((flight) => flight.price));
    flights = flights.filter((flight) => flight.price === lowestPrice);
  }
  return flights.slice(0, Math.max(1, limit));
}

export async function highlightCtripFlights(webContents, indexes) {
  const safeIndexes = (Array.isArray(indexes) ? indexes : [])
    .filter((index) => Number.isInteger(index) && index >= 0)
    .slice(0, 20);
  return await webContents.executeJavaScript(`
    (() => {
      document.querySelectorAll("[data-brizo-flight-highlight]").forEach((node) => node.remove());
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 80 && rect.height > 30;
      };
      const selectors = [".flight-box", "[class*='flight-card']", "[class*='flightCard']"];
      const cards = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))].filter(visible);
      const indexes = ${JSON.stringify(safeIndexes)};
      const selected = indexes.map((index) => cards[index]).filter(Boolean);
      selected[0]?.scrollIntoView({ block: "center", behavior: "instant" });
      const create = () => {
        document.querySelectorAll("[data-brizo-flight-highlight]").forEach((node) => node.remove());
        for (const card of selected) {
          const rect = card.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > innerHeight) continue;
          const overlay = document.createElement("div");
          overlay.dataset.brizoFlightHighlight = "true";
          const left = Math.max(0, rect.left);
          const top = Math.max(0, rect.top);
          const right = Math.min(innerWidth, rect.right);
          const bottom = Math.min(innerHeight, rect.bottom);
          overlay.style.cssText = [
            "position:fixed", "pointer-events:none", "z-index:2147483647",
            "border:3px solid #e53935", "border-radius:8px", "box-sizing:border-box",
            "box-shadow:0 0 0 1px rgba(255,255,255,.9),0 2px 8px rgba(150,20,20,.2)",
            "left:" + left + "px", "top:" + top + "px",
            "width:" + Math.max(0, right - left) + "px",
            "height:" + Math.max(0, bottom - top) + "px",
          ].join(";");
          document.body.appendChild(overlay);
        }
        return document.querySelectorAll("[data-brizo-flight-highlight]").length;
      };
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(create()))));
    })()
  `);
}

export async function clearCtripFlightHighlights(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  await webContents.executeJavaScript(
    `document.querySelectorAll("[data-brizo-flight-highlight]").forEach((node) => node.remove())`,
  ).catch(() => {});
}

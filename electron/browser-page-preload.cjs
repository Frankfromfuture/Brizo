const { ipcRenderer, webFrame } = require("electron");

// Sanitize client-side hints in main world so strict WAF/anti-bot/OAuth systems (e.g. Google Accounts, Ctrip, Meituan) treat Brizo as standard desktop Chrome.
// Never touch window.chrome on local files, data URIs, or PDF extension pages.
try {
  const isHttpWebPage = window.location && (window.location.protocol === "http:" || window.location.protocol === "https:");
  const isPdfPage = window.location && (window.location.pathname.toLowerCase().endsWith(".pdf") || window.location.href.includes(".pdf"));
  if (isHttpWebPage && !isPdfPage) {
    webFrame.executeJavaScript(`
      try {
        const ua = navigator.userAgent || "";
        const majorMatch = ua.match(/Chrome\\/(\\d+)/i);
        const majorVersion = majorMatch ? majorMatch[1] : "133";
        const fullMatch = ua.match(/Chrome\\/([\\d.]+)/i);
        const fullVersion = fullMatch ? fullMatch[1] : "133.0.0.0";

        const standardBrands = [
          { brand: "Chromium", version: majorVersion },
          { brand: "Google Chrome", version: majorVersion },
          { brand: "Not/A)Brand", version: "99" },
        ];

        const standardFullBrands = [
          { brand: "Chromium", version: fullVersion },
          { brand: "Google Chrome", version: fullVersion },
          { brand: "Not/A)Brand", version: "99.0.0.0" },
        ];

        if (navigator.userAgentData) {
          const sanitizedUserAgentData = {
            brands: standardBrands,
            mobile: false,
            platform: "macOS",
            getHighEntropyValues: async (hints = []) => ({
              brands: standardBrands,
              mobile: false,
              platform: "macOS",
              platformVersion: "15.0.0",
              architecture: "arm",
              bitness: "64",
              model: "",
              fullVersionList: standardFullBrands,
              uaFullVersion: fullVersion,
            }),
            toJSON: () => ({
              brands: standardBrands,
              mobile: false,
              platform: "macOS",
            }),
          };
          Object.defineProperty(navigator, "userAgentData", {
            get: () => sanitizedUserAgentData,
            configurable: true,
            enumerable: true,
          });
        }

        try {
          delete Object.getPrototypeOf(navigator).webdriver;
        } catch {}
        try {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
            configurable: true,
          });
        } catch {}

        if (!window.chrome) {
          window.chrome = {};
        }
        if (!window.chrome.app) {
          window.chrome.app = {
            isInstalled: false,
            InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
            RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
            getIsInstalled: () => false,
            getDetails: () => null,
          };
        }
        if (!window.chrome.runtime) {
          window.chrome.runtime = {
            OnInstalledReason: { CHROME_UPDATE: "chrome_update", INSTALL: "install", SHARED_MODULE_UPDATE: "shared_module_update", UPDATE: "update" },
            OnRestartRequiredReason: { APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic" },
            PlatformArch: { ARM: "arm", ARM64: "arm64", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
            PlatformNaclArch: { ARM: "arm", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
            PlatformOs: { ANDROID: "android", CROS: "cros", LINUX: "linux", MAC: "mac", OPENBSD: "openbsd", WIN: "win" },
            RequestUpdateCheckStatus: { NO_UPDATE: "no_update", THROTTLED: "throttled", UPDATE_AVAILABLE: "update_available" },
            connect: () => ({ onDisconnect: { addListener: () => {} }, onMessage: { addListener: () => {} }, postMessage: () => {} }),
            sendMessage: () => {},
          };
        }
        if (!window.chrome.loadTimes) {
          window.chrome.loadTimes = () => ({
            commitLoadTime: Date.now() / 1000,
            connectionInfo: "h2",
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: Date.now() / 1000,
            navigationType: "Other",
            npnNegotiatedProtocol: "h2",
            requestTime: Date.now() / 1000,
            startLoadTime: Date.now() / 1000,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true,
          });
        }
        if (!window.chrome.csi) {
          window.chrome.csi = () => ({
            onloadT: Date.now(),
            pageT: 120,
            startE: Date.now() - 120,
            tran: 15,
          });
        }
      } catch {}
    `);
  }
} catch {}

let lastInteractionAt = 0;

function reportPageInteraction(event) {
  if (!event.isTrusted) return;

  const now = Date.now();
  if (now - lastInteractionAt < 120) return;
  lastInteractionAt = now;
  ipcRenderer.send("bean-browser:page-interaction", event.type);
}

window.addEventListener("pointerdown", reportPageInteraction, true);
window.addEventListener("mousedown", reportPageInteraction, true);
window.addEventListener("wheel", reportPageInteraction, {
  capture: true,
  passive: true,
});
window.addEventListener("touchstart", reportPageInteraction, {
  capture: true,
  passive: true,
});
window.addEventListener("scroll", reportPageInteraction, {
  capture: true,
  passive: true,
});

let lastSelectionMenuSignature = "";
function reportCompletedSelection(event) {
  if (event && !event.isTrusted) return;
  window.requestAnimationFrame(() => {
    const selection = window.getSelection();
    const text = String(selection?.toString() || "").trim().slice(0, 12_000);
    if (!text || !selection?.rangeCount || selection.isCollapsed) {
      lastSelectionMenuSignature = "";
      return;
    }
    const range = selection.getRangeAt(selection.rangeCount - 1);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const x = Math.round(Math.min(window.innerWidth - 8, Math.max(8, rect.right)));
    const y = Math.round(Math.min(window.innerHeight - 8, Math.max(8, rect.bottom + 4)));
    const signature = `${text}\u0000${x}\u0000${y}`;
    if (signature === lastSelectionMenuSignature) return;
    lastSelectionMenuSignature = signature;
    ipcRenderer.send("bean-browser:selection-menu", { text, x, y });
  });
}

window.addEventListener("pointerup", reportCompletedSelection, true);
window.addEventListener("keyup", (event) => {
  if (event.shiftKey || ["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    reportCompletedSelection(event);
  }
}, true);

let topEdgeChangeTimer = 0;
function reportTopEdgeChange() {
  window.clearTimeout(topEdgeChangeTimer);
  topEdgeChangeTimer = window.setTimeout(() => {
    ipcRenderer.send("bean-browser:page-interaction", "top-edge-change");
  }, 180);
}

window.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(reportTopEdgeChange);
  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  window.addEventListener("load", reportTopEdgeChange, { once: true });
  window.addEventListener("transitionend", reportTopEdgeChange, true);
}, { once: true });

// Intercept window.close() called by pages to notify browser shell
try {
  const originalClose = window.close;
  window.close = function () {
    try {
      ipcRenderer.send("bean-browser:page-interaction", "window-close");
    } catch {}
    if (typeof originalClose === "function") {
      try { originalClose.call(window); } catch {}
    }
  };
} catch {}

// Auto-recovery for blank OAuth callback transition pages
try {
  if (
    typeof location !== "undefined" &&
    (location.pathname.toLowerCase().includes("thirdpartycallback") ||
     location.pathname.toLowerCase().includes("authorizecallback") ||
     location.pathname.toLowerCase().includes("oauth_callback"))
  ) {
    setTimeout(() => {
      // If the callback page has no visible body content after 1.2s:
      if (!document.body || document.body.children.length === 0 || (document.body.innerText || "").trim() === "") {
        const searchParams = new URLSearchParams(location.search);
        const fromUrl = searchParams.get("from") ||
                        searchParams.get("redirect_uri") ||
                        searchParams.get("return_url") ||
                        document.referrer;
        if (fromUrl && /^https?:\/\//i.test(fromUrl) && !fromUrl.includes("/H5login/")) {
          location.replace(fromUrl);
        } else if (location.hostname.includes("ctrip.com")) {
          location.replace("https://www.ctrip.com/");
        }
      }
    }, 1200);
  }
} catch {}

// Full-width (网页横向满铺) behavior. This keeps Chromium page zoom at 100% and
// instead widens fixed-width page containers with injected styling so vertical
// font sizes and line layout remain unchanged while horizontal content fills
// the active browser canvas at any window size.
const FULL_WIDTH_STYLE_ID = "brizo-full-width-style";
const FULL_WIDTH_TARGET_ATTR = "data-brizo-full-width-target";
const FULL_WIDTH_CSS = `
html.brizo-full-width,
html.brizo-full-width body {
  min-width: 0 !important;
  max-width: none !important;
}
html.brizo-full-width body {
  width: auto !important;
  box-sizing: border-box !important;
}
html.brizo-full-width [${FULL_WIDTH_TARGET_ATTR}] {
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  box-sizing: border-box !important;
}
`;

const FULL_WIDTH_SELECTORS = [
  "main",
  "#app",
  "#root",
  "#__next",
  "[role='main']",
  ".container",
  ".container-fluid",
  ".wrapper",
  ".wrap",
  ".main",
  ".content",
  ".content-wrapper",
  ".page",
  ".page-content",
  ".layout",
  ".site",
  ".site-content",
  "body > div",
];

let fullWidthEnabled = false;
let fullWidthObserver = null;
let fullWidthRaf = 0;
let fullWidthStyleEl = null;
let fullWidthScanRunning = false;
const fullWidthTargets = new Set();

function fullWidthPx(value) {
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (!/px$/i.test(trimmed)) return 0;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFullWidthExpansionCandidate(element) {
  if (!(element instanceof Element)) return false;
  if (element === document.documentElement || element === document.body) return false;
  const tagName = String(element.tagName || "").toUpperCase();
  if (["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"].includes(tagName)) return false;

  const computed = window.getComputedStyle(element);
  if (!computed || computed.display === "none" || computed.visibility === "hidden" || computed.position === "fixed") {
    return false;
  }

  const viewportWidth = Math.max(0, document.documentElement?.clientWidth || window.innerWidth || 0);
  const rect = element.getBoundingClientRect();
  if (
    viewportWidth < 640
    || rect.width < Math.min(600, viewportWidth * 0.55)
    || rect.width >= viewportWidth - 24
    || rect.right <= 0
    || rect.left >= viewportWidth
  ) {
    return false;
  }

  const inline = element.style;
  const widthPx = fullWidthPx(inline.width);
  const maxWidthPx = fullWidthPx(inline.maxWidth || computed.maxWidth);
  const minWidthPx = fullWidthPx(inline.minWidth || computed.minWidth);
  const hasFixedConstraint = (
    (widthPx >= 600 && widthPx <= 2560)
    || (maxWidthPx >= 600 && maxWidthPx <= 2560)
    || (minWidthPx >= 600 && minWidthPx <= 2560)
  );
  const leftInset = Math.max(0, rect.left);
  const rightInset = Math.max(0, viewportWidth - rect.right);
  const isCentered = Math.abs(leftInset - rightInset) <= Math.max(32, viewportWidth * 0.06);
  const isTopLevel = element.parentElement === document.body
    || ["MAIN", "HEADER", "FOOTER"].includes(tagName)
    || element.getAttribute("role") === "main";

  return hasFixedConstraint || isCentered || isTopLevel;
}

function scanFullWidthTargets() {
  if (!fullWidthEnabled || !document.body) return;

  for (const element of Array.from(fullWidthTargets)) {
    if (!element.isConnected) fullWidthTargets.delete(element);
  }

  const candidates = new Set();
  for (const selector of FULL_WIDTH_SELECTORS) {
    try {
      document.querySelectorAll(selector).forEach((element) => candidates.add(element));
    } catch {
      // A small number of pages can break on synthetic selectors; ignore them.
    }
  }
  for (const child of Array.from(document.body.children)) {
    candidates.add(child);
  }

  const eligible = Array.from(candidates).filter((element) => (
    !fullWidthTargets.has(element) && isFullWidthExpansionCandidate(element)
  ));
  const eligibleSet = new Set(eligible);
  for (const element of eligible) {
    let ancestor = element.parentElement;
    let nestedInsideExpansionTarget = false;
    while (ancestor && ancestor !== document.body) {
      if (fullWidthTargets.has(ancestor) || eligibleSet.has(ancestor)) {
        nestedInsideExpansionTarget = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!nestedInsideExpansionTarget) {
      element.setAttribute(FULL_WIDTH_TARGET_ATTR, "");
      fullWidthTargets.add(element);
    }
  }
}

function runFullWidthScan() {
  if (!fullWidthEnabled || fullWidthScanRunning) return;
  fullWidthScanRunning = true;
  try {
    scanFullWidthTargets();
  } finally {
    fullWidthScanRunning = false;
  }
}

function scheduleFullWidthScan() {
  if (!fullWidthEnabled || fullWidthRaf) return;
  fullWidthRaf = window.requestAnimationFrame(() => {
    fullWidthRaf = 0;
    runFullWidthScan();
  });
}

function ensureFullWidthStyle() {
  if (fullWidthStyleEl?.isConnected) return;
  fullWidthStyleEl = document.getElementById(FULL_WIDTH_STYLE_ID);
  if (fullWidthStyleEl) return;
  fullWidthStyleEl = document.createElement("style");
  fullWidthStyleEl.id = FULL_WIDTH_STYLE_ID;
  fullWidthStyleEl.textContent = FULL_WIDTH_CSS;
  (document.head || document.documentElement).appendChild(fullWidthStyleEl);
}

function removeFullWidthStyle() {
  if (fullWidthStyleEl) {
    fullWidthStyleEl.remove();
  }
  fullWidthStyleEl = null;
  document.getElementById(FULL_WIDTH_STYLE_ID)?.remove();
}

function installFullWidthObserver() {
  if (fullWidthObserver || !fullWidthEnabled || !document.documentElement) return;
  fullWidthObserver = new MutationObserver(() => {
    if (fullWidthEnabled && !fullWidthScanRunning) {
      scheduleFullWidthScan();
    }
  });
  fullWidthObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function destroyFullWidthObserver() {
  fullWidthObserver?.disconnect();
  fullWidthObserver = null;
  if (fullWidthRaf) {
    window.cancelAnimationFrame(fullWidthRaf);
    fullWidthRaf = 0;
  }
}

function setFullWidthEnabled(enabled) {
  const nextEnabled = Boolean(enabled);
  const root = document.documentElement;
  if (!root) return;

  fullWidthEnabled = nextEnabled;
  if (nextEnabled) {
    root.classList.add("brizo-full-width");
    ensureFullWidthStyle();
    installFullWidthObserver();
    runFullWidthScan();
  } else {
    destroyFullWidthObserver();
    removeFullWidthStyle();
    root.classList.remove("brizo-full-width");
    document.querySelectorAll(`[${FULL_WIDTH_TARGET_ATTR}]`).forEach((element) => {
      element.removeAttribute(FULL_WIDTH_TARGET_ATTR);
    });
    fullWidthTargets.clear();
  }
}

try {
  ipcRenderer.on("brizo:apply-full-width", (_event, enabled) => {
    setFullWidthEnabled(enabled);
  });
  window.addEventListener("load", () => {
    if (fullWidthEnabled) scheduleFullWidthScan();
  }, { once: true });
  window.addEventListener("resize", () => {
    if (fullWidthEnabled) scheduleFullWidthScan();
  }, { passive: true });
} catch {}

// Local-first page hygiene. Brizo only acts on high-confidence consent and
// nuisance UI; authentication, checkout, paywall and security surfaces are
// deliberately excluded. Hidden elements retain their original inline style
// so disabling the feature for a site is immediately reversible.
const HYGIENE_HIDDEN_ATTR = "data-brizo-hygiene-hidden";
const HYGIENE_STYLE_ATTR = "data-brizo-hygiene-original-style";
const HYGIENE_PROTECTED_PATTERN = /\b(log[ -]?in|sign[ -]?in|checkout|payment|paywall|subscribe to (read|continue)|two[- ]factor|verification|captcha|security code)\b|登录|登入|注册|结账|支付|订阅后阅读|付费墙|验证码|安全验证|身份验证/i;
const HYGIENE_COOKIE_PATTERN = /\b(cookie|cookies|consent|gdpr|privacy preferences?)\b|Cookie|隐私偏好|隐私设置|同意使用|数据使用/i;
const HYGIENE_REJECT_PATTERN = /^(reject|deny|decline|refuse)( all)?( optional| non[- ]?essential)?( cookies?)?$|^(only (strictly )?(necessary|essential)( cookies?)?|(strictly )?(necessary|essential)( cookies?)? only|use (only )?(strictly )?(necessary|essential)( cookies?)?( only)?|continue without accepting|save (my )?(choices|preferences))$|拒绝(全部|所有|可选|非必要)?( Cookie| cookies?)?|仅(允许|使用)?必要( Cookie| cookies?)?|只(允许|使用)?必要( Cookie| cookies?)?|不同意|继续但不接受|保存(选择|偏好)/i;
const HYGIENE_ALLOW_PATTERN = /^(accept( all)?|allow( all)?|agree|i agree|yes,? i agree|ok(ay)?)$|接受(全部|所有)?|允许(全部|所有)?|同意(全部|所有)?|我同意/i;
const HYGIENE_PROMO_PATTERN = /\b(newsletter|special offer|limited offer|download (our|the) app|install (our|the) app|enable notifications?|turn on notifications?|sign up for updates?)\b|订阅资讯|限时优惠|下载.{0,4}应用|安装.{0,4}应用|开启通知|允许通知|注册获取/i;
const HYGIENE_AD_TOKEN_PATTERN = /(^|[-_\s])(ad|ads|adunit|advert|advertisement|sponsored|promoted|commercial)([-_\s]|$)/i;

let siteHygieneSettings = {
  cleanupLevel: "balanced",
  cookieConsent: "essential",
  enabled: true,
  siteOverrides: {},
};
let siteHygieneObserver = null;
let siteHygieneTimer = 0;
let siteHygieneScans = 0;
let siteHygieneCookieAction = "";
let lastSiteHygieneReport = "";
let credentialFormSignature = "";
let credentialSuggestionHost = null;

function currentSiteHygiene() {
  let origin = "";
  try { origin = location.origin.toLowerCase(); } catch {}
  const override = siteHygieneSettings.siteOverrides?.[origin];
  return {
    cleanupLevel: ["off", "balanced", "strict"].includes(siteHygieneSettings.cleanupLevel)
      ? siteHygieneSettings.cleanupLevel
      : "balanced",
    cookieConsent: ["ask", "essential", "allow-all"].includes(siteHygieneSettings.cookieConsent)
      ? siteHygieneSettings.cookieConsent
      : "essential",
    credentialAutofill: siteHygieneSettings.credentialAutofill !== false,
    enabled: siteHygieneSettings.enabled !== false && override?.enabled !== false,
    origin,
  };
}

function visibleHygieneElement(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width >= 16 && rect.height >= 12 && rect.bottom > 0 && rect.right > 0;
}

function hygieneText(element, max = 1800) {
  return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function restoreHygieneElements() {
  document.querySelectorAll(`[${HYGIENE_HIDDEN_ATTR}]`).forEach((element) => {
    const originalStyle = element.getAttribute(HYGIENE_STYLE_ATTR);
    if (originalStyle) element.setAttribute("style", originalStyle);
    else element.removeAttribute("style");
    element.removeAttribute(HYGIENE_HIDDEN_ATTR);
    element.removeAttribute(HYGIENE_STYLE_ATTR);
  });
}

function hideHygieneElement(element) {
  if (!(element instanceof HTMLElement) || element.hasAttribute(HYGIENE_HIDDEN_ATTR)) return false;
  element.setAttribute(HYGIENE_STYLE_ATTR, element.getAttribute("style") || "");
  element.setAttribute(HYGIENE_HIDDEN_ATTR, "");
  element.style.setProperty("display", "none", "important");
  return true;
}

function clickCookieChoice(choice) {
  if (choice === "ask" || siteHygieneCookieAction) return false;
  const bannerSelectors = [
    "[role='dialog']", "[aria-modal='true']", "[id*='cookie' i]", "[class*='cookie' i]",
    "[id*='consent' i]", "[class*='consent' i]", "[id*='gdpr' i]", "[class*='gdpr' i]",
  ];
  const banners = [...document.querySelectorAll(bannerSelectors.join(","))].filter((element) => {
    if (!visibleHygieneElement(element)) return false;
    const text = hygieneText(element);
    return HYGIENE_COOKIE_PATTERN.test(text) && !HYGIENE_PROTECTED_PATTERN.test(text);
  }).slice(0, 12);
  const targetPattern = choice === "allow-all" ? HYGIENE_ALLOW_PATTERN : HYGIENE_REJECT_PATTERN;
  for (const banner of banners) {
    const controls = [...banner.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a")]
      .filter(visibleHygieneElement);
    const target = controls.find((control) => {
      const label = String(control.getAttribute("aria-label") || control.value || hygieneText(control, 160)).trim();
      return targetPattern.test(label);
    });
    if (!target) continue;
    target.click();
    siteHygieneCookieAction = choice;
    return true;
  }
  return false;
}

function elementSemanticTokens(element) {
  return [
    element.id,
    element.className,
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-ad-slot"),
    element.getAttribute("data-ad-unit"),
  ].map((value) => typeof value === "string" ? value : "").join(" ").slice(0, 900);
}

function isHighConfidenceNuisance(element, level) {
  if (!visibleHygieneElement(element)) return false;
  const text = hygieneText(element);
  if (HYGIENE_PROTECTED_PATTERN.test(text) || HYGIENE_COOKIE_PATTERN.test(text)) return false;
  const tokens = elementSemanticTokens(element);
  if (HYGIENE_AD_TOKEN_PATTERN.test(tokens)) return true;
  if (element.matches("iframe") && /doubleclick|googlesyndication|adservice|taboola|outbrain/i.test(element.src || "")) return true;
  if (level !== "strict" || !HYGIENE_PROMO_PATTERN.test(text)) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const overlaysPage = ["fixed", "sticky"].includes(style.position)
    && Number.parseInt(style.zIndex || "0", 10) >= 10
    && rect.width >= Math.min(280, innerWidth * 0.35)
    && rect.height >= 80;
  return overlaysPage;
}

function cleanPageNuisances(level) {
  if (level === "off") return 0;
  const selectors = [
    "iframe", "aside", "[role='complementary']", "[role='dialog']", "[aria-modal='true']",
    "[data-ad-slot]", "[data-ad-unit]", "[class~='ad' i]", "[class*='advert' i]",
    "[class*='sponsor' i]", "[class*='promoted' i]", "[class*='popup' i]", "[class*='modal' i]",
    "[id^='ad-' i]", "[id$='-ad' i]", "[id*='advert' i]", "[id*='sponsor' i]", "[id*='popup' i]",
  ];
  let hiddenCount = 0;
  const candidates = [...document.querySelectorAll(selectors.join(","))].slice(0, 320);
  for (const element of candidates) {
    if (isHighConfidenceNuisance(element, level) && hideHygieneElement(element)) hiddenCount += 1;
    if (hiddenCount >= 40) break;
  }
  return hiddenCount;
}

function findCredentialFields() {
  const passwords = [...document.querySelectorAll("input[type='password']")]
    .filter((input) => visibleHygieneElement(input) && input.autocomplete !== "new-password");
  const password = passwords[0];
  if (!password) return null;
  const scope = password.form || password.closest("form, [role='form']") || password.parentElement;
  const candidates = [...(scope || document).querySelectorAll("input")]
    .filter((input) => input !== password
      && visibleHygieneElement(input)
      && ["", "text", "email", "tel"].includes(String(input.type || "").toLowerCase()));
  const username = candidates.find((input) => /username|email/i.test(`${input.autocomplete} ${input.name} ${input.id} ${input.placeholder}`))
    || candidates.filter((input) => input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)
    || candidates[0];
  return username ? { password, username } : null;
}

function requestCredentialOptions() {
  const current = currentSiteHygiene();
  if (!current.enabled || !current.credentialAutofill) return;
  const fields = findCredentialFields();
  if (!fields) return;
  const signature = `${current.origin}\u0000${location.pathname}\u0000${fields.username.name || fields.username.id}\u0000${fields.password.name || fields.password.id}`;
  if (signature === credentialFormSignature) return;
  credentialFormSignature = signature;
  ipcRenderer.send("bean-browser:credential-form-detected");
}

function setCredentialFieldValue(input, value) {
  if (!(input instanceof HTMLInputElement) || typeof value !== "string") return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillCredentialFields(credential) {
  const fields = findCredentialFields();
  if (!fields) return;
  setCredentialFieldValue(fields.username, String(credential?.username || ""));
  setCredentialFieldValue(fields.password, String(credential?.password || ""));
  fields.username.dataset.brizoAutofilled = "true";
  fields.password.dataset.brizoAutofilled = "true";
  fields.password.focus({ preventScroll: true });
  credentialSuggestionHost?.remove();
  credentialSuggestionHost = null;
}

function showCredentialSuggestions(entries) {
  const fields = findCredentialFields();
  if (!fields || !Array.isArray(entries) || !entries.length) return;
  if (entries.length === 1 && !fields.username.value && !fields.password.value) {
    ipcRenderer.send("bean-browser:fill-credential", entries[0].id);
    return;
  }
  credentialSuggestionHost?.remove();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.left = `${Math.max(8, Math.min(innerWidth - 236, fields.username.getBoundingClientRect().left))}px`;
  host.style.top = `${Math.max(8, Math.min(innerHeight - 120, fields.username.getBoundingClientRect().bottom + 6))}px`;
  const shadow = host.attachShadow({ mode: "closed" });
  const panel = document.createElement("div");
  panel.innerHTML = `<style>
    :host{all:initial}.panel{width:228px;padding:5px;border-radius:10px;background:#f8f8f8;color:#272727;box-shadow:0 4px 10px rgba(0,0,0,.13),0 1px 4px rgba(0,0,0,.08);font:13px -apple-system,BlinkMacSystemFont,sans-serif}
    button{width:100%;height:35px;padding:0 8px;display:flex;align-items:center;justify-content:space-between;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}
    button:hover,button:focus{background:rgba(0,0,0,.035);outline:0}small{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#737873;font-size:11px}
  </style><div class="panel" role="listbox" aria-label="Brizo 登录信息"></div>`;
  const list = panel.querySelector(".panel");
  entries.slice(0, 5).forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = "<span>使用此账号</span><small></small>";
    button.querySelector("small").textContent = String(entry.username || "");
    button.addEventListener("click", () => ipcRenderer.send("bean-browser:fill-credential", String(entry.id || "")));
    list.appendChild(button);
  });
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);
  credentialSuggestionHost = host;
  const dismiss = (event) => {
    if (event.composedPath().includes(host) || event.target === fields.username || event.target === fields.password) return;
    host.remove();
    credentialSuggestionHost = null;
    document.removeEventListener("pointerdown", dismiss, true);
  };
  document.addEventListener("pointerdown", dismiss, true);
}

function runSiteHygieneScan() {
  siteHygieneTimer = 0;
  const current = currentSiteHygiene();
  if (!current.enabled) {
    restoreHygieneElements();
    return;
  }
  clickCookieChoice(current.cookieConsent);
  const hiddenCount = cleanPageNuisances(current.cleanupLevel);
  requestCredentialOptions();
  siteHygieneScans += 1;
  const reportSignature = `${siteHygieneCookieAction}\u0000${hiddenCount}`;
  if ((hiddenCount || siteHygieneCookieAction) && reportSignature !== lastSiteHygieneReport) {
    lastSiteHygieneReport = reportSignature;
    ipcRenderer.send("bean-browser:site-hygiene-result", {
      cookieAction: siteHygieneCookieAction,
      hiddenCount,
      origin: current.origin,
    });
  }
  if (siteHygieneScans >= 24) {
    siteHygieneObserver?.disconnect();
    siteHygieneObserver = null;
  }
}

function scheduleSiteHygieneScan() {
  if (siteHygieneTimer) return;
  siteHygieneTimer = window.setTimeout(runSiteHygieneScan, 180);
}

function installSiteHygiene() {
  siteHygieneObserver?.disconnect();
  siteHygieneObserver = null;
  siteHygieneScans = 0;
  siteHygieneCookieAction = "";
  lastSiteHygieneReport = "";
  credentialFormSignature = "";
  credentialSuggestionHost?.remove();
  credentialSuggestionHost = null;
  const current = currentSiteHygiene();
  if (!current.enabled) {
    restoreHygieneElements();
    return;
  }
  scheduleSiteHygieneScan();
  if (!document.documentElement) return;
  siteHygieneObserver = new MutationObserver(scheduleSiteHygieneScan);
  siteHygieneObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => {
    siteHygieneObserver?.disconnect();
    siteHygieneObserver = null;
  }, 12_000);
}

try {
  ipcRenderer.on("brizo:apply-site-hygiene", (_event, value) => {
    siteHygieneSettings = value && typeof value === "object" ? value : siteHygieneSettings;
    installSiteHygiene();
  });
  ipcRenderer.on("brizo:credential-options", (_event, payload) => {
    if (payload?.origin !== currentSiteHygiene().origin) return;
    showCredentialSuggestions(payload.entries);
  });
  ipcRenderer.on("brizo:fill-credential", (_event, credential) => {
    fillCredentialFields(credential);
  });
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", installSiteHygiene, { once: true });
  } else {
    installSiteHygiene();
  }
} catch {}

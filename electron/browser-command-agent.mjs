import { authorizeBrowserAction } from "./browser-action-policy.mjs";
import { verifyBrowserActionPostcondition } from "./browser-action-postcondition.mjs";
import {
  createBrowserExecutionEvidence,
  sanitizeBrowserEvidenceUrl,
} from "./browser-execution-evidence.mjs";
import { assertBrowserNavigationUrl } from "./browser-navigation-policy.mjs";
import { detectBrowserSecurityBlock } from "./browser-security-block.mjs";
import { normalizeUsePlannerNavigation } from "./browser-use-entry-policy.mjs";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[contenteditable='true']",
  "[class*='search-icon' i]",
  "[class*='search-btn' i]",
  "[class*='search-button' i]",
  "[data-testid*='search' i]",
  "[data-e2e*='search' i]",
].join(",");

const LOGIN_MODAL_PATTERN = /登录|登陆|注册|扫码.{0,4}(?:登录|登陆)|账号.{0,4}(?:登录|登陆)|手机.{0,4}(?:登录|登陆)|密码.{0,4}(?:登录|登陆)|sign\s*in|log\s*in|login|register|create\s+(?:an?\s+)?account/i;
const LOGIN_DISMISS_PATTERN = /^(?:×|✕|✖|关闭(?:登录|登陆|注册)?(?:弹窗|窗口|对话框)?|取消|稍后|以后再说|暂不|暂不登录|暂不登陆|跳过|close(?:\s+(?:login|dialog|window))?|dismiss|cancel|skip|not\s+now|no\s+thanks)$/i;
const SEARCH_CONTROL_PATTERN = /搜索|检索|查找|search|magnif/i;
const SETTINGS_CONTROL_PATTERN = /设置|偏好|settings?|preferences?|config/i;
const BROWSER_ACTIONS = new Set([
  "navigate",
  "click",
  "fill",
  "select",
  "press",
  "scroll",
  "back",
  "forward",
  "reload",
  "done",
]);

// Serialized into the page for every ref-based action. Keeping lookup in one
// function preserves existing @eN references while allowing those refs to live
// inside open shadow roots and accessible same-origin frames.
function locateBrowserAgentElement(domRef) {
  const expectedRef = String(domRef || "");
  const seenRoots = new WeakSet();
  const visit = (root, context, depth) => {
    if (!root || depth > 8 || seenRoots.has(root)) return null;
    seenRoots.add(root);
    const direct = [...(root.querySelectorAll?.("[data-brizo-agent-ref]") || [])]
      .find((element) => element.getAttribute("data-brizo-agent-ref") === expectedRef);
    if (direct) return { element: direct, ...context };
    const nodes = [...(root.querySelectorAll?.("*") || [])];
    for (const node of nodes) {
      if (!node.shadowRoot) continue;
      const found = visit(node.shadowRoot, context, depth + 1);
      if (found) return found;
    }
    for (const frame of nodes.filter((node) => /^(?:IFRAME|FRAME)$/.test(node.tagName || ""))) {
      try {
        const childDocument = frame.contentDocument;
        if (!childDocument?.documentElement) continue;
        const rect = frame.getBoundingClientRect();
        const scaleX = rect.width / Math.max(1, frame.offsetWidth || rect.width || 1);
        const scaleY = rect.height / Math.max(1, frame.offsetHeight || rect.height || 1);
        const childContext = {
          offsetX: context.offsetX + (rect.left + (frame.clientLeft || 0) * scaleX) * context.scaleX,
          offsetY: context.offsetY + (rect.top + (frame.clientTop || 0) * scaleY) * context.scaleY,
          scaleX: context.scaleX * scaleX,
          scaleY: context.scaleY * scaleY,
        };
        const found = visit(childDocument, childContext, depth + 1);
        if (found) return found;
      } catch {
        // Cross-origin frame: it is deliberately observable only as a boundary.
      }
    }
    return null;
  };
  return visit(document, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }, 0);
}

const BROWSER_AGENT_ELEMENT_LOOKUP_SOURCE = `(${locateBrowserAgentElement.toString()})`;

function jsonObjectsIn(text) {
  const objects = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const character = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          objects.push(text.slice(start, end + 1));
          start = end;
          break;
        }
      }
    }
  }
  return objects;
}

export function parseBrowserCommandAction(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const kind = String(value.action || "").toLowerCase();
    if (!BROWSER_ACTIONS.has(kind)) throw new Error("模型返回了不支持的浏览器动作。");
    return { ...value, action: kind };
  }
  const text = String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]);
  const candidates = [...fenced, text].flatMap(jsonObjectsIn);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") continue;
      const kind = String(parsed.action || "").toLowerCase();
      if (!BROWSER_ACTIONS.has(kind)) continue;
      return { ...parsed, action: kind };
    } catch {
      // Keep scanning: some providers prepend prose containing braces before the JSON action.
    }
  }
  throw new Error("模型没有返回有效的 JSON 浏览器动作。");
}

export function readBrowserActionCandidates(body) {
  const message = body?.choices?.[0]?.message;
  const values = [
    message?.content,
    message?.tool_calls?.[0]?.function?.arguments,
    message?.function_call?.arguments,
    body?.choices?.[0]?.text,
    body?.output_text,
    message?.reasoning_content,
    message?.reasoning,
    message?.analysis,
  ];
  if (Array.isArray(body?.output)) {
    for (const output of body.output) {
      if (Array.isArray(output?.content)) {
        for (const content of output.content) values.push(content?.text, content?.output_text);
      }
    }
  }
  const candidates = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) candidates.push(value.trim());
    else if (Array.isArray(value)) {
      const joined = value
        .map((item) => typeof item === "string" ? item : item?.text || item?.content || "")
        .filter(Boolean)
        .join("\n")
        .trim();
      if (joined) candidates.push(joined);
    } else if (value && typeof value === "object") {
      if (typeof value.text === "string" && value.text.trim()) candidates.push(value.text.trim());
      else if (value.action) candidates.push(JSON.stringify(value));
    }
  }
  return [...new Set(candidates)];
}

function refIndex(value) {
  const match = String(value || "").match(/^@e(\d+)$/i);
  return match ? Number(match[1]) - 1 : -1;
}

function allowedNavigationUrlOrEmpty(value) {
  try {
    return assertBrowserNavigationUrl(value);
  } catch {
    return "";
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function scaledInputPoint(webContents, point) {
  const zoom = Math.max(0.25, Math.min(5, Number(webContents?.getZoomFactor?.()) || 1));
  return {
    x: Math.max(0, Math.round(Number(point?.x || 0) * zoom)),
    y: Math.max(0, Math.round(Number(point?.y || 0) * zoom)),
  };
}

async function settle(webContents, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  await sleep(260);
  while (!webContents.isDestroyed() && webContents.isLoading() && Date.now() < deadline) {
    await sleep(120);
  }
  await sleep(180);
}

async function findLoginModalDismissTarget(webContents) {
  if (!webContents || webContents.isDestroyed()) return null;
  const target = await webContents.executeJavaScript(`
    (() => {
      const loginPattern = ${LOGIN_MODAL_PATTERN.toString()};
      const dismissPattern = ${LOGIN_DISMISS_PATTERN.toString()};
      const interactiveSelector = ${JSON.stringify(INTERACTIVE_SELECTOR)};
      const clean = (value, limit = 6000) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, limit);
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden"
          && style.display !== "none"
          && Number(style.opacity || 1) > 0.02
          && rect.width > 1
          && rect.height > 1
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < innerHeight
          && rect.left < innerWidth;
      };
      const modalCandidates = new Set(
        [...document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]')].filter(visible)
      );
      const loginSeeds = [...document.querySelectorAll('input[type="password"],input[autocomplete="current-password"],input[autocomplete="one-time-code"]')]
        .filter(visible);
      for (const seed of loginSeeds) {
        let ancestor = seed.parentElement;
        for (let depth = 0; ancestor && ancestor !== document.body && depth < 9; depth += 1, ancestor = ancestor.parentElement) {
          if (!visible(ancestor)) continue;
          const style = getComputedStyle(ancestor);
          const role = ancestor.getAttribute("role") || "";
          const modalLike = ancestor.tagName === "DIALOG"
            || role === "dialog"
            || ancestor.getAttribute("aria-modal") === "true"
            || style.position === "fixed";
          if (modalLike) modalCandidates.add(ancestor);
        }
      }
      const fixedLoginSurfaces = [...document.querySelectorAll('[class*="login" i],[class*="signin" i],[class*="modal" i],[class*="dialog" i]')]
        .filter((element) => visible(element) && getComputedStyle(element).position === "fixed");
      fixedLoginSurfaces.forEach((element) => modalCandidates.add(element));

      const scored = [];
      for (const modal of modalCandidates) {
        const modalRect = modal.getBoundingClientRect();
        const modalText = clean(modal.innerText || modal.getAttribute("aria-label"));
        if (!loginPattern.test(modalText)) continue;
        const controls = [...modal.querySelectorAll(interactiveSelector + ',[class*="close" i]')].filter(visible);
        for (const control of controls) {
          const rect = control.getBoundingClientRect();
          const label = clean(
            control.getAttribute("aria-label")
            || control.getAttribute("title")
            || control.innerText
            || control.getAttribute("alt"),
            120,
          );
          const topRight = rect.left + rect.width / 2 >= modalRect.left + modalRect.width * 0.64
            && rect.top + rect.height / 2 <= modalRect.top + Math.min(modalRect.height * 0.34, 120);
          const compact = rect.width <= 68 && rect.height <= 68;
          const explicitDismiss = dismissPattern.test(label);
          if (!explicitDismiss && !(topRight && compact && !label)) continue;
          const semanticModal = modal.tagName === "DIALOG"
            || modal.getAttribute("role") === "dialog"
            || modal.getAttribute("aria-modal") === "true";
          const score = (explicitDismiss ? 120 : 62)
            + (topRight ? 30 : 0)
            + (semanticModal ? 18 : 0)
            - Math.min(20, label.length / 4);
          scored.push({
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            label: label || "右上角关闭键",
            score,
          });
        }
      }
      return scored.sort((left, right) => right.score - left.score)[0] || null;
    })()
  `);
  return target
    && Number.isFinite(Number(target.x))
    && Number.isFinite(Number(target.y))
    && String(target.label || "").trim()
    ? target
    : null;
}

async function dismissLoginModal(webContents, target) {
  if (!target || !webContents || webContents.isDestroyed()) return false;
  const point = scaledInputPoint(webContents, target);
  webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
  webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x: point.x, y: point.y });
  webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: point.x, y: point.y });
  await settle(webContents, 3_000);
  const stillVisible = await findLoginModalDismissTarget(webContents).catch(() => null);
  if (stillVisible) {
    await webContents.executeJavaScript(`
      (() => {
        let node = document.elementFromPoint(${Number(target.x) || 0}, ${Number(target.y) || 0});
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          const role = node.getAttribute?.("role") || "";
          const isModal = node.tagName === "DIALOG"
            || role === "dialog"
            || node.getAttribute?.("aria-modal") === "true"
            || style.position === "fixed";
          const text = String(node.innerText || "").replace(/\\s+/g, " ").slice(0, 6000);
          if (isModal && ${LOGIN_MODAL_PATTERN.toString()}.test(text)) {
            node.setAttribute("aria-hidden", "true");
            node.style.setProperty("display", "none", "important");
            document.documentElement.style.removeProperty("overflow");
            document.body?.style.removeProperty("overflow");
            return true;
          }
          node = node.parentElement;
        }
        return false;
      })()
    `).catch(() => false);
    await sleep(180);
  }
  return true;
}

function isAbortedNavigationError(error) {
  const code = Number(error?.errno ?? error?.code);
  const message = error instanceof Error ? error.message : String(error || "");
  return code === -3 || /ERR_ABORTED|\(-3\)\s+loading/i.test(message);
}

async function loadUrlFollowingRedirects(webContents, url) {
  const safeUrl = assertBrowserNavigationUrl(url);
  const previousUrl = webContents.getURL();
  let blockedRedirectError = null;
  const guardNavigation = (event, destination, _isInPlace, isMainFrame) => {
    if (isMainFrame === false) return;
    try {
      assertBrowserNavigationUrl(destination);
    } catch (error) {
      blockedRedirectError = error;
      event?.preventDefault?.();
    }
  };
  webContents.on?.("will-redirect", guardNavigation);
  webContents.on?.("will-navigate", guardNavigation);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await webContents.loadURL(safeUrl);
        if (blockedRedirectError) throw blockedRedirectError;
        await settle(webContents);
        if (blockedRedirectError) throw blockedRedirectError;
        const currentUrl = webContents.isDestroyed() ? "" : webContents.getURL();
        if (currentUrl) assertBrowserNavigationUrl(currentUrl);
        return;
      } catch (error) {
        if (blockedRedirectError) throw blockedRedirectError;
        if (!isAbortedNavigationError(error)) throw error;
        await settle(webContents);
        const currentUrl = webContents.isDestroyed() ? "" : webContents.getURL();
        if (currentUrl) assertBrowserNavigationUrl(currentUrl);
        if (allowedNavigationUrlOrEmpty(currentUrl) && currentUrl !== previousUrl) return;
        if (attempt === 0) {
          await sleep(300);
          continue;
        }
        throw new Error("目标网页连续取消导航，未能离开当前页面。");
      }
    }
  } finally {
    webContents.off?.("will-redirect", guardNavigation);
    webContents.off?.("will-navigate", guardNavigation);
  }
}

export async function snapshotBrowserPage(webContents) {
  if (!webContents || webContents.isDestroyed()) throw new Error("当前网页已关闭。");
  return await webContents.executeJavaScript(`
    (() => {
      const selector = ${JSON.stringify(INTERACTIVE_SELECTOR)};
      const clean = (value, limit = 180) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, limit);
      const snapshotId = "brizo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      const topWidth = innerWidth;
      const topHeight = innerHeight;
      const elements = [];
      const frames = [];
      const textChunks = [];
      const seenRoots = new WeakSet();
      const seenFrames = new WeakSet();

      const topRect = (element, context) => {
        const rect = element.getBoundingClientRect();
        const left = context.offsetX + rect.left * context.scaleX;
        const top = context.offsetY + rect.top * context.scaleY;
        const width = rect.width * context.scaleX;
        const height = rect.height * context.scaleY;
        return {
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
        };
      };
      const visible = (element, context) => {
        const view = element.ownerDocument?.defaultView;
        const style = view?.getComputedStyle?.(element);
        if (!style) return false;
        const local = element.getBoundingClientRect();
        const rect = topRect(element, context);
        return style.visibility !== "hidden"
          && style.display !== "none"
          && Number(style.opacity || 1) > 0.02
          && local.width > 1
          && local.height > 1
          && local.bottom >= 0
          && local.right >= 0
          && local.top <= (view?.innerHeight || topHeight)
          && local.left <= (view?.innerWidth || topWidth)
          && rect.bottom >= 0
          && rect.right >= 0
          && rect.top <= topHeight
          && rect.left <= topWidth;
      };

      const safeFrameUrl = (value, base) => {
        try {
          const parsed = new URL(String(value || ""), base);
          return /^https?:$/.test(parsed.protocol) ? parsed.origin + parsed.pathname : parsed.protocol;
        } catch {
          return "";
        }
      };
      const frameContext = (context, frame) => {
        const rect = frame.getBoundingClientRect();
        const scaleX = rect.width / Math.max(1, frame.offsetWidth || rect.width || 1);
        const scaleY = rect.height / Math.max(1, frame.offsetHeight || rect.height || 1);
        return {
          offsetX: context.offsetX + (rect.left + (frame.clientLeft || 0) * scaleX) * context.scaleX,
          offsetY: context.offsetY + (rect.top + (frame.clientTop || 0) * scaleY) * context.scaleY,
          scaleX: context.scaleX * scaleX,
          scaleY: context.scaleY * scaleY,
        };
      };
      const validityState = (element) => {
        const validity = element.validity;
        if (!validity) return null;
        return {
          valid: Boolean(validity.valid),
          valueMissing: Boolean(validity.valueMissing),
          typeMismatch: Boolean(validity.typeMismatch),
          patternMismatch: Boolean(validity.patternMismatch),
          tooLong: Boolean(validity.tooLong),
          tooShort: Boolean(validity.tooShort),
          rangeUnderflow: Boolean(validity.rangeUnderflow),
          rangeOverflow: Boolean(validity.rangeOverflow),
          stepMismatch: Boolean(validity.stepMismatch),
          badInput: Boolean(validity.badInput),
          customError: Boolean(validity.customError),
        };
      };
      const appendElement = (element, context, frameRef, frameDepth) => {
        if (elements.length >= 140 || !visible(element, context)) return;
        const rect = topRect(element, context);
        const tag = String(element.tagName || "").toLowerCase();
        const type = clean(element.getAttribute("type") || element.type, 30).toLowerCase();
        const autocomplete = clean(element.getAttribute("autocomplete") || element.autocomplete, 80).toLowerCase();
        const fieldName = clean(element.getAttribute("name") || element.name, 120);
        const semanticHint = clean([
          element.id,
          fieldName,
          typeof element.className === "string" ? element.className : "",
          element.getAttribute("data-testid"),
          element.getAttribute("data-e2e"),
          element.getAttribute("data-type"),
        ].filter(Boolean).join(" "), 240);
        const labels = element.labels ? [...element.labels].map((label) => label.innerText).join(" ") : "";
        const sensitive = type === "password"
          || type === "file"
          || /(?:password|one-time-code|webauthn|^cc-)/i.test(autocomplete)
          || /(?:passw(?:or)?d|passwd|secret|token|otp|one.?time|cvv|cvc|card.?number)/i.test(fieldName + " " + (element.id || ""));
        const contentEditable = element.isContentEditable;
        const rawValue = contentEditable
          ? element.innerText || element.textContent || ""
          : "value" in element ? element.value ?? "" : "";
        const explicitText = clean(
          element.getAttribute("aria-label")
          || labels
          || element.getAttribute("title")
          || element.innerText
          || element.getAttribute("placeholder")
          || element.getAttribute("alt")
          || (sensitive ? "" : rawValue),
        );
        const inferredText = /search|magnif|搜索|检索/i.test(semanticHint)
          ? "搜索"
          : /setting|preference|config|设置/i.test(semanticHint)
            ? "设置"
            : "";
        const domRef = snapshotId + "-" + (elements.length + 1);
        element.setAttribute("data-brizo-agent-ref", domRef);
        const isSelect = tag === "select";
        const optionNodes = isSelect ? [...element.options] : [];
        const options = optionNodes.slice(0, 60).map((option) => ({
          ...(sensitive ? {} : { value: clean(option.value, 240) }),
          label: clean(option.label || option.textContent, 180),
          selected: Boolean(option.selected),
          disabled: Boolean(option.disabled),
        }));
        const checkedType = /^(?:checkbox|radio)$/i.test(type);
        const ariaSelected = element.getAttribute("aria-selected");
        elements.push({
          ref: "@e" + (elements.length + 1),
          domRef,
          tag,
          role: clean(element.getAttribute("role"), 40),
          name: explicitText || inferredText,
          fieldName,
          type,
          autocomplete,
          href: tag === "a" ? clean(element.href, 500) : "",
          ...(sensitive ? {
            sensitive: true,
            hasValue: String(rawValue).length > 0,
            valueLength: String(rawValue).length,
          } : {
            value: clean(rawValue, 1000),
            hasValue: String(rawValue).length > 0,
            valueLength: String(rawValue).length,
          }),
          purpose: inferredText,
          required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
          disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
          readOnly: Boolean(element.readOnly || element.getAttribute("aria-readonly") === "true"),
          min: clean(element.getAttribute("min"), 80),
          max: clean(element.getAttribute("max"), 80),
          step: clean(element.getAttribute("step"), 80),
          pattern: clean(element.getAttribute("pattern"), 240),
          minLength: element.hasAttribute("minlength") ? Number(element.getAttribute("minlength")) : null,
          maxLength: element.hasAttribute("maxlength") ? Number(element.getAttribute("maxlength")) : null,
          multiple: Boolean(element.multiple),
          submitsForm: /^(?:button|input)$/i.test(tag) && /^(?:submit|image)$/i.test(element.type || ""),
          ...(checkedType ? { checked: Boolean(element.checked) } : {}),
          ...(ariaSelected !== null ? { selected: ariaSelected === "true" } : {}),
          ...(isSelect ? {
            selectedIndex: Number(element.selectedIndex),
            ...(sensitive ? {} : {
              selectedValues: optionNodes.filter((option) => option.selected).slice(0, 20).map((option) => clean(option.value, 240)),
            }),
            options,
            optionsTruncated: optionNodes.length > options.length,
          } : {}),
          willValidate: Boolean(element.willValidate),
          validity: validityState(element),
          frameRef,
          frameDepth,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        });
      };

      const collectRoot = (root, context, frameRef = "", frameDepth = 0, depth = 0) => {
        if (!root || depth > 8 || seenRoots.has(root)) return;
        seenRoots.add(root);
        root.querySelectorAll?.("[data-brizo-agent-ref]").forEach((element) => element.removeAttribute("data-brizo-agent-ref"));
        if (root.nodeType === Node.DOCUMENT_NODE && root.body?.innerText) textChunks.push(root.body.innerText);
        for (const element of root.querySelectorAll?.(selector) || []) appendElement(element, context, frameRef, frameDepth);
        const nodes = [...(root.querySelectorAll?.("*") || [])];
        for (const node of nodes) {
          if (node.shadowRoot) collectRoot(node.shadowRoot, context, frameRef, frameDepth, depth + 1);
        }
        for (const frame of nodes.filter((node) => /^(?:IFRAME|FRAME)$/.test(node.tagName || ""))) {
          if (frames.length >= 24 || seenFrames.has(frame) || !visible(frame, context)) continue;
          seenFrames.add(frame);
          const rect = topRect(frame, context);
          const nextFrameRef = "@f" + (frames.length + 1);
          let childDocument = null;
          let childUrl = "";
          let sameOrigin = false;
          try {
            childDocument = frame.contentDocument;
            childUrl = frame.contentWindow?.location?.href || "";
            sameOrigin = Boolean(childDocument?.documentElement);
          } catch {
            sameOrigin = false;
          }
          frames.push({
            ref: nextFrameRef,
            sameOrigin,
            name: clean(frame.getAttribute("aria-label") || frame.getAttribute("title") || frame.getAttribute("name"), 120),
            url: safeFrameUrl(childUrl || frame.getAttribute("src"), frame.ownerDocument?.baseURI),
            depth: frameDepth + 1,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
          if (sameOrigin && frameDepth < 4) {
            collectRoot(childDocument, frameContext(context, frame), nextFrameRef, frameDepth + 1, depth + 1);
          }
        }
      };

      collectRoot(document, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
      const pageText = clean(textChunks.join("\\n"), 10000);
      return {
        title: clean(document.title, 240),
        url: location.href,
        pageText,
        viewport: { width: innerWidth, height: innerHeight, scrollY: Math.round(scrollY) },
        elements,
        frames,
      };
    })()
  `);
}

function actionTarget(snapshot, action) {
  const index = refIndex(action?.ref);
  return index >= 0 ? snapshot.elements[index] : null;
}

function isSearchSnapshotTarget(target) {
  return Boolean(target) && (
    target.type === "search"
    || target.purpose === "搜索"
    || SEARCH_CONTROL_PATTERN.test(`${target.name || ""} ${target.role || ""}`)
  );
}

function isTextEntrySnapshotTarget(target) {
  return Boolean(target) && (
    target.tag === "textarea"
    || target.tag === "input"
    || target.role === "textbox"
    || target.type === "search"
    || target.type === "text"
  );
}

export async function executeBrowserCommandAction({ action, command, snapshot, validateNavigation, webContents }) {
  const kind = String(action?.action || "").toLowerCase();
  const target = actionTarget(snapshot, action);
  if (["click", "fill", "select"].includes(kind) && !target) {
    throw new Error("页面元素引用已经失效，请重新观察页面。");
  }
  if (kind === "press" && action?.ref && !target) {
    throw new Error("页面元素引用已经失效，请重新观察页面。");
  }
  const authorization = authorizeBrowserAction({ action, command, target });
  if (!authorization.allowed) {
    return {
      status: "needs-confirmation",
      reason: authorization.code,
      message: authorization.message,
    };
  }
  if (kind === "navigate") {
    const url = assertBrowserNavigationUrl(action.url);
    if (allowedNavigationUrlOrEmpty(snapshot.url) === url) return { status: "continued", result: "already-satisfied" };
    await validateNavigation?.(url);
    await loadUrlFollowingRedirects(webContents, url);
    const finalUrl = assertBrowserNavigationUrl(webContents.getURL());
    if (finalUrl === allowedNavigationUrlOrEmpty(snapshot.url)) {
      throw new Error("导航结束后仍停留在原页面，目标页面未得到验证。");
    }
    return {
      status: "continued",
      result: "navigated",
      postcondition: { kind: "safe-navigation", verified: true },
    };
  }
  if (kind === "back") {
    if (webContents.navigationHistory.canGoBack()) webContents.navigationHistory.goBack();
    await settle(webContents);
    return { status: "continued" };
  }
  if (kind === "forward") {
    if (webContents.navigationHistory.canGoForward()) webContents.navigationHistory.goForward();
    await settle(webContents);
    return { status: "continued" };
  }
  if (kind === "reload") {
    webContents.reload();
    await settle(webContents);
    return {
      status: "continued",
      result: "reloaded",
      postcondition: { kind: "browser-operation", verified: true },
    };
  }
  if (kind === "scroll") {
    const amount = Math.max(-1600, Math.min(1600, Number(action.amount) || 560));
    await webContents.executeJavaScript(`window.scrollBy({top:${amount},behavior:"smooth"})`);
    await sleep(420);
    return { status: "continued" };
  }
  if (kind === "click") {
    if (target.disabled) throw new Error("目标控件当前不可用。");
    const position = await webContents.executeJavaScript(`
      (() => {
        const located = ${BROWSER_AGENT_ELEMENT_LOOKUP_SOURCE}(${JSON.stringify(target.domRef || "")});
        const element = located?.element;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return null;
        return {
          x: Math.round(located.offsetX + (rect.left + rect.width / 2) * located.scaleX),
          y: Math.round(located.offsetY + (rect.top + rect.height / 2) * located.scaleY),
        };
      })()
    `);
    if (!position) throw new Error("页面元素引用已经失效，请重新观察页面。");
    const point = scaledInputPoint(webContents, position);
    webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x: point.x, y: point.y });
    webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: point.x, y: point.y });
    await settle(webContents);
    return { status: "continued" };
  }
  if (kind === "fill") {
    if (target.disabled || target.readOnly) throw new Error("目标输入控件当前不可编辑。");
    const value = String(action.value || "").slice(0, 4000);
    if (String(target.value || "") === value) {
      return { status: "continued", result: "already-satisfied" };
    }
    const filled = await webContents.executeJavaScript(`
      (() => {
        const located = ${BROWSER_AGENT_ELEMENT_LOOKUP_SOURCE}(${JSON.stringify(target.domRef || "")});
        const element = located?.element;
        if (!element) return null;
        element.focus();
        if (element.isContentEditable) {
          element.textContent = ${JSON.stringify(value)};
        } else {
          // React and other controlled form libraries observe the native value
          // setter. Directly assigning element.value can leave their state stale
          // even though the DOM briefly appears to contain the requested text.
          const view = element.ownerDocument?.defaultView || window;
          const prototype = element.tagName === "TEXTAREA"
            ? view.HTMLTextAreaElement?.prototype
            : view.HTMLInputElement?.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          if (setter) setter.call(element, ${JSON.stringify(value)});
          else element.value = ${JSON.stringify(value)};
        }
        const view = element.ownerDocument?.defaultView || window;
        element.dispatchEvent(new view.InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(value)} }));
        element.dispatchEvent(new view.Event("change", { bubbles: true }));
        const currentValue = () => element.isContentEditable
          ? element.textContent || ""
          : String(element.value ?? "");
        return new Promise((resolve) => {
          const verify = () => resolve({
            filled: true,
            matched: Boolean(element.isConnected && currentValue() === ${JSON.stringify(value)}),
          });
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(verify, 120)));
        });
      })()
    `);
    if (!filled?.filled) throw new Error("页面元素引用已经失效，请重新观察页面。");
    if (!filled.matched) throw new Error("填写动作已发送，但控件的实际值未通过后置验证。");
    return {
      status: "continued",
      result: "filled",
      postcondition: { kind: "control-state", verified: true },
    };
  }
  if (kind === "select") {
    if (target.disabled) throw new Error("目标选择控件当前不可用。");
    const value = String(action.value || "").slice(0, 500);
    if (String(target.value || "") === value) {
      return { status: "continued", result: "already-satisfied" };
    }
    const selected = await webContents.executeJavaScript(`
      (() => {
        const located = ${BROWSER_AGENT_ELEMENT_LOOKUP_SOURCE}(${JSON.stringify(target.domRef || "")});
        const element = located?.element;
        if (element?.tagName !== "SELECT") return null;
        if (![...element.options].some((option) => String(option.value) === ${JSON.stringify(value)})) {
          return { selected: false, matched: false, reason: "missing-option" };
        }
        element.value = ${JSON.stringify(value)};
        const view = element.ownerDocument?.defaultView || window;
        element.dispatchEvent(new view.Event("input", { bubbles: true }));
        element.dispatchEvent(new view.Event("change", { bubbles: true }));
        return new Promise((resolve) => {
          const verify = () => resolve({
            selected: true,
            matched: Boolean(element.isConnected && String(element.value) === ${JSON.stringify(value)}),
          });
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(verify, 120)));
        });
      })()
    `);
    if (!selected) throw new Error("页面元素引用已经失效，请重新观察页面。");
    if (selected.reason === "missing-option") throw new Error("目标选项不存在，已停止选择。");
    if (!selected.selected || !selected.matched) throw new Error("选择动作已发送，但控件的实际选中值未通过后置验证。");
    return {
      status: "continued",
      result: "selected",
      postcondition: { kind: "control-state", verified: true },
    };
  }
  if (kind === "press") {
    const key = String(action.key || "Enter").slice(0, 40);
    if (target) {
      const focused = await webContents.executeJavaScript(`
        (() => {
          const located = ${BROWSER_AGENT_ELEMENT_LOOKUP_SOURCE}(${JSON.stringify(target.domRef || "")});
          const element = located?.element;
          if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
          element.focus();
          const activeElement = element.ownerDocument?.activeElement;
          return activeElement === element || element.contains(activeElement);
        })()
      `);
      if (!focused) throw new Error("页面元素引用已经失效，请重新观察页面。");
    }
    webContents.sendInputEvent({ type: "keyDown", keyCode: key });
    webContents.sendInputEvent({ type: "keyUp", keyCode: key });
    await settle(webContents, 5_000);
    return { status: "continued" };
  }
  throw new Error(`不支持的浏览器动作：${kind || "空动作"}`);
}

function browserSnapshotFingerprint(snapshot) {
  return JSON.stringify({
    elements: (snapshot?.elements || []).map((item) => [item.tag, item.name, item.value, item.href]).slice(0, 80),
    text: String(snapshot?.pageText || "").slice(0, 4000),
    title: snapshot?.title || "",
    url: snapshot?.url || "",
    viewport: snapshot?.viewport || {},
  });
}

function browserActionFingerprint(action, snapshot) {
  const target = actionTarget(snapshot, action);
  return JSON.stringify([
    action?.action || "",
    target?.tag || "",
    target?.role || "",
    target?.name || "",
    target?.href || "",
    action?.url || "",
    action?.value || "",
    action?.key || "",
    action?.amount || "",
  ]);
}

export async function runBrowserCommandAgent({
  command,
  enforceNormalEntryNavigation = false,
  onProgress = () => {},
  planNextAction,
  signal,
  validateNavigation,
  waitIfPaused,
  webContents,
}) {
  const maxActions = 50;
  const cleanCommand = String(command || "").trim().slice(0, 2000);
  if (!cleanCommand) return { status: "error", message: "请输入浏览器命令。" };
  const evidence = createBrowserExecutionEvidence(cleanCommand);
  const history = [];
  let actionsExecuted = 0;
  let staleReferenceRetries = 0;
  let unchangedPageCount = 0;
  let previousSnapshotFingerprint = "";
  let repeatedActionCount = 0;
  let previousActionFingerprint = "";
  let previousActionPageFingerprint = "";
  let alreadySatisfiedCount = 0;
  let previousLoginDismissFingerprint = "";
  let repeatedLoginDismissCount = 0;
  let lastSnapshot = null;
  let prefetchedSnapshot = null;
  const withEvidence = (result, snapshot = prefetchedSnapshot || lastSnapshot) => ({
    ...result,
    evidenceLedger: evidence.exportEntries(),
    verification: evidence.verification(snapshot),
  });
  const verificationFailureMessage = (verification) => {
    if (!verification.checks.noLiveAction) return "Brizo 仍有未完成的网页动作，不能将任务标记为成功。";
    if (!verification.checks.finalUrl) return "最终页面不是经过安全策略验证的 HTTP(S) 页面，不能将任务标记为成功。";
    if (!verification.checks.negativeSubmitRespected) return "用户明确要求不提交，但执行证据中出现了提交类动作，Brizo 已拒绝报告成功。";
    return "执行证据不足：Brizo 没有验证到与用户目标相符的实际动作，已拒绝仅凭模型声明完成。";
  };
  const waitForRunPermission = async () => {
    signal?.throwIfAborted();
    await waitIfPaused?.();
    signal?.throwIfAborted();
  };
  while (true) {
    await waitForRunPermission();
    if (actionsExecuted >= maxActions) {
      return withEvidence({
        status: "error",
        message: `BrowserSkill 已达到最多 ${maxActions} 步，已自动终止。`,
        steps: history.length,
        history,
      });
    }
    onProgress(`正在读取 Brizo 沙箱页面`);
    const snapshot = prefetchedSnapshot || await snapshotBrowserPage(webContents);
    prefetchedSnapshot = null;
    lastSnapshot = snapshot;
    evidence.recordObservation(snapshot);
    await waitForRunPermission();
    const securityBlock = detectBrowserSecurityBlock(snapshot);
    if (securityBlock) {
      onProgress(securityBlock.progress);
      return withEvidence({
        status: "blocked",
        reason: "site-security-block",
        blockCode: securityBlock.code,
        message: securityBlock.message,
        steps: history.length,
        url: snapshot.url,
        finalSnapshot: snapshot,
        history,
      }, snapshot);
    }
    const loginDismissTarget = await findLoginModalDismissTarget(webContents);
    if (loginDismissTarget) {
      const loginDismissFingerprint = JSON.stringify([
        typeof webContents.getURL === "function" ? webContents.getURL() : "",
        loginDismissTarget.label,
        loginDismissTarget.x,
        loginDismissTarget.y,
      ]);
      repeatedLoginDismissCount = loginDismissFingerprint === previousLoginDismissFingerprint
        ? repeatedLoginDismissCount + 1
        : 0;
      previousLoginDismissFingerprint = loginDismissFingerprint;
      if (repeatedLoginDismissCount < 2) {
        onProgress(`发现登录弹窗，正在点击${loginDismissTarget.label}`);
        const beforeSnapshot = snapshot;
        const evidenceToken = evidence.beginAction({
          action: { action: "dismiss-login" },
          snapshot: beforeSnapshot,
          source: "system",
          target: null,
        });
        try {
          await dismissLoginModal(webContents, loginDismissTarget);
          await waitForRunPermission();
          const afterSnapshot = await snapshotBrowserPage(webContents);
          prefetchedSnapshot = afterSnapshot;
        } catch (error) {
          evidence.finishAction(evidenceToken, { error });
          if (error?.name === "AbortError") throw error;
          return withEvidence({
            status: "error",
            message: "Brizo 无法验证登录弹窗关闭后的页面状态，已停止执行。",
            history,
          }, beforeSnapshot);
        }
        evidence.finishAction(evidenceToken, {
          afterSnapshot: prefetchedSnapshot,
          outcome: { status: "continued", result: "dismissed" },
        });
        history.push({
          action: "dismiss-login",
          ref: "",
          target: "登录弹窗关闭控件",
          value: "",
          result: "dismissed",
        });
        actionsExecuted += 1;
        continue;
      }
    } else {
      previousLoginDismissFingerprint = "";
      repeatedLoginDismissCount = 0;
    }
    const snapshotFingerprint = browserSnapshotFingerprint(snapshot);
    unchangedPageCount = snapshotFingerprint === previousSnapshotFingerprint ? unchangedPageCount + 1 : 0;
    previousSnapshotFingerprint = snapshotFingerprint;
    if (unchangedPageCount >= 12) {
      return withEvidence({ status: "error", message: "BrowserSkill 检测到页面状态长期没有变化，已自动终止以避免错误循环。", history }, snapshot);
    }
    onProgress(`正在规划第 ${actionsExecuted + 1} 步`);
    let action;
    try {
      action = await planNextAction({ command: cleanCommand, history, snapshot, step: actionsExecuted });
      await waitForRunPermission();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return withEvidence({
        status: "error",
        message: `BrowserSkill 无法规划下一步：${error instanceof Error ? error.message : String(error)}`,
        history,
      }, snapshot);
    }
    if (!action || typeof action !== "object") {
      return withEvidence({ status: "error", message: "模型没有返回有效的浏览器动作。", history }, snapshot);
    }
    if (action.action === "done") {
      const verification = evidence.verification(snapshot);
      if (!verification.ok) {
        return {
          status: "error",
          message: verificationFailureMessage(verification),
          steps: history.length,
          url: snapshot.url,
          finalSnapshot: snapshot,
          history,
          evidenceLedger: evidence.exportEntries(),
          verification,
        };
      }
      return {
        status: "success",
        message: String(action.message || "命令已完成。"),
        steps: history.length,
        url: snapshot.url,
        finalSnapshot: snapshot,
        history,
        evidenceLedger: evidence.exportEntries(),
        verification,
      };
    }
    if (enforceNormalEntryNavigation && action.action === "navigate") {
      try {
        const normalizedNavigation = normalizeUsePlannerNavigation(action.url);
        if (normalizedNavigation.rewritten) {
          onProgress("已阻止冷启动业务深链，正在从网站公开入口进入");
          action = { ...action, url: normalizedNavigation.url };
        }
      } catch (error) {
        return withEvidence({
          status: "error",
          message: `BrowserSkill 导航地址无效：${error instanceof Error ? error.message : String(error)}`,
          history,
        }, snapshot);
      }
    }
    const requestedTarget = actionTarget(snapshot, action);
    if (
      action.action === "click"
      && requestedTarget
      && SETTINGS_CONTROL_PATTERN.test(`${requestedTarget.name || ""} ${requestedTarget.purpose || ""}`)
      && SEARCH_CONTROL_PATTERN.test(cleanCommand)
    ) {
      const filledSearchTarget = snapshot.elements.find((element) =>
        (isSearchSnapshotTarget(element) || isTextEntrySnapshotTarget(element))
          && String(element.value || "").trim()
      );
      if (filledSearchTarget) {
        onProgress("已阻止误点设置，正在提交当前搜索内容");
        action = {
          action: "press",
          ref: filledSearchTarget.ref,
          key: "Enter",
        };
      } else {
        onProgress("已阻止把设置菜单误认为搜索键，正在重新定位搜索框");
        action = { action: "press", key: "Escape" };
      }
    }
    const actionFingerprint = browserActionFingerprint(action, snapshot);
    const repeatsWithoutPageProgress = actionFingerprint === previousActionFingerprint
      && snapshotFingerprint === previousActionPageFingerprint;
    repeatedActionCount = repeatsWithoutPageProgress ? repeatedActionCount + 1 : 0;
    previousActionFingerprint = actionFingerprint;
    previousActionPageFingerprint = snapshotFingerprint;
    if (repeatedActionCount >= 5) {
      return withEvidence({ status: "error", message: "BrowserSkill 检测到相同动作连续重复，已自动终止错误循环。", history }, snapshot);
    }
    onProgress(`正在执行第 ${actionsExecuted + 1} 步：${action.action}`);
    let outcome;
    const evidenceTarget = actionTarget(snapshot, action);
    const evidenceToken = evidence.beginAction({
      action,
      snapshot,
      target: evidenceTarget,
    });
    try {
      outcome = await executeBrowserCommandAction({
        action,
        command: cleanCommand,
        snapshot,
        validateNavigation,
        webContents,
      });
      await waitForRunPermission();
      staleReferenceRetries = 0;
    } catch (error) {
      evidence.finishAction(evidenceToken, { error });
      if (/元素引用已经失效/.test(error instanceof Error ? error.message : String(error)) && staleReferenceRetries < 3) {
        staleReferenceRetries += 1;
        onProgress(`页面刚刚发生变化，正在重新读取并定位目标（${staleReferenceRetries}/3）`);
        await sleep(240);
        continue;
      }
      if (error?.name === "AbortError") throw error;
      return withEvidence({
        status: "error",
        message: `BrowserSkill 动作执行失败：${error instanceof Error ? error.message : String(error)}`,
        history,
      }, snapshot);
    }
    if (outcome.status === "needs-confirmation") {
      evidence.finishAction(evidenceToken, { afterSnapshot: snapshot, outcome });
      return withEvidence(outcome, snapshot);
    }
    let afterSnapshot;
    try {
      afterSnapshot = await snapshotBrowserPage(webContents);
      await waitForRunPermission();
    } catch (error) {
      evidence.finishAction(evidenceToken, { error, outcome });
      if (error?.name === "AbortError") throw error;
      return withEvidence({
        status: "error",
        message: "动作已经执行，但 Brizo 无法验证动作后的页面状态，已停止执行。",
        history,
      }, snapshot);
    }
    const postcondition = verifyBrowserActionPostcondition({
      action,
      afterSnapshot,
      beforeSnapshot: snapshot,
      outcome,
    });
    outcome = { ...outcome, postcondition };
    evidence.finishAction(evidenceToken, { afterSnapshot, outcome });
    prefetchedSnapshot = afterSnapshot;
    if (["fill", "navigate", "select"].includes(action.action) && !postcondition.verified) {
      return withEvidence({
        status: "error",
        message: "动作已经执行，但实际页面状态未满足该动作的确定性后置条件，已停止执行。",
        history,
      }, afterSnapshot);
    }
    alreadySatisfiedCount = outcome.result === "already-satisfied" ? alreadySatisfiedCount + 1 : 0;
    if (alreadySatisfiedCount >= 3) {
      return withEvidence({
        status: "error",
        message: "BrowserSkill 连续规划了已经满足的动作，已自动终止错误循环。",
        history,
      }, afterSnapshot);
    }
    history.push({
      action: action.action,
      ref: action.ref || "",
      target: action.ref || (action.url ? sanitizeBrowserEvidenceUrl(action.url) : ""),
      value: ["fill", "select"].includes(action.action)
        ? (evidenceTarget?.sensitive || evidenceTarget?.type === "password" ? "[secret]" : "[redacted]")
        : "",
      result: outcome.result || "executed",
    });
    actionsExecuted += 1;
  }
}

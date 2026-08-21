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

const SENSITIVE_ACTION_PATTERN = /删除|移除|清空|购买|支付|付款|下单|转账|汇款|发送|发布|提交|确认|授权|同意|保存|delete|remove|clear|buy|purchase|pay|transfer|send|publish|post|submit|confirm|authorize|accept|save/i;
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

function httpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
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
  const previousUrl = webContents.getURL();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await webContents.loadURL(url);
      await settle(webContents);
      return;
    } catch (error) {
      if (!isAbortedNavigationError(error)) throw error;
      await settle(webContents);
      const currentUrl = webContents.isDestroyed() ? "" : webContents.getURL();
      if (httpUrl(currentUrl) && currentUrl !== previousUrl) return;
      if (attempt === 0) {
        await sleep(300);
        continue;
      }
      throw new Error("目标网页连续取消导航，未能离开当前页面。");
    }
  }
}

export async function snapshotBrowserPage(webContents) {
  if (!webContents || webContents.isDestroyed()) throw new Error("当前网页已关闭。");
  return await webContents.executeJavaScript(`
    (() => {
      const selector = ${JSON.stringify(INTERACTIVE_SELECTOR)};
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden"
          && style.display !== "none"
          && Number(style.opacity || 1) > 0.02
          && rect.width > 1
          && rect.height > 1
          && rect.bottom >= 0
          && rect.right >= 0
          && rect.top <= innerHeight
          && rect.left <= innerWidth;
      };
      const clean = (value, limit = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
      const snapshotId = "brizo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      document.querySelectorAll("[data-brizo-agent-ref]").forEach((element) => element.removeAttribute("data-brizo-agent-ref"));
      const elements = [...document.querySelectorAll(selector)]
        .filter(visible)
        .slice(0, 140)
        .map((element, index) => {
          const rect = element.getBoundingClientRect();
          const type = clean(element.getAttribute("type"), 30).toLowerCase();
          const semanticHint = clean([
            element.id,
            typeof element.className === "string" ? element.className : "",
            element.getAttribute("data-testid"),
            element.getAttribute("data-e2e"),
            element.getAttribute("data-type"),
          ].filter(Boolean).join(" "), 240);
          const explicitText = clean(
            element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.innerText
            || element.getAttribute("placeholder")
            || element.getAttribute("alt")
            || (type === "password" ? "" : element.value),
          );
          const inferredText = /search|magnif|搜索|检索/i.test(semanticHint)
            ? "搜索"
            : /setting|preference|config|设置/i.test(semanticHint)
              ? "设置"
              : "";
          const text = explicitText || inferredText;
          const contentEditable = element.isContentEditable;
          const domRef = snapshotId + "-" + (index + 1);
          element.setAttribute("data-brizo-agent-ref", domRef);
          return {
            ref: "@e" + (index + 1),
            domRef,
            tag: element.tagName.toLowerCase(),
            role: clean(element.getAttribute("role"), 40),
            name: text,
            type,
            href: element.tagName === "A" ? clean(element.href, 500) : "",
            value: type === "password"
              ? ""
              : clean(contentEditable ? element.innerText || element.textContent : element.value, 500),
            purpose: inferredText,
            checked: typeof element.checked === "boolean" ? element.checked : undefined,
            disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          };
        });
      const pageText = clean(document.body?.innerText || "", 10000);
      return {
        title: clean(document.title, 240),
        url: location.href,
        pageText,
        viewport: { width: innerWidth, height: innerHeight, scrollY: Math.round(scrollY) },
        elements,
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

function requiresExplicitConfirmation(command, target) {
  if (!target || !SENSITIVE_ACTION_PATTERN.test(target.name || "")) return false;
  return !SENSITIVE_ACTION_PATTERN.test(command || "");
}

export async function executeBrowserCommandAction({ action, command, snapshot, webContents }) {
  const kind = String(action?.action || "").toLowerCase();
  const target = actionTarget(snapshot, action);
  if (["click", "fill", "select"].includes(kind) && !target) {
    throw new Error("页面元素引用已经失效，请重新观察页面。");
  }
  if (kind === "click" && requiresExplicitConfirmation(command, target)) {
    return {
      status: "needs-confirmation",
      message: `“${target.name || target.ref}”可能产生提交、发送、购买或删除等外部影响。请在命令中明确写出要执行该操作后再试。`,
    };
  }
  if (kind === "navigate") {
    const url = httpUrl(action.url);
    if (!url) throw new Error("只能导航到 http 或 https 地址。");
    if (httpUrl(snapshot.url) === url) return { status: "continued", result: "already-satisfied" };
    await loadUrlFollowingRedirects(webContents, url);
    return { status: "continued", result: "navigated" };
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
    return { status: "continued" };
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
        const element = document.querySelector('[data-brizo-agent-ref="' + CSS.escape(${JSON.stringify(target.domRef || "")}) + '"]');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return null;
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
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
    const value = String(action.value || "").slice(0, 4000);
    if (String(target.value || "") === value && !isSearchSnapshotTarget(target)) {
      return { status: "continued", result: "already-satisfied" };
    }
    const filled = await webContents.executeJavaScript(`
      (() => {
        const element = document.querySelector('[data-brizo-agent-ref="' + CSS.escape(${JSON.stringify(target.domRef || "")}) + '"]');
        if (!element) return null;
        element.focus();
        if (element.isContentEditable) {
          element.textContent = ${JSON.stringify(value)};
        } else {
          // React and other controlled form libraries observe the native value
          // setter. Directly assigning element.value can leave their state stale
          // even though the DOM briefly appears to contain the requested text.
          const prototype = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          if (setter) setter.call(element, ${JSON.stringify(value)});
          else element.value = ${JSON.stringify(value)};
        }
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(value)} }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        const clean = (input) => String(input || "").replace(/\\s+/g, " ").trim();
        const searchPattern = ${SEARCH_CONTROL_PATTERN.toString()};
        const settingsPattern = ${SETTINGS_CONTROL_PATTERN.toString()};
        const hint = clean([
          element.getAttribute("type"),
          element.getAttribute("role"),
          element.getAttribute("aria-label"),
          element.getAttribute("placeholder"),
          element.id,
          typeof element.className === "string" ? element.className : "",
          element.getAttribute("data-testid"),
        ].filter(Boolean).join(" "));
        const commandHasSearchIntent = searchPattern.test(${JSON.stringify(String(command || ""))});
        const textEntry = element.matches('input:not([type="hidden"]),textarea,[contenteditable="true"],[role="textbox"]');
        const isSearch = element.getAttribute("type") === "search"
          || searchPattern.test(hint)
          || (commandHasSearchIntent && textEntry);
        if (!isSearch) return { filled: true, isSearch: false, submit: null };
        const inputRect = element.getBoundingClientRect();
        const visible = (candidate) => {
          const style = getComputedStyle(candidate);
          const rect = candidate.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > .02
            && rect.width > 1 && rect.height > 1;
        };
        const submitSelector = [
          ${JSON.stringify(INTERACTIVE_SELECTOR)},
          '[class*="search" i]',
          '[class*="magnif" i]',
          '[id*="search" i]',
          '[aria-label*="搜索" i]',
          '[title*="搜索" i]',
          'svg',
        ].join(',');
        const candidates = [...document.querySelectorAll(submitSelector)]
          .filter((candidate) => candidate !== element && visible(candidate))
          .map((candidate) => {
            const rect = candidate.getBoundingClientRect();
            const label = clean([
              candidate.getAttribute("aria-label"),
              candidate.getAttribute("title"),
              candidate.innerText,
              candidate.id,
              typeof candidate.className === "string" ? candidate.className : "",
              candidate.getAttribute("data-testid"),
              candidate.getAttribute("data-e2e"),
              candidate.querySelector?.('svg')?.getAttribute?.('aria-label'),
              candidate.querySelector?.('use')?.getAttribute?.('href'),
              candidate.querySelector?.('use')?.getAttribute?.('xlink:href'),
            ].filter(Boolean).join(" "));
            const centerX = rect.left + rect.width / 2;
            const deltaX = centerX - inputRect.right;
            const deltaY = Math.abs((rect.top + rect.height / 2) - (inputRect.top + inputRect.height / 2));
            const explicitSearch = searchPattern.test(label);
            const isSettings = settingsPattern.test(label);
            const formSubmit = candidate.form === element.form
              && /^(?:submit|image)$/i.test(candidate.getAttribute("type") || "");
            const clickable = candidate.matches('button,[role="button"],input[type="submit"],input[type="image"],a[href]')
              || typeof candidate.onclick === "function"
              || getComputedStyle(candidate).cursor === "pointer";
            const compact = rect.width <= 112 && rect.height <= 96;
            if (candidate.contains(element) || isSettings || deltaX < -42 || deltaX > 180
              || deltaY > Math.max(44, inputRect.height * 1.25) || (!compact && !explicitSearch)) return null;
            if (!explicitSearch && !formSubmit && !clickable && !candidate.closest?.('[class*="search" i]')) return null;
            const score = (explicitSearch ? 220 : 0)
              + (formSubmit ? 180 : 0)
              + (clickable ? 45 : 0)
              + (compact ? 22 : 0)
              + Math.max(0, 90 - Math.abs(deltaX))
              + Math.max(0, 44 - deltaY);
            return score >= 70 ? {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              label: explicitSearch ? "搜索键" : "搜索框右侧按钮",
              score,
              element: candidate,
            } : null;
          })
          .filter(Boolean)
          .sort((left, right) => right.score - left.score);
        const submit = candidates[0] || null;
        if (submit?.element) {
          const clickTarget = submit.element.closest?.('button,[role="button"],a[href]') || submit.element;
          clickTarget.click();
          return { filled: true, isSearch: true, submittedInPage: true, submit: null };
        }
        if (element.form?.requestSubmit) {
          element.form.requestSubmit();
          return { filled: true, isSearch: true, submittedInPage: true, submit: null };
        }
        element.focus();
        return { filled: true, isSearch: true, submittedInPage: false, submit: null };
      })()
    `);
    if (!filled?.filled) throw new Error("页面元素引用已经失效，请重新观察页面。");
    if (filled.submittedInPage) {
      await settle(webContents, 5_000);
      return { status: "continued", result: "filled-and-submitted" };
    }
    if (filled.submit) {
      const point = scaledInputPoint(webContents, filled.submit);
      webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
      webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x: point.x, y: point.y });
      webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: point.x, y: point.y });
      await settle(webContents, 5_000);
      return { status: "continued", result: "filled-and-submitted" };
    }
    if (filled.isSearch) {
      webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      await settle(webContents, 5_000);
      return { status: "continued", result: "filled-and-submitted" };
    }
    await sleep(180);
    return { status: "continued", result: "filled" };
  }
  if (kind === "select") {
    const value = String(action.value || "").slice(0, 500);
    if (String(target.value || "") === value) {
      return { status: "continued", result: "already-satisfied" };
    }
    const selected = await webContents.executeJavaScript(`
      (() => {
        const element = document.querySelector('[data-brizo-agent-ref="' + CSS.escape(${JSON.stringify(target.domRef || "")}) + '"]');
        if (!(element instanceof HTMLSelectElement)) return false;
        element.value = ${JSON.stringify(value)};
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()
    `);
    if (!selected) throw new Error("页面元素引用已经失效，请重新观察页面。");
    await sleep(180);
    return { status: "continued", result: "selected" };
  }
  if (kind === "press") {
    const key = String(action.key || "Enter").slice(0, 40);
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

export async function runBrowserCommandAgent({ command, onProgress = () => {}, planNextAction, signal, waitIfPaused, webContents }) {
  const maxActions = 50;
  const cleanCommand = String(command || "").trim().slice(0, 2000);
  if (!cleanCommand) return { status: "error", message: "请输入浏览器命令。" };
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
  const waitForRunPermission = async () => {
    signal?.throwIfAborted();
    await waitIfPaused?.();
    signal?.throwIfAborted();
  };
  while (true) {
    await waitForRunPermission();
    if (actionsExecuted >= maxActions) {
      return {
        status: "error",
        message: `BrowserSkill 已达到最多 ${maxActions} 步，已自动终止。`,
        steps: history.length,
        history,
      };
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
        await dismissLoginModal(webContents, loginDismissTarget);
        await waitForRunPermission();
        history.push({
          action: "dismiss-login",
          ref: "",
          target: loginDismissTarget.label,
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
    onProgress(`正在读取 Brizo 沙箱页面`);
    const snapshot = await snapshotBrowserPage(webContents);
    await waitForRunPermission();
    const snapshotFingerprint = browserSnapshotFingerprint(snapshot);
    unchangedPageCount = snapshotFingerprint === previousSnapshotFingerprint ? unchangedPageCount + 1 : 0;
    previousSnapshotFingerprint = snapshotFingerprint;
    if (unchangedPageCount >= 12) {
      return { status: "error", message: "BrowserSkill 检测到页面状态长期没有变化，已自动终止以避免错误循环。", history };
    }
    onProgress(`正在规划第 ${actionsExecuted + 1} 步`);
    let action = await planNextAction({ command: cleanCommand, history, snapshot, step: actionsExecuted });
    await waitForRunPermission();
    if (!action || typeof action !== "object") throw new Error("模型没有返回有效的浏览器动作。");
    if (action.action === "done") {
      return {
        status: "success",
        message: String(action.message || "命令已完成。"),
        steps: history.length,
        url: snapshot.url,
        finalSnapshot: snapshot,
        history,
      };
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
          action: "fill",
          ref: filledSearchTarget.ref,
          value: filledSearchTarget.value,
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
      return { status: "error", message: "BrowserSkill 检测到相同动作连续重复，已自动终止错误循环。", history };
    }
    onProgress(`正在执行第 ${actionsExecuted + 1} 步：${action.action}`);
    let outcome;
    try {
      outcome = await executeBrowserCommandAction({
        action,
        command: cleanCommand,
        snapshot,
        webContents,
      });
      await waitForRunPermission();
      staleReferenceRetries = 0;
    } catch (error) {
      if (/元素引用已经失效/.test(error instanceof Error ? error.message : String(error)) && staleReferenceRetries < 3) {
        staleReferenceRetries += 1;
        onProgress(`页面刚刚发生变化，正在重新读取并定位目标（${staleReferenceRetries}/3）`);
        await sleep(240);
        continue;
      }
      throw error;
    }
    if (outcome.status === "needs-confirmation") return outcome;
    alreadySatisfiedCount = outcome.result === "already-satisfied" ? alreadySatisfiedCount + 1 : 0;
    if (alreadySatisfiedCount >= 3) {
      return {
        status: "error",
        message: "BrowserSkill 连续规划了已经满足的动作，已自动终止错误循环。",
        history,
      };
    }
    history.push({
      action: action.action,
      ref: action.ref || "",
      target: actionTarget(snapshot, action)?.name || action.url || "",
      value: ["fill", "select"].includes(action.action) ? String(action.value || "").slice(0, 500) : "",
      result: outcome.result || "executed",
    });
    actionsExecuted += 1;
  }
}

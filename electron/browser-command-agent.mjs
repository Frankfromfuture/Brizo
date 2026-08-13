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
].join(",");

const SENSITIVE_ACTION_PATTERN = /删除|移除|清空|购买|支付|付款|下单|转账|汇款|发送|发布|提交|确认|授权|同意|保存|delete|remove|clear|buy|purchase|pay|transfer|send|publish|post|submit|confirm|authorize|accept|save/i;
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

async function settle(webContents, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  await sleep(260);
  while (!webContents.isDestroyed() && webContents.isLoading() && Date.now() < deadline) {
    await sleep(120);
  }
  await sleep(180);
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
          const text = clean(
            element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.innerText
            || element.getAttribute("placeholder")
            || element.getAttribute("alt")
            || (type === "password" ? "" : element.value),
          );
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
            value: type === "password" ? "" : clean(element.value, 500),
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
    webContents.sendInputEvent({ type: "mouseMove", x: position.x, y: position.y });
    webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x: position.x, y: position.y });
    webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: position.x, y: position.y });
    await settle(webContents);
    return { status: "continued" };
  }
  if (kind === "fill") {
    const value = String(action.value || "").slice(0, 4000);
    if (String(target.value || "") === value) {
      return { status: "continued", result: "already-satisfied" };
    }
    const filled = await webContents.executeJavaScript(`
      (() => {
        const element = document.querySelector('[data-brizo-agent-ref="' + CSS.escape(${JSON.stringify(target.domRef || "")}) + '"]');
        if (!element) return false;
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
        return true;
      })()
    `);
    if (!filled) throw new Error("页面元素引用已经失效，请重新观察页面。");
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

export async function runBrowserCommandAgent({ command, onProgress = () => {}, planNextAction, signal, webContents }) {
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
  while (true) {
    signal?.throwIfAborted();
    if (actionsExecuted >= maxActions) {
      return {
        status: "error",
        message: `BrowserSkill 已达到最多 ${maxActions} 步，已自动终止。`,
        steps: history.length,
        history,
      };
    }
    onProgress(`正在读取 Brizo 沙箱页面`);
    const snapshot = await snapshotBrowserPage(webContents);
    const snapshotFingerprint = browserSnapshotFingerprint(snapshot);
    unchangedPageCount = snapshotFingerprint === previousSnapshotFingerprint ? unchangedPageCount + 1 : 0;
    previousSnapshotFingerprint = snapshotFingerprint;
    if (unchangedPageCount >= 12) {
      return { status: "error", message: "BrowserSkill 检测到页面状态长期没有变化，已自动终止以避免错误循环。", history };
    }
    onProgress(`正在规划第 ${actionsExecuted + 1} 步`);
    const action = await planNextAction({ command: cleanCommand, history, snapshot, step: actionsExecuted });
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

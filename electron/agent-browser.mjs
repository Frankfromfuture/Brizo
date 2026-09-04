import { WebContentsView, session } from "electron";
import { randomUUID } from "node:crypto";
import { detectBrowserLoginRequirement, executeBrowserCommandAction, evaluateBrowserPage, loadBrowserPageWhenReady, parseBrowserCommandAction, snapshotBrowserPage } from "./browser-command-agent.mjs";
import { detectBrowserSecurityBlock } from "./browser-security-block.mjs";
import { dispatchPageEvents, withPageInput } from "./agent-page-input.mjs";

const failure = (message, code) => Object.assign(new Error(message), { code });
const cleanUrl = value => {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.username = ""; url.password = ""; url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/token|password|secret|auth|session|api.?key|^code$/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return ""; }
};
const targetSignature = target => target ? JSON.stringify([target.tag, target.role, target.name, target.href, target.value, target.disabled, target.credentialField]) : "";

export async function createAgentSandbox({ id, goal, client, url, host, installNetworkPolicy, validateTarget, onClose }) {
  const partition = `brizo-agent-${id}`;
  const sandboxSession = session.fromPartition(partition);
  installNetworkPolicy(sandboxSession);
  sandboxSession.setPermissionCheckHandler(() => false);
  sandboxSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  sandboxSession.on("will-download", event => event.preventDefault());
  const tabs = new Map();
  const record = { id, goal, client, status: "agent", activeId: "", detail: "等待外部 Agent 操作", pauseReason: null, steps: 0, summary: "", usage: null, busy: false, controller: null, closed: false, bounds: null };
  const state = () => ({
    id, goal, client, status: record.status, detail: record.detail, pauseReason: record.pauseReason, steps: record.steps,
    busy: record.busy, activeId: record.activeId, summary: record.summary, usage: record.usage,
    tabs: [...tabs.values()].map(tab => ({ id: tab.id, ready: Boolean(tab.view.__brizoContentReady), title: tab.view.webContents.isDestroyed() ? "已关闭" : tab.view.webContents.getTitle() || "新标签", url: tab.view.webContents.isDestroyed() ? "" : cleanUrl(tab.view.webContents.getURL()) })),
  });
  const publish = (detail, focusTab = false) => {
    if (detail) record.detail = detail;
    if (!record.closed) {
      for (const tab of tabs.values()) host.updateTab(tab.view, record.status === "agent");
      host.publish(state(), focusTab);
    }
  };
  const layout = () => { for (const tab of tabs.values()) host.updateTab(tab.view, record.status === "agent"); };
  const loadPage = async (contents, address, signal) => {
    try { await loadBrowserPageWhenReady(contents, address, { signal }); }
    catch (error) {
      signal?.throwIfAborted();
      // Some sites defer DOMContentLoaded behind slow scripts although the
      // current main document already contains a usable, visible page.
      const usable = /20 秒/.test(error.message) && await evaluateBrowserPage(contents,
        `Boolean(document.body && document.body.innerText.trim().length > 30 && document.querySelector('input,textarea,a,button'))`).catch(() => false);
      if (!usable) throw error;
    }
    signal?.throwIfAborted();
  };
  const invalidate = () => { for (const tab of tabs.values()) tab.observation = null; };
  const handoff = (message, code = "USER_CONTROL") => {
    if (record.status === "stopped" || record.closed) return;
    const detail = message || "你已接管网页；操作完成后点击「交还 AI」。";
    record.pauseReason = { code, message: detail };
    record.status = "user";
    record.controller?.abort(failure(detail, code));
    invalidate(); layout(); publish(detail);
  };
  const stop = () => { handoff(); record.status = "stopped"; layout(); publish("连接已停止，外部 Agent 的操作权限已撤销。"); };
  const active = () => {
    const tab = tabs.get(record.activeId);
    if (!tab || tab.view.webContents.isDestroyed()) throw failure("当前沙箱标签不可用。", "TAB_GONE");
    return tab;
  };
  const addTab = async (address, signal) => {
    if (tabs.size >= 8) throw failure("每个沙箱最多八个标签。", "TAB_LIMIT");
    const safeUrl = await validateTarget(address || "https://www.bing.com/", sandboxSession);
    signal?.throwIfAborted();
    if (record.closed) throw failure("沙箱已关闭。", "CLOSED");
    const view = new WebContentsView({ webPreferences: { partition, sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    const shield = new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    shield.setBackgroundColor("#00000000"); shield.setVisible(false);
    shield.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    shield.webContents.on("before-input-event", event => event.preventDefault());
    const tab = { id: randomUUID(), view, shield, generation: 0, observation: null };
    view.setBackgroundColor("#ffffff"); view.setBorderRadius(10); view.setVisible(false);
    tabs.set(tab.id, tab); record.activeId = tab.id;
    host.attachTab({ tabId: tab.id, sessionId: id, view, shield,
      onClose: () => { if (tabs.size <= 1) destroy(); else { handoff("标签已关闭，请确认后交还 AI。"); removeTab(tab.id); } },
      onNavigate: address => control("navigate", { tabId: tab.id, url: address }),
    });
    await host.loadRunningEffect(shield);
    view.webContents.on("did-start-navigation", (_event, _url, _same, mainFrame) => { if (mainFrame) { tab.generation += 1; tab.observation = null; } });
    view.webContents.on("page-title-updated", () => publish());
    view.webContents.on("did-navigate", () => publish());
    for (const eventName of ["will-navigate", "will-redirect"]) view.webContents.on(eventName, (event, address) => {
      if (!/^https?:\/\//i.test(address)) event.preventDefault();
    });
    view.webContents.on("render-process-gone", () => handoff("网页进程已退出，请在沙箱中重新打开页面。", "BROWSER_PAUSED"));
    view.webContents.setWindowOpenHandler(({ url: target, postBody }) => {
      if (record.status !== "agent" && !postBody) void addTab(target).catch(error => publish(error.message));
      else publish("网页请求新标签；Agent 可通过 open 命令打开观察到的链接。");
      return { action: "deny" };
    });
    layout(); publish("正在打开沙箱网页", true);
    await loadPage(view.webContents, safeUrl, signal);
    view.__brizoContentReady = true; view.__brizoNavigationPending = false;
    publish("沙箱网页已就绪");
    return tab;
  };
  const removeTab = tabId => {
    if (!tabs.has(tabId)) throw failure("标签不属于当前沙箱。", "TAB_SCOPE");
    if (tabs.size <= 1) throw failure("请保留至少一个标签，或关闭整个沙箱。", "LAST_TAB");
    const tab = tabs.get(tabId); tabs.delete(tabId); host.detachTab(tab.view);
    if (record.activeId === tabId) record.activeId = tabs.keys().next().value;
    invalidate(); layout(); publish();
  };
  const observe = async signal => {
    signal?.throwIfAborted();
    const tab = active(), wc = tab.view.webContents;
    if (await detectBrowserLoginRequirement(wc)) { handoff("网页需要登录，请手动完成后交还 AI。", "NEEDS_LOGIN"); throw failure(record.detail, "NEEDS_LOGIN"); }
    const snapshot = await snapshotBrowserPage(wc);
    signal?.throwIfAborted();
    const block = detectBrowserSecurityBlock(snapshot);
    if (block) { handoff(block.message, "SITE_BLOCKED"); throw failure(block.message, "SITE_BLOCKED"); }
    const snapshotId = randomUUID();
    tab.observation = { snapshotId, snapshot, generation: tab.generation };
    return {
      tabId: tab.id, snapshotId, title: snapshot.title, url: cleanUrl(snapshot.url), pageText: snapshot.pageText, viewport: snapshot.viewport, frames: snapshot.frames?.map(frame => ({ ...frame, url: cleanUrl(frame.url) })),
      elements: snapshot.elements.map(({ domRef, href, x, y, validity, ...element }) => ({ ...element, ...(href ? { href: cleanUrl(href) } : {}) })),
    };
  };
  const assertAgent = () => {
    if (record.closed) throw failure("沙箱已关闭。", "CLOSED");
    if (record.status === "user") throw failure(record.pauseReason?.message || record.detail, record.pauseReason?.code || "USER_CONTROL");
    if (record.status !== "agent") throw failure("本次连接已结束，请创建新的沙箱。", "REVOKED");
  };
  const request = async (method, args = {}, connectionSignal) => {
    if (method === "status") return state();
    if (method === "close" && record.status === "complete") { destroy(); return { id, status: "closed" }; }
    assertAgent();
    if (method === "handoff") { handoff(String(args.message || "")); return state(); }
    if (record.busy) throw failure("上一个浏览器操作仍在进行，请等待完成。", "BUSY");
    record.busy = true;
    const controller = new AbortController(); record.controller = controller;
    const signal = controller.signal;
    const disconnected = () => controller.abort(failure("外部 Agent 的连接已中断。", "DISCONNECTED"));
    connectionSignal?.addEventListener("abort", disconnected, { once: true });
    if (connectionSignal?.aborted) disconnected();
    const deadline = setTimeout(() => controller.abort(failure("浏览器操作超过 25 秒，已暂停。", "TIMEOUT")), 25_000);
    const timed = work => new Promise((resolve, reject) => {
      const cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
    });
    try {
      signal.throwIfAborted();
      if (method === "observe") return await timed(observe(signal));
      if (method === "screenshot") {
        await timed(observe(signal));
        const image = await timed(active().view.webContents.capturePage());
        signal.throwIfAborted();
        return { mimeType: "image/png", data: image.toPNG().toString("base64") };
      }
      if (method === "open") { await timed(addTab(args.url, signal)); return { state: state(), observation: await timed(observe(signal)) }; }
      if (method === "switch") {
        if (!tabs.has(args.tabId)) throw failure("标签不属于当前沙箱。", "TAB_SCOPE");
        record.activeId = args.tabId; invalidate(); layout(); publish(null, true);
        return { state: state(), observation: await timed(observe(signal)) };
      }
      if (method === "close-tab") { removeTab(args.tabId); return state(); }
      if (method === "act") {
        const tab = active(), cached = tab.observation;
        if (!cached || cached.snapshotId !== args.snapshotId || cached.generation !== tab.generation) throw failure("页面观察已失效，请重新 observe 后再操作。", "STALE_SNAPSHOT");
        const action = parseBrowserCommandAction(args);
        if (action.action === "done") throw failure("请用 finish 提交结果。", "ACTION_INVALID");
        const fresh = await timed(snapshotBrowserPage(tab.view.webContents));
        signal.throwIfAborted();
        if (cached.generation !== tab.generation) throw failure("页面已跳转，请重新观察。", "STALE_SNAPSHOT");
        if (action.ref) {
          const oldTarget = cached.snapshot.elements.find(item => item.ref === action.ref);
          const newTarget = fresh.elements.find(item => item.ref === action.ref);
          if (!oldTarget || !newTarget || targetSignature(oldTarget) !== targetSignature(newTarget)) throw failure("目标控件已变化，请重新 observe。", "STALE_SNAPSHOT");
          if (newTarget.credentialField) { handoff("这一步涉及登录信息，请手动完成后交还 AI。", "NEEDS_LOGIN"); throw failure(record.detail, "NEEDS_LOGIN"); }
        }
        tab.observation = null;
        publish(`外部 Agent 正在${({ fill: "填写", click: "点击", scroll: "滚动", navigate: "导航" })[action.action] || "操作"}网页`);
        const outcome = await timed(withPageInput(tab.view.webContents, signal, send => executeBrowserCommandAction({ action, command: goal, snapshot: fresh, signal, webContents: tab.view.webContents,
          validateNavigation: target => validateTarget(target, sandboxSession), sendInputEvents: events => dispatchPageEvents(tab.view.webContents, events, signal, send) })));
        signal.throwIfAborted();
        if (outcome.status === "needs-confirmation") { handoff(outcome.message, "NEEDS_CONFIRMATION"); throw failure(outcome.message, "NEEDS_CONFIRMATION"); }
        record.steps += 1;
        return { outcome, observation: await timed(observe(signal)) };
      }
      if (method === "finish") {
        record.summary = String(args.summary || "外部 Agent 已结束任务。").slice(0, 16000);
        const totalTokens = Number.isSafeInteger(args.usage?.totalTokens) && args.usage.totalTokens >= 0 ? args.usage.totalTokens : null;
        record.usage = { models: (Array.isArray(args.usage?.models) ? args.usage.models : []).filter(item => typeof item === "string").slice(0, 10).map(item => item.slice(0, 100)), totalTokens, complete: args.usage?.complete === true };
        record.status = "complete"; invalidate(); layout(); publish("外部 Agent 已交付结果，你可以继续浏览。");
        const result = state();
        if (args.keep === false) { destroy(); result.status = "closed"; }
        return result;
      }
      if (method === "close") { destroy(); return { id, status: "closed" }; }
      throw failure("不支持的浏览器命令。", "METHOD_UNKNOWN");
    } catch (error) {
      if (signal.aborted && record.status === "agent") handoff(error.message, error.code || "BROWSER_PAUSED");
      throw error;
    } finally {
      clearTimeout(deadline); connectionSignal?.removeEventListener("abort", disconnected);
      record.busy = false; if (record.controller === controller) record.controller = null;
      if (!record.closed) publish();
    }
  };
  const control = async (action, payload) => {
    if (action === "takeover") { handoff(); return state(); }
    if (action === "stop") { stop(); return state(); }
    if (action === "resume") {
      if (record.status !== "user" || record.busy) throw failure("请等待当前操作停止后再交还 AI。", "BUSY");
      record.status = "agent"; record.pauseReason = null; invalidate(); layout(); publish("已交还 AI，请回到外部 Agent 继续任务。"); return state();
    }
    if (record.status === "agent" || record.busy) throw failure("请先接管网页。", "AGENT_CONTROL");
    if (action === "new-tab") await addTab(payload?.url);
    else if (action === "select-tab") { if (!tabs.has(payload)) throw failure("标签不属于当前沙箱。", "TAB_SCOPE"); record.activeId = payload; layout(); }
    else if (action === "close-tab") removeTab(payload);
    else if (action === "navigate") {
      const tab = tabs.get(payload?.tabId);
      if (!tab) throw failure("标签不属于当前沙箱。", "TAB_SCOPE");
      await loadPage(tab.view.webContents, await validateTarget(payload.url, sandboxSession));
      tab.view.__brizoContentReady = true; tab.view.__brizoNavigationPending = false;
    }
    publish(); return state();
  };
  const destroy = () => {
    if (record.closed) return;
    record.closed = true; record.controller?.abort();
    for (const tab of tabs.values()) host.detachTab(tab.view);
    tabs.clear(); void sandboxSession.clearStorageData();
    host.publish({ ...state(), status: "closed", tabs: [] }); onClose?.(id);
  };
  try {
    await addTab(url || "https://www.bing.com/");
    return { request, state, control, destroy };
  } catch (error) { destroy(); throw error; }
}

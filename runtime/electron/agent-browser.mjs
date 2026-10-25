import { WebContentsView, session } from "electron";
import { randomUUID } from "node:crypto";
import { detectBrowserLoginRequirement, executeBrowserCommandAction, evaluateBrowserPage, loadBrowserPageWhenReady, parseBrowserCommandAction, snapshotBrowserPage, waitForBrowserControlReady } from "./browser-command-agent.mjs";
import { detectBrowserSecurityBlock } from "./browser-security-block.mjs";
import { dispatchPageEvents, withPageInput } from "./agent-page-input.mjs";
import { agentError, errorRecovery, findTarget, presentObservation, validateAgentAction, validateBatch, validateObservationOptions, waitForObservation } from "./agent-session-tools.mjs";
import { authorizeVisualIntent, executeVisualAction } from "./agent-visual-input.mjs";
import { BRIZO_AGENT_CAPABILITIES } from "../../lib/protocol.mjs";

const failure = (message, code) => Object.assign(new Error(message), { code });
const cleanUrl = value => {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.username = ""; url.password = "";
    // Preserve ordinary section IDs; OAuth/token payload fragments stay private.
    if (!/^#[\p{L}\p{N}_.:-]{1,160}$/u.test(url.hash)) url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/token|password|secret|auth|session|api.?key|^code$/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return ""; }
};
const targetSignature = target => target ? JSON.stringify([target.tag, target.role, target.name, target.href, target.value, target.disabled, target.credentialField]) : "";

export async function createAgentSandbox({ id, goal, client, url, host, installNetworkPolicy, validateTarget, onClose, observeOptions }) {
  const partition = `brizo-agent-${id}`;
  const sandboxSession = session.fromPartition(partition);
  installNetworkPolicy(sandboxSession);
  sandboxSession.setPermissionCheckHandler(() => false);
  sandboxSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  sandboxSession.on("will-download", event => event.preventDefault());
  const tabs = new Map();
  const observations = new Map();
  const metrics = { calls: 0, observations: 0, actions: 0, failures: 0, elapsedMs: 0 };
  const record = { id, goal, client, status: "agent", activeId: "", detail: "等待外部 Agent 操作", pauseReason: null, steps: 0, summary: "", usage: null, busy: false, controller: null, closed: false, bounds: null };
  const state = () => ({
    id, goal, client, status: record.status, detail: record.detail, pauseReason: record.pauseReason, steps: record.steps,
    busy: record.busy, activeId: record.activeId, summary: record.summary, usage: record.usage,
    metrics: { ...metrics },
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
    const view = new WebContentsView({ webPreferences: { partition, sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
      ...(host.offscreenRendering ? { offscreen: true } : {}) } });
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
  const observationSelection = (options = {}) => {
    validateObservationOptions(options);
    const selection = Object.fromEntries(["scope", "maxChars", "maxElements", "offset", "textOffset", "filter"].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
    selection.scope ||= "viewport";
    if (selection.scope === "subtree") {
      const cached = active().observation;
      if (!cached || cached.snapshotId !== options.snapshotId || cached.generation !== active().generation) throw agentError("STALE_SNAPSHOT", "Subtree roots require the latest observation ID.");
      const root = [...(cached.snapshot.regions || []), ...cached.snapshot.elements, ...(cached.snapshot.frames || [])].find(item => item.ref === options.root);
      if (!root?.domRef) throw agentError("ROOT_NOT_FOUND", "The root is absent from the latest observation.");
      if (options.root.startsWith("@f") && !root.sameOrigin) throw agentError("FRAME_UNAVAILABLE", "Cross-origin frames remain an inaccessible boundary.");
      selection.rootDomRef = root.domRef;
      selection.rootAttribute = options.root.startsWith("@r") ? "data-brizo-region-ref" : options.root.startsWith("@f") ? "data-brizo-frame-ref" : "data-brizo-agent-ref";
    }
    return selection;
  };
  const readSnapshot = async (signal, selection = { scope: "viewport" }) => {
    signal?.throwIfAborted();
    const tab = active(), wc = tab.view.webContents;
    const snapshot = await snapshotBrowserPage(wc, { includeLoginState: true, observation: selection });
    const needsLogin = Object.hasOwn(snapshot, "loginRequirement") ? snapshot.loginRequirement : await detectBrowserLoginRequirement(wc);
    if (needsLogin) { handoff("网页需要登录，请手动完成后交还 AI。", "NEEDS_LOGIN"); throw failure(record.detail, "NEEDS_LOGIN"); }
    metrics.observations++;
    signal?.throwIfAborted();
    const block = detectBrowserSecurityBlock({ ...snapshot, pageText: snapshot.securityText || snapshot.pageText });
    if (block) { handoff(block.message, "SITE_BLOCKED"); throw failure(block.message, "SITE_BLOCKED"); }
    return snapshot;
  };
  const storeObservation = (snapshot, options = {}) => {
    options = { format: observeOptions?.format || "json", ...options };
    const tab = active();
    const previous = options.since ? observations.get(options.since) : undefined;
    const snapshotId = randomUUID();
    const output = presentObservation(snapshot, { tabId: tab.id, snapshotId, options, previous: previous?.tabId === tab.id ? previous.snapshot : undefined, cleanUrl });
    tab.observation = { snapshotId, snapshot, generation: tab.generation };
    observations.set(snapshotId, { snapshot, tabId: tab.id });
    while (observations.size > 4) observations.delete(observations.keys().next().value);
    return output;
  };
  const observe = async (signal, options = {}) => storeObservation(await readSnapshot(signal, observationSelection(options)), options);
  const wait = async (condition, signal, options) => {
    const result = await waitForObservation(() => readSnapshot(signal, observationSelection(options)), condition, signal);
    return { observation: storeObservation(result.snapshot, options), wait: { polls: result.polls, elapsedMs: result.elapsedMs } };
  };
  const act = async (args, signal, options = {}) => {
    validateAgentAction(args);
    validateObservationOptions(options);
    const tab = active(), cached = tab.observation;
    if (!cached || cached.snapshotId !== args.snapshotId || cached.generation !== tab.generation) throw agentError("STALE_SNAPSHOT", "页面观察已失效，请重新 observe 后再操作。");
    if (args.action === "fill") {
      const prior = args.target ? findTarget(cached.snapshot, args.target) : cached.snapshot.elements.find(item => item.ref === args.ref);
      await waitForBrowserControlReady(tab.view.webContents, prior, signal);
    }
    const fresh = await readSnapshot(signal, cached.snapshot.selection);
    if (cached.generation !== tab.generation) throw agentError("STALE_SNAPSHOT", "页面已跳转，请重新观察。");
    const supplied = { ...args };
    if (args.target) supplied.ref = findTarget(fresh, args.target).ref;
    const visual = ["hover", "double-click", "drag"].includes(args.action) || (args.action === "click" && args.x !== undefined);
    if (visual && !cached.visual) throw agentError("SCREENSHOT_REQUIRED", "Take a screenshot before coordinate input.");
    if (visual) authorizeVisualIntent(goal, args);
    if (visual && (cached.visual.zoom !== tab.view.webContents.getZoomFactor()
      || cached.snapshot.viewport.width !== fresh.viewport.width || cached.snapshot.viewport.height !== fresh.viewport.height
      || cached.snapshot.viewport.scrollY !== fresh.viewport.scrollY)) throw agentError("STALE_SNAPSHOT", "The viewport changed since capture. Take a new screenshot.");
    const action = visual ? supplied : parseBrowserCommandAction(supplied);
    if (action.action === "done") throw agentError("ACTION_INVALID", "请用 finish 提交结果。");
    if (action.ref) {
      const target = fresh.elements.find(item => item.ref === action.ref);
      const prior = args.target ? target : cached.snapshot.elements.find(item => item.ref === action.ref);
      if (!target || !prior || targetSignature(prior) !== targetSignature(target)
        || (!args.target && prior.domRef && target.previousDomRef !== prior.domRef)) throw agentError("STALE_SNAPSHOT", "目标控件已变化，请重新 observe。");
      if (target.credentialField) { handoff("这一步涉及登录信息，请手动完成后交还 AI。", "NEEDS_LOGIN"); throw failure(record.detail, "NEEDS_LOGIN"); }
      if (visual) throw agentError("ACTION_INVALID", "Visual actions use screenshot coordinates; DOM actions use ref or target.");
    }
    tab.observation = null;
    publish(`外部 Agent 正在执行 ${action.action}`);
    const outcome = visual ? await executeVisualAction(tab.view.webContents, action, fresh, signal)
      : await withPageInput(tab.view.webContents, signal, send => executeBrowserCommandAction({ action, command: goal, snapshot: fresh, signal, webContents: tab.view.webContents,
        validateNavigation: target => validateTarget(target, sandboxSession), sendInputEvents: events => dispatchPageEvents(tab.view.webContents, events, signal, send) }));
    signal.throwIfAborted();
    if (outcome.status === "needs-confirmation") { handoff(outcome.message, "NEEDS_CONFIRMATION"); throw failure(outcome.message, "NEEDS_CONFIRMATION"); }
    record.steps++; metrics.actions++;
    if (args.wait) return { outcome, ...await wait(args.wait, signal, options) };
    return { outcome, observation: await observe(signal, options) };
  };
  const assertAgent = () => {
    if (record.closed) throw failure("沙箱已关闭。", "CLOSED");
    if (record.status === "user") throw failure(record.pauseReason?.message || record.detail, record.pauseReason?.code || "USER_CONTROL");
    if (record.status !== "agent") throw failure("本次连接已结束，请创建新的沙箱。", "REVOKED");
  };
  const request = async (method, args = {}, connectionSignal) => {
    if (method === "status") return state();
    if (method === "diagnostics") return { state: state(), capabilities: BRIZO_AGENT_CAPABILITIES, metrics: { ...metrics } };
    if (method === "close" && record.status === "complete") { destroy(); return { id, status: "closed" }; }
    assertAgent();
    if (method === "handoff") { handoff(String(args.message || "")); return state(); }
    if (record.busy) throw failure("上一个浏览器操作仍在进行，请等待完成。", "BUSY");
    record.busy = true;
    metrics.calls++;
    const started = performance.now();
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
      if (method === "observe") return await timed(observe(signal, args));
      if (method === "wait") return await timed(wait(args, signal, args.observe));
      if (method === "screenshot") {
        if (args.scale !== undefined && !["css", "device"].includes(args.scale)) throw agentError("ARGUMENT_INVALID", "Screenshot scale must be css or device.");
        const observation = await timed(observe(signal, args.observe));
        const contents = active().view.webContents;
        const captured = await timed(contents.capturePage(undefined, { stayHidden: true, stayAwake: true }));
        const capturedSize = captured.getSize();
        const image = args.scale !== "device" && (capturedSize.width !== observation.viewport.width || capturedSize.height !== observation.viewport.height)
          ? captured.resize({ width: observation.viewport.width, height: observation.viewport.height, quality: "good" }) : captured;
        signal.throwIfAborted();
        const current = active();
        if (current.observation?.snapshotId !== observation.snapshotId || current.observation.generation !== current.generation) throw agentError("STALE_SNAPSHOT", "The document changed during capture. Take a new screenshot.");
        current.observation.visual = { zoom: contents.getZoomFactor() };
        const imageSize = image.getSize();
        return { mimeType: "image/png", data: image.toPNG().toString("base64"), observation, snapshotId: observation.snapshotId, viewport: observation.viewport,
          imageSize, imageScale: { x: imageSize.width / observation.viewport.width, y: imageSize.height / observation.viewport.height } };
      }
      if (method === "open") { await timed(addTab(args.url, signal)); return { state: state(), observation: await timed(observe(signal)) }; }
      if (method === "switch") {
        if (!tabs.has(args.tabId)) throw failure("标签不属于当前沙箱。", "TAB_SCOPE");
        record.activeId = args.tabId; invalidate(); layout(); publish(null, true);
        return { state: state(), observation: await timed(observe(signal)) };
      }
      if (method === "close-tab") { removeTab(args.tabId); return state(); }
      if (method === "act") return await timed(act(args, signal, args.observe));
      if (method === "batch") {
        const actions = validateBatch(args);
        const completed = [];
        let snapshotId = args.snapshotId;
        for (let index = 0; index < actions.length; index++) {
          try {
            const result = await timed(act({ ...actions[index], snapshotId }, signal, index === actions.length - 1 ? args.observe : { maxChars: 0, maxElements: 0 }));
            snapshotId = result.observation.snapshotId;
            completed.push({ index, outcome: result.outcome });
            if (index === actions.length - 1) return { completed, observation: result.observation };
          } catch (error) {
            error.details = { completed, failedIndex: index, mayHaveEffects: true };
            if (!signal.aborted && record.status === "agent") error.details.observation = await timed(observe(signal, args.observe)).catch(() => null);
            throw error;
          }
        }
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
      metrics.failures++;
      error.recovery = errorRecovery(error.code);
      if (error.code === "CONDITION_TIMEOUT" && record.status === "agent" && !signal.aborted && !error.details?.observation) {
        error.details = { ...error.details, observation: await observe(signal, args.observe).catch(() => null) };
      }
      if (signal.aborted && record.status === "agent") handoff(error.message, error.code || "BROWSER_PAUSED");
      throw error;
    } finally {
      metrics.elapsedMs += Math.round(performance.now() - started);
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
    let initialObservation;
    try { initialObservation = await observe(undefined, observeOptions); }
    catch (error) { if (record.status !== "user") throw error; }
    return { request, state, control, destroy, initialObservation, capabilities: BRIZO_AGENT_CAPABILITIES };
  } catch (error) { destroy(); throw error; }
}

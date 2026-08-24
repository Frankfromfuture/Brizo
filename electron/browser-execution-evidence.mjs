import { createHmac, randomBytes } from "node:crypto";

import {
  hasNegativeSubmissionConstraint,
  isSubmitLikeBrowserAction,
} from "./browser-action-policy.mjs";
import { evaluateBrowserNavigationUrl } from "./browser-navigation-policy.mjs";

const SEARCH_INTENT_PATTERN = /搜索|检索|查找|search|find/i;
const FILL_INTENT_PATTERN = /填写|填入|输入|选择|勾选|fill|type|select|choose|enter\s+(?:the\s+)?(?:text|value|name|email|address|phone|query)/i;
const NAVIGATE_INTENT_PATTERN = /打开|访问|前往|进入|跳转|导航|open|visit|navigate|go\s+to/i;
const READ_INTENT_PATTERN = /读取|查看|检查|提取|整理|总结|比较|确认.{0,8}(?:内容|信息|数据)|read|inspect|extract|summari[sz]e|compare|review/i;
const SUBMIT_INTENT_PATTERN = /提交|发送|发布|保存|确认(?:订单|购买|支付|付款|提交|发送|发布|授权)|下单|购买|付款|支付|转账|授权|同意|submit|send|publish|post|save|confirm\s+(?:order|purchase|payment|submission|send|publish|authorization)|order|purchase|buy|pay|transfer|authorize|accept/i;
const ACTION_KINDS = new Set([
  "navigate",
  "click",
  "fill",
  "select",
  "press",
  "scroll",
  "back",
  "forward",
  "reload",
  "dismiss-login",
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function safeActionKind(value) {
  const kind = String(value || "").toLowerCase();
  return ACTION_KINDS.has(kind) ? kind : "unknown";
}

function safeTargetRef(value) {
  const ref = String(value || "");
  return /^@e\d+$/i.test(ref) ? ref.toLowerCase() : "";
}

function fieldKind(target) {
  const type = String(target?.type || "").toLowerCase();
  if (target?.sensitive || type === "password") return "secret";
  if (["email", "tel", "search", "url", "number", "date", "time", "checkbox", "radio"].includes(type)) return type;
  if (target?.tag === "select") return "select";
  if (target?.tag === "textarea") return "textarea";
  if (target?.role === "textbox" || target?.tag === "input") return "text";
  if (target?.role === "button" || target?.tag === "button") return "button";
  if (target?.tag === "a") return "link";
  return target ? "control" : "none";
}

export function sanitizeBrowserEvidenceUrl(value) {
  const result = evaluateBrowserNavigationUrl(value);
  if (!result.allowed) return "";
  const parsed = new URL(result.url);
  const path = parsed.pathname === "/" ? "/" : "/[redacted-path]";
  return `${parsed.origin}${path}${parsed.search ? "?[redacted]" : ""}${parsed.hash ? "#[redacted]" : ""}`;
}

function commandProfile(command) {
  const text = String(command || "");
  const noSubmit = hasNegativeSubmissionConstraint(text);
  const fill = FILL_INTENT_PATTERN.test(text);
  const intents = [];
  if (SEARCH_INTENT_PATTERN.test(text) && !(noSubmit && fill)) intents.push("search");
  if (NAVIGATE_INTENT_PATTERN.test(text)) intents.push("navigate");
  if (fill) intents.push("fill");
  if (READ_INTENT_PATTERN.test(text)) intents.push("read");
  if (!noSubmit && SUBMIT_INTENT_PATTERN.test(text)) intents.push("submit");
  if (!intents.length) intents.push("interaction");
  return deepFreeze({ intents: [...new Set(intents)], noSubmit });
}

function normalizeResult(outcome, error) {
  if (error) return "error";
  if (outcome?.status === "needs-confirmation") return "blocked";
  const result = String(outcome?.result || "").toLowerCase();
  if (result === "already-satisfied") return "already-satisfied";
  if (/^[a-z][a-z-]{0,39}$/.test(result)) return result;
  return outcome?.status === "continued" ? "executed" : "unknown";
}

function normalizeErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/元素引用已经失效/.test(message)) return "stale-reference";
  if (/安全策略|不允许导航|高风险端口|用户名或密码/.test(message)) return "navigation-policy";
  if (/abort|取消/i.test(message)) return "aborted";
  if (/timeout|超时|限定时间/i.test(message)) return "timeout";
  if (/当前网页已关闭|destroyed|closed/i.test(message)) return "page-closed";
  if (/观察|snapshot|读取页面/i.test(message)) return "observation-failed";
  return "action-failed";
}

function normalizePostcondition(action, outcome, change, error) {
  if (error || outcome?.status === "needs-confirmation") {
    return deepFreeze({ kind: "execution", verified: false });
  }
  const supplied = outcome?.postcondition;
  if (supplied && typeof supplied === "object") {
    const kind = /^[a-z][a-z-]{0,39}$/.test(String(supplied.kind || ""))
      ? String(supplied.kind)
      : "action-state";
    const reason = /^[a-z][a-z-]{0,63}$/.test(String(supplied.reason || ""))
      ? String(supplied.reason)
      : "";
    return deepFreeze({
      kind,
      verified: supplied.verified === true,
      ...(supplied.verified !== true && reason ? { reason } : {}),
    });
  }
  if (["fill", "navigate", "select"].includes(action)) {
    return deepFreeze({ kind: "missing-deterministic-proof", verified: false });
  }
  const observable = Boolean(change?.urlChanged || change?.contentChanged || change?.scrollChanged || change?.elementDelta);
  return deepFreeze({ kind: "observable-page-change", verified: observable });
}

function actionMatchesIntent(intent, actions) {
  const has = (...kinds) => actions.some((entry) => kinds.includes(entry.action));
  if (intent === "fill") return has("fill", "select");
  if (intent === "navigate") return has("navigate", "click", "back", "forward");
  if (intent === "read") return has("navigate", "click", "scroll", "back", "forward", "reload");
  if (intent === "submit") return actions.some((entry) => entry.submitLike);
  if (intent === "search") {
    if (has("navigate")) return true;
    const filled = actions.findIndex((entry) => entry.action === "fill" && ["search", "text"].includes(entry.target.field));
    return filled >= 0 && actions.slice(filled + 1).some((entry) => entry.submitLike || ["click", "press"].includes(entry.action));
  }
  return actions.some((entry) => entry.action !== "dismiss-login");
}

export function createBrowserExecutionEvidence(command) {
  const profile = commandProfile(command);
  const entries = [];
  const digestKey = randomBytes(32);
  let sequence = 0;
  let liveAction = null;
  let lastObservation = null;

  const digest = (value) => createHmac("sha256", digestKey)
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 16);

  const snapshotState = (snapshot) => {
    const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
    const secretSafeElements = elements.map((element) => [
      element?.tag || "",
      element?.role || "",
      element?.type || "",
      Boolean(element?.disabled),
      element?.sensitive || element?.type === "password" ? "[secret]" : String(element?.value || ""),
    ]);
    return {
      url: sanitizeBrowserEvidenceUrl(snapshot?.url),
      urlDigest: digest(evaluateBrowserNavigationUrl(snapshot?.url).url || ""),
      validUrl: evaluateBrowserNavigationUrl(snapshot?.url).allowed,
      elementCount: elements.length,
      scrollY: Number(snapshot?.viewport?.scrollY) || 0,
      contentDigest: digest(JSON.stringify([
        String(snapshot?.title || ""),
        String(snapshot?.pageText || ""),
        secretSafeElements,
      ])),
    };
  };

  const pageChange = (before, after) => {
    if (!after) {
      return deepFreeze({ verified: false, urlChanged: false, contentChanged: false, elementDelta: 0, scrollChanged: false });
    }
    if (!before) {
      return deepFreeze({ verified: true, initial: true, urlChanged: false, contentChanged: false, elementDelta: 0, scrollChanged: false });
    }
    return deepFreeze({
      verified: true,
      urlChanged: before.urlDigest !== after.urlDigest,
      contentChanged: before.contentDigest !== after.contentDigest,
      elementDelta: after.elementCount - before.elementCount,
      scrollChanged: before.scrollY !== after.scrollY,
    });
  };

  const append = (entry) => {
    const immutable = deepFreeze({ sequence: ++sequence, ...entry });
    entries.push(immutable);
    return immutable;
  };

  const recordObservation = (snapshot) => {
    const state = snapshotState(snapshot);
    append({
      event: "observation",
      url: state.url,
      pageChange: pageChange(lastObservation, state),
    });
    lastObservation = state;
    return state;
  };

  const beginAction = ({ action, snapshot, source = "model", target }) => {
    if (liveAction) throw new Error("已有浏览器动作尚未完成，不能开始下一步。");
    const kind = safeActionKind(action?.action);
    const targetMetadata = deepFreeze({
      ref: safeTargetRef(action?.ref),
      field: fieldKind(target),
    });
    const token = Symbol(`browser-action-${sequence + 1}`);
    liveAction = {
      action: kind,
      before: snapshotState(snapshot),
      input: ["fill", "select"].includes(kind)
        ? targetMetadata.field === "secret" ? "[secret]" : "[redacted]"
        : undefined,
      source: source === "system" ? "system" : "model",
      submitLike: isSubmitLikeBrowserAction(action, target),
      target: targetMetadata,
      token,
    };
    return token;
  };

  const finishAction = (token, { afterSnapshot = null, error = null, outcome = null } = {}) => {
    if (!liveAction || liveAction.token !== token) throw new Error("浏览器动作证据令牌无效或已经完成。");
    const current = liveAction;
    liveAction = null;
    const after = afterSnapshot ? snapshotState(afterSnapshot) : null;
    const result = normalizeResult(outcome, error);
    const change = pageChange(current.before, after);
    return append({
      event: "action",
      url: current.before.url,
      urlAfter: after?.url || current.before.url,
      action: current.action,
      target: current.target,
      ...(current.input ? { input: current.input } : {}),
      source: current.source,
      submitLike: current.submitLike,
      result,
      ...(error ? { error: normalizeErrorCode(error) } : {}),
      postcondition: normalizePostcondition(current.action, outcome, change, error),
      pageChange: change,
    });
  };

  const verification = (finalSnapshot) => {
    const finalUrl = evaluateBrowserNavigationUrl(finalSnapshot?.url).allowed;
    const executedActions = entries.filter((entry) =>
      entry.event === "action"
      && !["blocked", "error", "already-satisfied", "unknown"].includes(entry.result)
    );
    const successfulActions = executedActions.filter((entry) => entry.postcondition?.verified === true);
    const intentChecks = Object.fromEntries(profile.intents.map((intent) => [
      intent,
      actionMatchesIntent(intent, successfulActions),
    ]));
    const actionMatched = Object.values(intentChecks).every(Boolean);
    const negativeSubmitRespected = !profile.noSubmit
      || !executedActions.some((entry) => entry.submitLike);
    const checks = deepFreeze({
      actionMatched,
      finalUrl,
      noLiveAction: !liveAction,
      negativeSubmitRespected,
    });
    const failures = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    return deepFreeze({
      ok: failures.length === 0,
      checks,
      failures,
      intents: profile.intents,
      evidenceCount: entries.length,
    });
  };

  const exportEntries = () => deepFreeze([...entries]);

  return Object.freeze({
    beginAction,
    exportEntries,
    finishAction,
    profile,
    recordObservation,
    verification,
  });
}

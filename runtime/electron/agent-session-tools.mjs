import { setTimeout as delay } from "node:timers/promises";

export const agentError = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });

export function validateObservationOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw agentError("ARGUMENT_INVALID", "Observation options must be an object.");
  if (options.detail !== undefined && !["compact", "full"].includes(options.detail)) throw agentError("ARGUMENT_INVALID", "detail must be compact or full.");
  if (options.format !== undefined && !["json", "text"].includes(options.format)) throw agentError("ARGUMENT_INVALID", "format must be json or text.");
  for (const [key, limit] of [["maxChars", 10000], ["maxElements", 140]]) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 0 || options[key] > limit)) throw agentError("ARGUMENT_INVALID", `${key} must be 0–${limit}.`);
  }
  if (options.filter && (typeof options.filter !== "object" || Array.isArray(options.filter)
    || Object.keys(options.filter).some(key => !["text", "role", "frameRef"].includes(key)))) throw agentError("ARGUMENT_INVALID", "filter supports text, role and frameRef.");
  return options;
}

export function validateAgentAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw agentError("ACTION_INVALID", "Action must be an object.");
  if (!["click", "fill", "select", "press", "scroll", "navigate", "back", "forward", "reload", "hover", "double-click", "drag"].includes(action.action)) throw agentError("ACTION_INVALID", "Unsupported action. Read help act or capabilities.");
  if (["fill", "select"].includes(action.action) && typeof action.value !== "string") throw agentError("ARGUMENT_INVALID", "fill/select value must be a string.");
  if (action.target) {
    const allowed = ["role", "name", "text", "fieldName", "href", "frameRef", "exact"];
    if (typeof action.target !== "object" || Array.isArray(action.target) || !Object.keys(action.target).some(key => key !== "exact")
      || Object.keys(action.target).some(key => !allowed.includes(key))) throw agentError("TARGET_INVALID", "Invalid semantic target.");
  }
  if (action.ref && !/^@e[1-9]\d*$/u.test(action.ref)) throw agentError("TARGET_INVALID", "ref must come from the latest observation.");
  if (["fill", "select", "click"].includes(action.action) && !action.ref && !action.target && action.x === undefined) throw agentError("TARGET_INVALID", "Action needs ref, target or canvas coordinates.");
  if (action.action === "navigate" && typeof action.url !== "string") throw agentError("ARGUMENT_INVALID", "navigate needs a URL.");
  if (action.steps !== undefined && (action.action !== "drag" || !Number.isInteger(action.steps) || action.steps < 1 || action.steps > 60)) throw agentError("ARGUMENT_INVALID", "drag steps must be 1–60.");
  if (action.wait) validateWait(action.wait);
  if (action.observe) validateObservationOptions(action.observe);
  return action;
}

export function errorRecovery(code) {
  if (["STALE_SNAPSHOT", "SNAPSHOT_UNKNOWN", "SCREENSHOT_REQUIRED"].includes(code)) return { retryable: true, next: code === "SCREENSHOT_REQUIRED" ? "screenshot" : "observe", requiresUser: false };
  if (code === "CONDITION_TIMEOUT" || code === "TARGET_NOT_FOUND") return { retryable: true, next: "observe", requiresUser: false };
  if (code === "TARGET_AMBIGUOUS") return { retryable: false, next: "narrow-target", requiresUser: false };
  if (["USER_CONTROL", "NEEDS_LOGIN", "SITE_BLOCKED", "NEEDS_CONFIRMATION", "BROWSER_PAUSED", "TIMEOUT", "DISCONNECTED"].includes(code)) {
    return { retryable: false, next: "status", requiresUser: true };
  }
  return { retryable: false, next: "inspect-error", requiresUser: false };
}

export function semanticRole(element) {
  if (element.role) return element.role;
  return ({ a: "link", button: "button", textarea: "textbox", select: "combobox", canvas: "canvas" })[element.tag]
    || (element.tag === "input" ? ({ checkbox: "checkbox", radio: "radio", button: "button", submit: "button" })[element.type] || "textbox" : element.tag);
}

export function findTarget(snapshot, target, { optional = false } = {}) {
  if (!target || typeof target !== "object" || Array.isArray(target)) throw agentError("TARGET_INVALID", "target must be a role/name, text, fieldName or href object.");
  const allowed = new Set(["role", "name", "text", "fieldName", "href", "frameRef", "exact"]);
  if (Object.keys(target).some(key => !allowed.has(key)) || !Object.keys(target).some(key => key !== "exact")) {
    throw agentError("TARGET_INVALID", "Unknown or empty target. Use capabilities to inspect supported fields.");
  }
  const match = (value, expected) => target.exact === false
    ? String(value || "").toLocaleLowerCase().includes(String(expected).toLocaleLowerCase())
    : String(value || "") === String(expected);
  const matches = snapshot.elements.filter(element => Object.entries(target).every(([key, expected]) => {
    if (key === "exact") return true;
    const value = key === "role" ? semanticRole(element) : key === "text" ? element.name : element[key];
    return match(value, expected);
  }));
  if (!matches.length && optional) return null;
  if (!matches.length) throw agentError("TARGET_NOT_FOUND", "No observed control matches target.");
  if (matches.length !== 1) throw agentError("TARGET_AMBIGUOUS", `${matches.length} observed controls match target. Add name, fieldName or frameRef.`);
  return matches[0];
}

const identity = element => JSON.stringify([element.frameRef, element.tag, semanticRole(element), element.name, element.fieldName, element.href]);
const signature = element => JSON.stringify(Object.fromEntries(Object.entries(element).filter(([key]) => !["ref", "domRef", "previousDomRef", "x", "y"].includes(key))));

function controlText(element) {
  const parts = [element.ref, element.role];
  if (element.name) parts.push(JSON.stringify(element.name));
  for (const key of ["fieldName", "value", "href", "frameRef", "min", "max", "step", "pattern"]) {
    if (element[key] !== undefined && element[key] !== "") parts.push(`${key}=${JSON.stringify(element[key])}`);
  }
  for (const key of ["disabled", "readOnly", "required", "checked", "selected", "multiple", "sensitive", "credentialField"]) if (element[key]) parts.push(key);
  if (element.type && !["button", "text", "select-one"].includes(element.type)) parts.push(`type=${element.type}`);
  for (const key of ["minLength", "maxLength"]) if (element[key] !== undefined && element[key] !== null) parts.push(`${key}=${element[key]}`);
  if (element.sensitive || element.valueLength > String(element.value || "").length) parts.push(`valueLength=${element.valueLength || 0}`);
  if (element.options?.length) parts.push(`options=${JSON.stringify(element.options)}`);
  if (element.validity && !element.validity.valid) parts.push(`validity=${JSON.stringify(element.validity)}`);
  return parts.join(" ");
}

export function presentObservation(snapshot, { tabId, snapshotId, options = {}, previous, cleanUrl = value => value }) {
  validateObservationOptions(options);
  const maxChars = options.maxChars ?? 10000;
  const maxElements = options.maxElements ?? 140;
  if (!Number.isInteger(maxChars) || maxChars < 0 || maxChars > 10000 || !Number.isInteger(maxElements) || maxElements < 0 || maxElements > 140) {
    throw agentError("ARGUMENT_INVALID", "maxChars must be 0–10000 and maxElements 0–140.");
  }
  let elements = snapshot.elements;
  if (options.filter) {
    const filter = options.filter;
    elements = elements.filter(element => (!filter.role || semanticRole(element) === filter.role)
      && (!filter.text || `${element.name || ""} ${element.value || ""}`.toLocaleLowerCase().includes(String(filter.text).toLocaleLowerCase()))
      && (!filter.frameRef || element.frameRef === filter.frameRef));
  }
  let changes;
  if (options.since) {
    if (!previous) throw agentError("SNAPSHOT_UNKNOWN", "The delta base expired. Request a new observation.");
    // A stable identity can occur more than once. Preserve occurrence order.
    const group = list => {
      const result = new Map();
      for (const item of list) { const key = identity(item); result.set(key, [...(result.get(key) || []), item]); }
      return result;
    };
    const before = group(previous.elements);
    const changed = [];
    for (const element of elements) {
      const old = before.get(identity(element))?.shift();
      if (!old || signature(old) !== signature(element)) changed.push(element);
    }
    changes = { base: options.since, removed: [...before.values()].flat().map(({ ref, name }) => ({ ref, name })), textChanged: previous.pageText !== snapshot.pageText };
    elements = changed;
  }
  const totalElements = elements.length;
  elements = elements.slice(0, maxElements).map(({ domRef, previousDomRef, href, x, y, validity, ...element }) => {
    const safe = { ...element, role: semanticRole(element), ...(href ? { href: cleanUrl(href) } : {}) };
    if (options.detail !== "full") {
      for (const [key, value] of Object.entries(safe)) {
        if (value === "" || value === null || value === false || (Array.isArray(value) && !value.length)) delete safe[key];
      }
    } else if (validity) safe.validity = validity;
    return safe;
  });
  const pageText = options.since && !changes.textChanged ? "" : snapshot.pageText.slice(0, maxChars);
  return {
    tabId, snapshotId, title: snapshot.title, url: cleanUrl(snapshot.url), pageText,
    viewport: { ...snapshot.viewport, units: "css-pixels" },
    frames: snapshot.frames?.map(frame => ({ ...frame, url: cleanUrl(frame.url) })),
    ...(options.format === "text" ? { controls: elements.map(controlText).join("\n") } : { elements }),
    ...(changes ? { changes } : {}),
    truncated: { elements: totalElements > elements.length, text: Boolean(maxChars < snapshot.pageText.length && (!changes || changes.textChanged)) },
    counts: { elements: snapshot.elements.length, returned: elements.length },
  };
}

export function validateWait(condition) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)
    || !["text", "url", "target", "stableMs"].some(key => Object.hasOwn(condition, key))) throw agentError("ARGUMENT_INVALID", "wait needs text, url, target or stableMs.");
  const timeoutMs = condition.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 20000) throw agentError("ARGUMENT_INVALID", "timeoutMs must be 0–20000.");
  if (condition.stableMs !== undefined && (!Number.isInteger(condition.stableMs) || condition.stableMs < 50 || condition.stableMs > 5000)) throw agentError("ARGUMENT_INVALID", "stableMs must be 50–5000.");
  if (condition.state && !["visible", "hidden", "enabled", "disabled"].includes(condition.state)) throw agentError("ARGUMENT_INVALID", "Unsupported target wait state.");
  if ((condition.value !== undefined || condition.checked !== undefined || condition.state !== undefined) && !condition.target) throw agentError("ARGUMENT_INVALID", "Control state conditions need a target.");
  if (condition.target) findTarget({ elements: [] }, condition.target, { optional: true });
  return timeoutMs;
}

export function matchesWait(snapshot, condition) {
  if (condition.text !== undefined && !snapshot.pageText.includes(String(condition.text))) return false;
  if (condition.url !== undefined && !snapshot.url.includes(String(condition.url))) return false;
  if (condition.target) {
    const target = findTarget(snapshot, condition.target, { optional: true });
    if (condition.state === "hidden") return !target;
    if (!target || (condition.state === "enabled" && target.disabled) || (condition.state === "disabled" && !target.disabled)) return false;
    if (condition.value !== undefined && target.value !== condition.value) return false;
    if (condition.checked !== undefined && target.checked !== condition.checked) return false;
  }
  return true;
}

export async function waitForObservation(read, condition, signal) {
  const timeoutMs = validateWait(condition);
  const started = performance.now();
  let stableSince = started;
  let lastSignature;
  let polls = 0;
  while (true) {
    signal?.throwIfAborted();
    const snapshot = await read();
    polls++;
    const current = JSON.stringify([snapshot.url, snapshot.pageText, snapshot.elements.map(signature)]);
    if (current !== lastSignature) { lastSignature = current; stableSince = performance.now(); }
    if (matchesWait(snapshot, condition) && (!condition.stableMs || performance.now() - stableSince >= condition.stableMs)) return { snapshot, polls, elapsedMs: Math.round(performance.now() - started) };
    if (performance.now() - started >= timeoutMs) throw agentError("CONDITION_TIMEOUT", "Expected page condition was not observed. No action was retried.", { polls });
    await delay(Math.min(100, Math.max(1, timeoutMs - (performance.now() - started))), undefined, { signal });
  }
}

export function validateBatch(args) {
  if (!Array.isArray(args.actions) || !args.actions.length || args.actions.length > 20) throw agentError("ARGUMENT_INVALID", "batch needs 1–20 actions.");
  if (args.actions.some((action, index) => !action || typeof action !== "object" || (index > 0 && action.ref))) throw agentError("ARGUMENT_INVALID", "Use semantic targets after the first batch action; refs are valid for one observation only.");
  args.actions.forEach(validateAgentAction);
  if (args.observe) validateObservationOptions(args.observe);
  return args.actions;
}

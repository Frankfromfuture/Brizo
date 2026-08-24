import { evaluateBrowserNavigationUrl } from "./browser-navigation-policy.mjs";

const STATEFUL_CONTROL_ACTIONS = new Set(["fill", "select"]);
const OBSERVABLE_CHANGE_ACTIONS = new Set([
  "back",
  "click",
  "dismiss-login",
  "forward",
  "press",
  "scroll",
]);

function refIndex(value) {
  const match = String(value || "").match(/^@e(\d+)$/i);
  return match ? Number(match[1]) - 1 : -1;
}

function cleanSnapshotValue(value, limit = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function stableControlMatch(before, after) {
  if (!before || !after) return false;
  for (const key of ["tag", "type", "fieldName", "frameRef"]) {
    if (before[key] && after[key] && before[key] !== after[key]) return false;
  }
  return before.tag === after.tag || before.type === after.type;
}

function findControlAfterAction(action, beforeSnapshot, afterSnapshot) {
  const index = refIndex(action?.ref);
  const before = index >= 0 ? beforeSnapshot?.elements?.[index] : null;
  const sameIndex = index >= 0 ? afterSnapshot?.elements?.[index] : null;
  if (stableControlMatch(before, sameIndex)) return sameIndex;

  const candidates = (afterSnapshot?.elements || []).filter((candidate) =>
    stableControlMatch(before, candidate)
    && (!before?.fieldName || candidate.fieldName === before.fieldName)
    && (!before?.frameRef || candidate.frameRef === before.frameRef)
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function controlValueMatches(action, beforeSnapshot, afterSnapshot) {
  const control = findControlAfterAction(action, beforeSnapshot, afterSnapshot);
  if (!control) return false;
  const expected = String(action?.value || "");
  if (control.sensitive || control.type === "password") {
    return Boolean(control.hasValue) === (expected.length > 0)
      && Number(control.valueLength) === expected.length;
  }
  if (String(action?.action).toLowerCase() === "select") {
    return String(control.value ?? "") === expected
      || (Array.isArray(control.selectedValues) && control.selectedValues.includes(expected))
      || (Array.isArray(control.options)
        && control.options.some((option) => option?.selected && String(option.value ?? "") === expected));
  }
  return Number(control.valueLength) === expected.length
    && String(control.value ?? "") === cleanSnapshotValue(expected);
}

function safeSnapshotUrl(snapshot) {
  const result = evaluateBrowserNavigationUrl(snapshot?.url);
  return result.allowed ? result.url : "";
}

function elementState(element) {
  return [
    element?.tag || "",
    element?.role || "",
    element?.type || "",
    element?.fieldName || "",
    element?.sensitive ? "[secret]" : String(element?.value ?? ""),
    Boolean(element?.hasValue),
    Number(element?.valueLength) || 0,
    element?.checked,
    element?.selected,
    element?.selectedIndex,
    Array.isArray(element?.selectedValues) ? element.selectedValues : [],
    Boolean(element?.disabled),
    Boolean(element?.readOnly),
    element?.validity?.valid,
  ];
}

function observablePageChange(beforeSnapshot, afterSnapshot) {
  if (!afterSnapshot) return false;
  if (safeSnapshotUrl(beforeSnapshot) !== safeSnapshotUrl(afterSnapshot)) return true;
  if (Number(beforeSnapshot?.viewport?.scrollY) !== Number(afterSnapshot?.viewport?.scrollY)) return true;
  if (String(beforeSnapshot?.title || "") !== String(afterSnapshot?.title || "")) return true;
  if (String(beforeSnapshot?.pageText || "") !== String(afterSnapshot?.pageText || "")) return true;
  const before = (beforeSnapshot?.elements || []).map(elementState);
  const after = (afterSnapshot?.elements || []).map(elementState);
  return JSON.stringify(before) !== JSON.stringify(after);
}

function result(kind, verified, reason) {
  return Object.freeze({
    kind,
    verified: Boolean(verified),
    ...(!verified && reason ? { reason } : {}),
  });
}

/**
 * Verifies only deterministic, locally observable postconditions. Page text is
 * evidence of a state change, never a source of authority or proof that a
 * semantic claim is true.
 */
export function verifyBrowserActionPostcondition({
  action,
  afterSnapshot,
  beforeSnapshot,
  outcome,
}) {
  const kind = String(action?.action || "").toLowerCase();
  const executorVerified = outcome?.postcondition?.verified === true;

  if (STATEFUL_CONTROL_ACTIONS.has(kind)) {
    const snapshotVerified = controlValueMatches(action, beforeSnapshot, afterSnapshot);
    return result("control-state", executorVerified && snapshotVerified,
      executorVerified ? "snapshot-control-state-mismatch" : "executor-control-state-mismatch");
  }
  if (kind === "navigate") {
    const finalUrl = safeSnapshotUrl(afterSnapshot);
    const moved = finalUrl && finalUrl !== safeSnapshotUrl(beforeSnapshot);
    return result("safe-navigation", executorVerified && moved,
      !finalUrl ? "unsafe-final-url" : "navigation-did-not-change-page");
  }
  if (kind === "reload") {
    return result("browser-operation", executorVerified, "reload-not-confirmed");
  }
  if (OBSERVABLE_CHANGE_ACTIONS.has(kind)) {
    return result("observable-page-change", observablePageChange(beforeSnapshot, afterSnapshot),
      "no-observable-page-change");
  }
  return result("unsupported", false, "unsupported-postcondition");
}

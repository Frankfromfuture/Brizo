const URL_PATTERN = /\b(?:https?|file):\/\/[^\s<>"']+/giu;
const SECRET_ASSIGNMENT_PATTERN = /\b(password|passwd|passcode|token|api[_-]?key|authorization|cookie|secret)(\s*[:=]\s*)([^\s,;&]+)/giu;
const AUTHORIZATION_PATTERN = /\bauthorization\s*[:=]\s*(?:(?:bearer|basic)\s+)?[^\s,;]+/giu;
const BEARER_PATTERN = /\bbearer\s+[^\s,;]+/giu;

export function summarizeDiagnosticUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${parsed.origin}${parsed.pathname === "/" ? "/" : "/[path]"}`;
    }
    if (parsed.protocol === "file:") return "file:///[path]";
    return `${parsed.protocol}[redacted]`;
  } catch {
    return "[redacted-url]";
  }
}

export function sanitizeDiagnosticText(value, maxLength = 800) {
  const limit = Number.isSafeInteger(maxLength) && maxLength > 0 ? maxLength : 800;
  return String(value || "")
    .replace(URL_PATTERN, (url) => summarizeDiagnosticUrl(url))
    .replace(AUTHORIZATION_PATTERN, "Authorization: [redacted]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, label, separator) => `${label}${separator}[redacted]`)
    .slice(0, limit);
}

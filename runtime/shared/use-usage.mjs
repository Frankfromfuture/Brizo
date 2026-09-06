const tokenCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const modelName = (value) => typeof value === "string" ? value.replace(/[\r\n\t]/gu, " ").trim().slice(0, 160) : "";

// One collector belongs to one Use run, including retries and final editing.
// Cached input and reasoning tokens are already included in provider totals.
export function createUseUsageTracker() {
  const models = new Set();
  let requests = 0;
  let reportedRequests = 0;
  let inputReported = 0;
  let outputReported = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  return {
    startRequest(requestedModel) {
      requests += 1;
      let settled = false;
      return (body) => {
        if (settled) return;
        settled = true;
        const name = modelName(body?.model) || modelName(requestedModel);
        if (name) models.add(name);
        const usage = body?.usage;
        const input = tokenCount(usage?.prompt_tokens) ?? tokenCount(usage?.input_tokens);
        const output = tokenCount(usage?.completion_tokens) ?? tokenCount(usage?.output_tokens);
        const total = tokenCount(usage?.total_tokens) ?? (input !== null && output !== null ? input + output : null);
        if (input !== null) { inputReported += 1; inputTokens += input; }
        if (output !== null) { outputReported += 1; outputTokens += output; }
        if (total !== null) { reportedRequests += 1; totalTokens += total; }
      };
    },
    snapshot() {
      return {
        models: [...models],
        requests,
        reportedRequests,
        inputTokens: inputReported === requests ? inputTokens : null,
        outputTokens: outputReported === requests ? outputTokens : null,
        totalTokens: reportedRequests || !requests ? totalTokens : null,
        complete: reportedRequests === requests,
      };
    },
  };
}

export function normalizeUseUsage(value) {
  if (!value || typeof value !== "object") return null;
  return {
    models: [...new Set((Array.isArray(value.models) ? value.models : []).map(modelName).filter(Boolean))].slice(0, 10),
    requests: tokenCount(value.requests),
    reportedRequests: tokenCount(value.reportedRequests),
    inputTokens: tokenCount(value.inputTokens),
    outputTokens: tokenCount(value.outputTokens),
    totalTokens: tokenCount(value.totalTokens),
    complete: value.complete === true,
  };
}

export function formatUseUsage(value) {
  const usage = normalizeUseUsage(value);
  if (!usage) return "模型与 token 用量未记录";
  if (usage.requests === 0) return "未调用模型 · 0 token";
  const model = usage.models.length ? usage.models.join("、") : "模型未提供";
  const total = usage.totalTokens;
  const amount = total === null ? "token 用量未提供"
    : usage.complete ? `${total.toLocaleString("en-US")} token`
      : `至少 ${total.toLocaleString("en-US")} token（部分调用未提供用量）`;
  return `${model} · ${amount}`;
}

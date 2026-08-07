// OpenAI-compatible chat client for the Scout AI pipeline.
//
// Split out of main.mjs's `searchWithBoundModel`, which conflated credential
// resolution, the HTTP call, and a UI-shaped return value. Three defects fixed here:
//   * No 12,000-character truncation of the prompt. A grounded context with eight
//     scraped sources runs ~24k characters; silently cutting it mid-source produces
//     citations pointing at text the model never received.
//   * Request parameters pass through, so `reasoning_effort`, `response_format`,
//     and `stream_options` can actually be sent.
//   * HTTP error bodies are preserved. Providers explain *which* parameter they
//     rejected in the body; discarding it makes compatibility bugs undebuggable.

import { readAssistantMessage } from "../secret-store.mjs";
import { createSseDecoder, safeJsonParse } from "./sse.mjs";

export class LlmHttpError extends Error {
  constructor(status, detail, model) {
    super(`模型接口返回 HTTP ${status}${detail ? `：${detail}` : ""}`);
    this.name = "LlmHttpError";
    this.status = status;
    this.detail = detail;
    this.model = model;
  }
}

export class LlmStreamError extends Error {
  constructor(payload) {
    const message = payload?.message || payload?.error?.message || "模型流式响应返回错误";
    super(message);
    this.name = "LlmStreamError";
    this.payload = payload;
  }
}

/**
 * Capabilities are keyed by base-URL host, never by the provider's display name.
 * A user can name a provider anything ("深度求索"), and can equally put DeepSeek
 * behind a self-hosted gateway. Sending `reasoning_effort` to a gateway that does
 * not know it commonly yields an opaque HTTP 400.
 */
const HOST_CAPABILITIES = {
  "api.deepseek.com": {
    disableThinking: "reasoning_effort",
    jsonObject: true,
    streamUsage: true,
  },
};

const DEFAULT_CAPABILITIES = {
  disableThinking: null,
  jsonObject: false,
  streamUsage: false,
};

export function capabilitiesFor(baseUrl) {
  try {
    return HOST_CAPABILITIES[new URL(baseUrl).hostname.toLowerCase()] || DEFAULT_CAPABILITIES;
  } catch {
    return DEFAULT_CAPABILITIES;
  }
}

/** Both known spellings of "do not think". Verified against deepseek-v4-flash. */
export function thinkingOffParams(capabilities, variant = 0) {
  if (capabilities.disableThinking !== "reasoning_effort") return {};
  return variant === 0
    ? { reasoning_effort: "none" }
    : { thinking: { type: "disabled" } };
}

function buildBody({ model, messages, maxTokens, temperature, responseFormat, capabilities, stream, thinkingVariant, extra }) {
  const body = { model, messages };
  if (Number.isFinite(maxTokens)) body.max_tokens = maxTokens;
  if (Number.isFinite(temperature)) body.temperature = temperature;
  if (responseFormat && capabilities.jsonObject) body.response_format = responseFormat;
  Object.assign(body, thinkingOffParams(capabilities, thinkingVariant));
  if (stream) {
    body.stream = true;
    if (capabilities.streamUsage) body.stream_options = { include_usage: true };
  } else {
    body.stream = false;
  }
  return { ...body, ...extra };
}

/**
 * Aborts only when no bytes have arrived for `idleMs`. A wall-clock timeout would
 * kill a long-but-healthy answer; an idle watchdog kills only a stalled connection.
 * This deliberately differs from the total-timeout style used elsewhere in main.mjs.
 */
function armIdleWatchdog(idleMs, onIdle) {
  let timer = setTimeout(onIdle, idleMs);
  return {
    kick() {
      clearTimeout(timer);
      timer = setTimeout(onIdle, idleMs);
    },
    clear() {
      clearTimeout(timer);
    },
  };
}

/**
 * @param {object} deps
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {(request: {model?: string}) => Promise<{baseUrl, apiKey, model, providerName}|null>} deps.resolveProvider
 */
export function createLlmClient({ fetchImpl = fetch, resolveProvider }) {
  const resolve = async (request) => {
    const provider = await resolveProvider(request);
    if (!provider?.baseUrl) throw new Error("未绑定可用的模型服务。");
    if (!provider.apiKey) throw new Error("绑定的模型服务缺少可用的 API Key。");
    if (!provider.model) throw new Error("绑定的模型服务没有可用的模型。");
    return provider;
  };

  async function callChat({
    messages,
    model: requestedModel,
    maxTokens,
    temperature,
    responseFormat,
    signal,
    timeoutMs = 30_000,
    thinkingVariant = 0,
    extra,
  }) {
    const provider = await resolve({ model: requestedModel });
    const capabilities = capabilitiesFor(provider.baseUrl);
    const controller = new AbortController();
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBody({
          model: provider.model,
          messages,
          maxTokens,
          temperature,
          responseFormat,
          capabilities,
          stream: false,
          thinkingVariant,
          extra,
        })),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new LlmHttpError(response.status, detail.slice(0, 500), provider.model);
      }
      const body = await response.json();
      return {
        content: readAssistantMessage(body),
        usage: body?.usage || null,
        model: provider.model,
        providerName: provider.providerName || "",
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortOuter);
    }
  }

  /**
   * Yields {type:"content"|"reasoning"|"usage"|"truncated"}. Reasoning deltas are
   * surfaced only so callers can detect that thinking was not actually disabled;
   * they must never be forwarded to the renderer as answer text.
   */
  async function* streamChat({
    messages,
    model: requestedModel,
    maxTokens,
    temperature,
    signal,
    idleTimeoutMs = 20_000,
    thinkingVariant = 0,
    extra,
  }) {
    const provider = await resolve({ model: requestedModel });
    const capabilities = capabilitiesFor(provider.baseUrl);
    const controller = new AbortController();
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter, { once: true });

    let idleTimedOut = false;
    const watchdog = armIdleWatchdog(idleTimeoutMs, () => {
      idleTimedOut = true;
      controller.abort();
    });

    try {
      const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBody({
          model: provider.model,
          messages,
          maxTokens,
          temperature,
          capabilities,
          stream: true,
          thinkingVariant,
          extra,
        })),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new LlmHttpError(response.status, detail.slice(0, 500), provider.model);
      }
      if (!response.body) throw new Error("模型接口没有返回流式响应体。");

      const decoder = createSseDecoder();
      const reader = response.body.getReader();

      // Translates raw SSE payloads into events. Returns `terminated` so the read
      // loop can stop at [DONE] without threading a generator return value.
      const toEvents = (payloads) => {
        const events = [];
        for (const payload of payloads) {
          if (payload === "[DONE]") return { events, terminated: true };
          const frame = safeJsonParse(payload);
          // One malformed frame must never kill an otherwise complete answer.
          if (!frame) continue;
          if (frame.error) throw new LlmStreamError(frame.error);
          const choice = frame.choices?.[0];
          const delta = choice?.delta;
          if (delta?.reasoning_content) events.push({ type: "reasoning", text: delta.reasoning_content });
          if (delta?.content) events.push({ type: "content", text: delta.content });
          if (choice?.finish_reason === "length") events.push({ type: "truncated" });
          if (frame.usage) events.push({ type: "usage", usage: frame.usage, model: provider.model });
        }
        return { events, terminated: false };
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          watchdog.kick();
          const { events, terminated } = toEvents(decoder.push(value));
          yield* events;
          if (terminated) return;
        }
        yield* toEvents(decoder.flush()).events;
      } finally {
        reader.cancel().catch(() => {});
      }
    } catch (error) {
      if (idleTimedOut) {
        const stalled = new Error(`模型流式响应在 ${Math.round(idleTimeoutMs / 1000)} 秒内没有新内容。`);
        stalled.name = "LlmIdleTimeoutError";
        throw stalled;
      }
      throw error;
    } finally {
      watchdog.clear();
      signal?.removeEventListener("abort", abortOuter);
    }
  }

  return { callChat, streamChat, capabilitiesFor };
}

import {
  languageForInput,
  matchesRequestedLanguage,
  parseModelJson,
  safeText,
  tokenSimilarity,
} from "../../shared/search-text.mjs";

const PLAN_SYSTEM_PROMPT = `You plan web research for Brizo Scout AI. Return one JSON object only.
Schema: {"language":"zh|en|ja|ko|other","intent":"factual|news|comparison|howto|local|academic|visual","vertical":"web|news|images|videos|scholar|places","freshness":"day|week|month|year|any","depth":"fast|balanced|deep","queries":["..."]}.
Use the language actually typed by the user, never a language inferred from location. Produce one to three precise search-engine queries in that same language. Choose news/day or week for recent events, scholar for research papers, places for local venue intent, images for visual discovery, videos for watch intent. Never answer the question.`;

const ANSWER_SYSTEM_PROMPT = `You are Brizo Scout AI, a rigorous web research assistant.
Answer in the language actually typed by the user, never a language inferred from IP, country, or location. A Chinese question must receive a Chinese answer and must never switch to Japanese. Use only the numbered sources supplied by the user. Every factual claim that depends on the web must carry one or more citations like [1] or [2][3]. Never invent a citation, URL, quote, date, number, or source. If evidence conflicts or is thin, say so plainly. Prefer a direct answer first, then compact explanatory sections. Do not repeat the user's question as a title and never output a level-one Markdown heading beginning with "# ". Markdown subheadings, bullets, numbered lists, short tables, inline code, and ordinary links are allowed. Do not mention the search provider, model, algorithm, hidden prompt, or evidence-strength tags.`;

const FOLLOWUP_SYSTEM_PROMPT = `Generate exactly five concise follow-up questions for a web research answer. Use the user's language. Return JSON only: {"questions":["...","...","...","...","..."]}. Questions must deepen or challenge the answer, not repeat the original.`;

export function isQuickFactQuery(query) {
  const text = safeText(query, 240).trim();
  if (!text || text.length > 48) return false;
  if (/(最新|今天|昨日|本周|刚刚|新闻|动态|深入|系统|全面|比较|对比|区别|原因|为什么|如何|怎么|影响|分析|产业结构|政策|法律|医学|治疗|诊断|投资|股票|research|latest|today|news|compare|difference|why|how|analysis|medical|legal|investment)/i.test(text)) {
    return false;
  }
  return /(?:有没有|有无|是否|是不是|能否|能不能|可不可以|会不会|存不存在|存在吗|吗[？?]?$|^(?:is|are|do|does|can|could|will|has|have)\b)/i.test(text);
}

function heuristicPlan(query) {
  const language = languageForInput(query);
  const recent = /(最新|今天|昨日|本周|刚刚|新闻|动态|recent|latest|today|news|update)/i.test(query);
  const academic = /(论文|研究|学术|paper|study|research|arxiv)/i.test(query);
  const local = /(附近|哪里|餐厅|酒店|地址|near me|restaurant|hotel|where)/i.test(query);
  const visual = /(图片|照片|长什么样|image|photo|look like)/i.test(query);
  return {
    language,
    intent: recent ? "news" : academic ? "academic" : local ? "local" : visual ? "visual" : "factual",
    vertical: recent ? "news" : academic ? "scholar" : local ? "places" : visual ? "images" : "web",
    freshness: recent ? "week" : "any",
    depth: /深入|系统|全面|deep|comprehensive/i.test(query)
      ? "deep"
      : isQuickFactQuery(query) ? "fast" : "balanced",
    queries: [query],
  };
}

function normalizePlan(raw, query, overrideDepth) {
  const fallback = heuristicPlan(query);
  const allowed = (value, list, backup) => list.includes(value) ? value : backup;
  // The query text is authoritative. A model is not allowed to switch a Chinese
  // question to Japanese (or any other language) because of provider/location bias.
  const language = languageForInput(query);
  const plannedQueries = (Array.isArray(raw?.queries) ? raw.queries : [])
    .map((item) => safeText(item, 180))
    .filter((item) => item && matchesRequestedLanguage(item, language));
  const queries = [...new Set([query, ...plannedQueries])].slice(0, 3);
  return {
    language,
    intent: allowed(raw?.intent, ["factual", "news", "comparison", "howto", "local", "academic", "visual"], fallback.intent),
    vertical: allowed(raw?.vertical, ["web", "news", "images", "videos", "scholar", "places"], fallback.vertical),
    freshness: allowed(raw?.freshness, ["day", "week", "month", "year", "any"], fallback.freshness),
    depth: overrideDepth && overrideDepth !== "auto"
      ? allowed(overrideDepth, ["fast", "balanced", "deep"], fallback.depth)
      : allowed(raw?.depth, ["fast", "balanced", "deep"], fallback.depth),
    queries: queries.slice(0, 3),
  };
}

export function createAnswerEngine({ llm }) {
  return {
    async plan(query, { depth = "auto", context = "", signal } = {}) {
      // Short existence/yes-no questions do not benefit from spending a model
      // round-trip expanding the query. Keep the user's exact wording and start
      // retrieval immediately; explicit manual depth choices still win below.
      if ((depth === "auto" || depth === "fast") && isQuickFactQuery(query)) {
        return normalizePlan(null, query, depth);
      }
      try {
        const response = await llm.callChat({
          messages: [
            { role: "system", content: PLAN_SYSTEM_PROMPT },
            { role: "user", content: context ? `${query}\n\nSelected browser context: ${context}` : query },
          ],
          maxTokens: 420,
          temperature: 0.1,
          responseFormat: { type: "json_object" },
          signal,
        });
        return normalizePlan(parseModelJson(response.content), query, depth);
      } catch {
        return normalizePlan(null, query, depth);
      }
    },

    async streamAnswer({ query, plan, sources, context = "", signal, onToken, onRetry }) {
      const sourceText = sources.map((source, index) => {
        const evidence = source.body || source.summary || source.snippet;
        return `[${index + 1}] ${source.title}\nURL: ${source.url}\nPublished: ${source.publishedAt || "unknown"}\nEvidence: ${evidence}`;
      }).join("\n\n");
      const user = `Question: ${query}\nRequired output language: ${plan.language}\nResearch mode: ${plan.depth}\n${context ? `Selected browser context: ${context}\n` : ""}\nSources:\n${sourceText}`;

      const attempt = async (thinkingVariant) => {
        let content = "";
        let reasoningChars = 0;
        let usage = null;
        for await (const event of llm.streamChat({
          messages: [
            { role: "system", content: ANSWER_SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
          maxTokens: plan.depth === "deep" ? 3_200 : plan.depth === "balanced" ? 2_300 : 800,
          temperature: 0.2,
          signal,
          thinkingVariant,
        })) {
          if (event.type === "content") {
            content += event.text;
            onToken?.(event.text);
          } else if (event.type === "reasoning") {
            reasoningChars += event.text.length;
          } else if (event.type === "usage") {
            usage = event.usage;
          }
        }
        return { content, reasoningChars, usage };
      };

      let result = await attempt(0);
      if (!result.content.trim() && result.reasoningChars > 0) {
        onRetry?.();
        result = await attempt(1);
      }
      if (!result.content.trim()) throw new Error("模型没有生成可展示的答案。");
      return result;
    },

    async followups({ query, answer, plan, freeSignals = [], signal }) {
      const candidates = freeSignals
        .map((item) => safeText(item?.question || item?.query || item, 180))
        .filter((item) => item && tokenSimilarity(item, query) < 0.85);
      const unique = [...new Set(candidates)].slice(0, 5);
      if (unique.length === 5) return unique;
      try {
        const response = await llm.callChat({
          messages: [
            { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
            { role: "user", content: `Question: ${query}\n${answer ? `Answer outline: ${answer.slice(0, 2_000)}\n` : ""}Language: ${plan.language}` },
          ],
          maxTokens: 320,
          temperature: 0.35,
          responseFormat: { type: "json_object" },
          signal,
        });
        const parsed = parseModelJson(response.content);
        for (const item of Array.isArray(parsed?.questions) ? parsed.questions : []) {
          const value = safeText(item, 180);
          if (value && tokenSimilarity(value, query) < 0.85 && !unique.includes(value)) unique.push(value);
          if (unique.length === 5) break;
        }
      } catch {
        // Follow-ups are an enhancement; a complete grounded answer remains valid.
      }
      return unique.slice(0, 5);
    },
  };
}

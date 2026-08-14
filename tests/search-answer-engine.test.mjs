import assert from "node:assert/strict";
import test from "node:test";

import {
  createAnswerEngine,
  fallbackFollowups,
  isDistinctFollowup,
  isQuickFactQuery,
} from "../electron/search/answer-engine.mjs";

test("short existence and yes-no questions use the quick factual route", () => {
  assert.equal(isQuickFactQuery("有没有英短三花猫"), true);
  assert.equal(isQuickFactQuery("英短有三花吗？"), true);
  assert.equal(isQuickFactQuery("Are there calico British Shorthair cats?"), true);
  assert.equal(isQuickFactQuery("为什么三花猫绝大多数是母猫？"), false);
  assert.equal(isQuickFactQuery("深圳市的产业结构是什么"), false);
});

test("the quick factual route skips model planning and preserves one exact query", async () => {
  let planningCalls = 0;
  const engine = createAnswerEngine({
    llm: {
      async callChat() {
        planningCalls += 1;
        throw new Error("quick routing should not call the planner");
      },
    },
  });

  const plan = await engine.plan("有没有英短三花猫", { depth: "auto" });
  assert.equal(planningCalls, 0);
  assert.equal(plan.depth, "fast");
  assert.deepEqual(plan.queries, ["有没有英短三花猫"]);
  assert.equal(plan.language, "zh");

  const explicitlyFastPlan = await engine.plan("有没有英短三花猫", { depth: "fast" });
  assert.equal(planningCalls, 0);
  assert.equal(explicitlyFastPlan.depth, "fast");
  assert.deepEqual(explicitlyFastPlan.queries, ["有没有英短三花猫"]);
});

test("entity follow-ups may repeat a short subject without being discarded as duplicates", () => {
  assert.equal(isDistinctFollowup("联影的核心产品是什么？", "联影"), true);
  assert.equal(isDistinctFollowup("赫尔墨斯有哪些著名神话故事？", "赫尔墨斯"), true);
  assert.equal(isDistinctFollowup("联影？", "联影"), false);
});

test("model follow-ups containing a short entity are preserved", async () => {
  const questions = [
    "联影的核心产品是什么？",
    "联影的主要竞争对手有哪些？",
    "联影的国际化进展如何？",
    "联影面临哪些行业风险？",
    "联影未来有哪些增长驱动因素？",
  ];
  const engine = createAnswerEngine({
    llm: {
      async callChat() {
        return { content: JSON.stringify({ questions }) };
      },
    },
  });
  const output = await engine.followups({
    query: "联影",
    answer: "联影是一家医疗设备企业。",
    plan: { language: "zh" },
  });
  assert.deepEqual(output, questions);
});

test("keywords and full questions still receive exactly five follow-ups when the model fails", async () => {
  const engine = createAnswerEngine({
    llm: {
      async callChat() {
        throw new Error("provider unavailable");
      },
    },
  });
  const keywordOutput = await engine.followups({
    query: "联影",
    answer: "",
    plan: { language: "zh" },
  });
  const sentenceOutput = await engine.followups({
    query: "为什么大型医疗设备国产化越来越重要？",
    answer: "",
    plan: { language: "zh" },
  });
  assert.equal(keywordOutput.length, 5);
  assert.equal(sentenceOutput.length, 5);
  assert.ok(keywordOutput.every((question) => question.includes("联影")));
  assert.deepEqual(sentenceOutput, fallbackFollowups("为什么大型医疗设备国产化越来越重要？", "zh"));
});

test("visual entity planning covers a keyword and one concrete sentence answer", async () => {
  const fallbackEngine = createAnswerEngine({
    llm: { async callChat() { throw new Error("planner unavailable"); } },
  });
  const keywordPlan = await fallbackEngine.plan("联影");
  assert.equal(keywordPlan.visualEntity.name, "联影");
  assert.ok(keywordPlan.visualEntity.confidence >= 0.72);

  const plannedEngine = createAnswerEngine({
    llm: {
      async callChat() {
        return {
          content: JSON.stringify({
            language: "zh",
            intent: "factual",
            vertical: "web",
            freshness: "any",
            depth: "fast",
            queries: ["世界最高峰"],
            visualEntity: { name: "珠穆朗玛峰", kind: "place", confidence: 0.96 },
          }),
        };
      },
    },
  });
  const sentencePlan = await plannedEngine.plan("世界最高峰是什么？");
  assert.deepEqual(sentencePlan.visualEntity, { name: "珠穆朗玛峰", kind: "place", confidence: 0.96 });
});

test("fallback planning recognizes a person query for portrait images", async () => {
  const engine = createAnswerEngine({
    llm: { async callChat() { throw new Error("planner unavailable"); } },
  });
  const plan = await engine.plan("马斯克是谁");
  assert.deepEqual(plan.visualEntity, { name: "马斯克", kind: "person", confidence: 0.78 });
});

test("an explicit abstract-topic plan stays text-only even when the query is short", async () => {
  const engine = createAnswerEngine({
    llm: {
      async callChat() {
        return {
          content: JSON.stringify({
            language: "zh",
            intent: "factual",
            vertical: "web",
            freshness: "any",
            depth: "fast",
            queries: ["人工智能"],
            visualEntity: { name: "", kind: "none", confidence: 0.98 },
          }),
        };
      },
    },
  });
  const plan = await engine.plan("人工智能");
  assert.deepEqual(plan.visualEntity, { name: "", kind: "none", confidence: 0 });
});

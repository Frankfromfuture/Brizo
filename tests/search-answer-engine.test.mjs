import assert from "node:assert/strict";
import test from "node:test";

import { createAnswerEngine, isQuickFactQuery } from "../electron/search/answer-engine.mjs";

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

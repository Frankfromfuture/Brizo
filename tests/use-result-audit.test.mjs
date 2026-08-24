import assert from "node:assert/strict";
import test from "node:test";
import { auditUseResultMarkdown } from "../electron/use-result-audit.mjs";

const intro = "信息来源于：example.com。";
const valid = `${intro}

## 执行结论
最低价为 ¥299。

## 相关数据
| 项目 | 价格 |
|---|---:|
| A | ¥299 |

## 最佳建议
选择 A，因为页面显示它价格最低。

## 注意事项
库存仍需确认。`;

test("accepts the required citation-free structure when material numbers exist in evidence", () => {
  const audit = auditUseResultMarkdown(valid, {
    evidence: "页面卡片 A 当前价格 ￥299",
    sourceIntro: intro,
  });
  assert.equal(audit.ok, true);
});

test("rejects fabricated numbers, URLs, citation tags, and repeated source intros", () => {
  const fabricated = valid
    .replaceAll("299", "399")
    .replace("库存仍需确认。", `详情 https://example.com [1]\n\n${intro}`);
  const audit = auditUseResultMarkdown(fabricated, {
    evidence: "页面卡片 A 当前价格 ￥299",
    sourceIntro: intro,
  });
  assert.equal(audit.ok, false);
  assert.deepEqual(new Set(audit.failures), new Set([
    "source_intro_count",
    "unsupported_number",
    "visible_citation",
    "visible_url",
  ]));
});

test("rejects an answer that omits the deterministic result sections", () => {
  const audit = auditUseResultMarkdown(`${intro}\n\n只有一行结论。`, {
    evidence: "只有一行结论。",
    sourceIntro: intro,
  });
  assert.equal(audit.ok, false);
  assert.ok(audit.failures.includes("required_section"));
});

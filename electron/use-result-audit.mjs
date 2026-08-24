const REQUIRED_SECTIONS = [
  /(?:^|\n)#{1,3}\s*(?:执行|简短)?结论\s*(?:\n|$)/u,
  /(?:^|\n)#{1,3}\s*(?:完整)?(?:相关)?数据(?:表格)?\s*(?:\n|$)/u,
  /(?:^|\n)#{1,3}\s*最佳建议(?:及理由)?\s*(?:\n|$)/u,
  /(?:^|\n)#{1,3}\s*注意事项\s*(?:\n|$)/u,
];
const MATERIAL_NUMBER_PATTERN = /(?:[¥￥$€£]\s*\d[\d,.]*|\d[\d,.]*(?:\s*[%％])|(?:19|20)\d{2}(?:[-/.年]\d{1,2})?(?:[-/.月]\d{1,2})?|\d{1,2}:\d{2}|\d{2,}(?:\.\d+)?)/gu;

function normalizedEvidence(value) {
  return String(value || "")
    .replaceAll(",", "")
    .replaceAll("％", "%")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase();
}

function normalizeNumber(value) {
  return normalizedEvidence(value).replace(/^[¥￥$€£]/u, "");
}

export function auditUseResultMarkdown(markdown, {
  evidence = "",
  sourceIntro = "",
} = {}) {
  const text = String(markdown || "").trim();
  const failures = [];
  if (!text || !sourceIntro || !text.startsWith(sourceIntro)) failures.push("source_intro");
  if (sourceIntro && text.split(sourceIntro).length !== 2) failures.push("source_intro_count");
  for (const pattern of REQUIRED_SECTIONS) {
    if (!pattern.test(text)) failures.push("required_section");
  }
  const body = text.slice(sourceIntro.length);
  if (/https?:\/\//iu.test(body) || /\[[^\]]+\]\(https?:\/\//iu.test(body)) failures.push("visible_url");
  if (/\[\d+\]|\b(?:sources?|references?|footnotes?)\b\s*[:：]/iu.test(body)) failures.push("visible_citation");

  const haystack = normalizedEvidence(evidence);
  const unsupportedNumbers = [...body.matchAll(MATERIAL_NUMBER_PATTERN)]
    .map((match) => normalizeNumber(match[0]))
    .filter((number) => number && !haystack.includes(number));
  if (unsupportedNumbers.length) failures.push("unsupported_number");

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    unsupportedNumberCount: unsupportedNumbers.length,
  };
}

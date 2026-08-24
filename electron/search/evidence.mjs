import { safeText, tokenize } from "../../shared/search-text.mjs";

const CITATION_PATTERN = /\[(\d+)\]/g;
const NUMBER_PATTERN = /(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*[%％])?/g;
const NON_CLAIM_PATTERN = /^(?:来源|参考|注|说明|提示|结论|总结|注意事项?|建议|下一步|sources?|references?|note|summary|conclusion)\s*[:：]?$/iu;
const UNCERTAINTY_PATTERN = /(?:无法(?:确认|判断|核实)|证据不足|尚无(?:足够)?证据|信息不足|未找到|不确定|cannot\s+(?:confirm|verify|determine)|insufficient\s+evidence|unclear)/iu;

function normalizeNumber(value) {
  return String(value || "")
    .replace(/,/g, "")
    .replace(/％/g, "%")
    .replace(/\s+/g, "");
}

function cleanMarkdownLine(value) {
  return String(value || "")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]\s+|\d+[.)]\s+)/u, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
}

function splitClaims(answer) {
  const claims = [];
  let inCodeFence = false;
  for (const rawLine of String(answer || "").split(/\n+/u)) {
    if (/^\s*```/u.test(rawLine)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || /^\s*\|?\s*:?-{3,}/u.test(rawLine)) continue;
    const line = cleanMarkdownLine(rawLine);
    if (!line || NON_CLAIM_PATTERN.test(line)) continue;
    const parts = line.split(/(?<=[。！？!?；;])\s*|(?<=[.!?])\s+(?=[A-Z\d])/u);
    for (const part of parts) {
      const text = part.trim();
      const plain = text.replace(CITATION_PATTERN, "").trim();
      if (plain.length < 4 || /^[^\p{L}\p{N}]+$/u.test(plain)) continue;
      if (/^[^|]{0,80}\|/u.test(text)) {
        for (const cell of text.split("|").map((item) => item.trim()).filter(Boolean)) {
          if (cell.length >= 4) claims.push(cell);
        }
      } else {
        claims.push(text);
      }
    }
  }
  return claims;
}

function citationIndexes(text, sourceCount) {
  const valid = [];
  const invalid = [];
  for (const match of String(text || "").matchAll(CITATION_PATTERN)) {
    const index = Number(match[1]) - 1;
    if (Number.isInteger(index) && index >= 0 && index < sourceCount) valid.push(index);
    else invalid.push(Number(match[1]));
  }
  return { valid: [...new Set(valid)], invalid };
}

function sourceEvidence(source) {
  return [source?.body, source?.summary, source?.snippet, source?.title]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase();
}

function claimLooksFactual(text) {
  const plain = String(text || "").replace(CITATION_PATTERN, "").trim();
  if (!plain || /[?？]\s*$/u.test(plain) || UNCERTAINTY_PATTERN.test(plain)) return false;
  return /[\p{L}\p{N}]/u.test(plain);
}

/**
 * Deterministic structural citation audit. This intentionally does not claim
 * semantic entailment; it proves citation coverage and catches unsupported
 * numbers/dates before a result is labelled grounded.
 */
export function auditAnswerCitations(answer, sources = []) {
  const sourceList = Array.isArray(sources) ? sources : [];
  let invalidCitationCount = 0;
  const cleanedAnswer = String(answer || "").replace(CITATION_PATTERN, (match, raw) => {
    const index = Number(raw) - 1;
    if (Number.isInteger(index) && index >= 0 && index < sourceList.length) return match;
    invalidCitationCount += 1;
    return "";
  });

  const claims = splitClaims(cleanedAnswer)
    .filter(claimLooksFactual)
    .map((text) => {
      const citations = citationIndexes(text, sourceList.length);
      const claimWithoutCitations = text.replace(CITATION_PATTERN, "");
      const numbers = [...claimWithoutCitations.matchAll(NUMBER_PATTERN)].map((match) => normalizeNumber(match[0]));
      const evidence = citations.valid.map((index) => sourceEvidence(sourceList[index])).join("\n");
      const unsupportedNumbers = numbers.filter((number) => !evidence.replace(/,/g, "").replace(/％/g, "%").includes(number));
      return {
        text: safeText(claimWithoutCitations, 500),
        citations: citations.valid.map((index) => index + 1),
        hasCitation: citations.valid.length > 0,
        numbers,
        unsupportedNumbers,
        structurallySupported: citations.valid.length > 0 && unsupportedNumbers.length === 0,
      };
    });

  const citedClaims = claims.filter((claim) => claim.hasCitation);
  const supportedClaims = claims.filter((claim) => claim.structurallySupported);
  const numericClaims = claims.filter((claim) => claim.numbers.length > 0);
  const unsupportedNumericClaims = numericClaims.filter((claim) => claim.unsupportedNumbers.length > 0);
  const coverage = claims.length ? supportedClaims.length / claims.length : 0;
  const precision = citedClaims.length
    ? citedClaims.filter((claim) => claim.structurallySupported).length / citedClaims.length
    : 0;
  const grounded = claims.length > 0
    && supportedClaims.length > 0
    && coverage >= 0.8
    && unsupportedNumericClaims.length === 0
    && invalidCitationCount === 0;

  return {
    answer: cleanedAnswer,
    grounded,
    verificationLevel: "structural",
    coverage,
    precision,
    claimCount: claims.length,
    citedClaimCount: citedClaims.length,
    invalidCitationCount,
    unsupportedNumericClaimCount: unsupportedNumericClaims.length,
    claims,
  };
}

function passageScore(text, queryTokens, index) {
  const passageTokens = new Set(tokenize(text));
  let overlap = 0;
  for (const token of queryTokens) if (passageTokens.has(token)) overlap += 1;
  const coverage = queryTokens.length ? overlap / queryTokens.length : 0;
  const density = passageTokens.size ? overlap / passageTokens.size : 0;
  const numberBonus = /\d/u.test(text) ? 0.08 : 0;
  const headingBonus = /^#{1,6}\s/u.test(text) ? 0.05 : 0;
  const positionBonus = Math.max(0, 0.08 - index * 0.002);
  return coverage * 0.68 + density * 0.2 + numberBonus + headingBonus + positionBonus;
}

function sourcePassages(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const blocks = text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  const output = [];
  for (const block of blocks) {
    if (block.length <= 1_800) {
      output.push(block);
      continue;
    }
    const sentences = block.split(/(?<=[。！？.!?])\s+/u);
    let chunk = "";
    for (const sentence of sentences) {
      if (chunk && chunk.length + sentence.length > 1_600) {
        output.push(chunk.trim());
        chunk = "";
      }
      chunk += `${chunk ? " " : ""}${sentence}`;
    }
    if (chunk.trim()) output.push(chunk.trim());
  }
  return output;
}

/** Select compact, query-relevant evidence instead of blindly truncating page heads. */
export function selectRelevantPassages(value, query, {
  maxPassages = 8,
  maxChars = 12_000,
} = {}) {
  const passages = sourcePassages(value);
  if (!passages.length) return "";
  const queryTokens = tokenize(query);
  const ranked = passages
    .map((text, index) => ({ text, index, score: passageScore(text, queryTokens, index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = [];
  let size = 0;
  for (const passage of ranked) {
    if (selected.length >= maxPassages) break;
    const remaining = maxChars - size;
    if (remaining <= 0) break;
    const text = passage.text.slice(0, remaining);
    if (!text) continue;
    selected.push({ ...passage, text });
    size += text.length;
  }
  return selected
    .sort((left, right) => left.index - right.index)
    .map((passage) => passage.text)
    .join("\n\n")
    .trim();
}

export function stripTrailingLinkPunctuation(input) {
  const value = String(input ?? "").trim();
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) return value;
  return value
    .replace(/[，。；、）》】」』,;)>\]}]+$/u, "")
    .replace(/(?:(?:%EF%BC%8C)|(?:%E3%80%82)|(?:%EF%BC%9B)|(?:%E3%80%81))+$/gi, "");
}

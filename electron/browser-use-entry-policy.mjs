import { assertBrowserNavigationUrl } from "./browser-navigation-policy.mjs";

// A model-authored navigate action is not a page interaction. Keep it limited
// to an origin's public root so a fresh Use partition never cold-loads a
// synthesized product, search-result, booking, checkout, or other business URL.
// Browser-driven clicks, form submissions, and redirects remain untouched.
export function useOriginEntryUrl(value) {
  const requestedUrl = assertBrowserNavigationUrl(value);
  const parsed = new URL(requestedUrl);
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

export function normalizeUsePlannerNavigation(value) {
  const requestedUrl = assertBrowserNavigationUrl(value);
  const url = useOriginEntryUrl(requestedUrl);
  return {
    requestedUrl,
    rewritten: requestedUrl !== url,
    url,
  };
}

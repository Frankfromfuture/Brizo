const WHALEGUARD_PATTERN = /(?:\bwhale\s*guard\b|\bwhaleguard\b)/iu;
const SECURITY_TITLE_PATTERN = /(?:访问被拒绝|访问受限|安全验证|人机验证|请求被拦截|access\s+denied|request\s+blocked|security\s+check|captcha)/iu;
const SECURITY_BODY_PATTERN = /(?:请.{0,12}(?:完成|通过).{0,8}验证|访问.{0,8}(?:过于频繁|异常|受限)|请求.{0,8}(?:异常|被拦截|已阻止)|拖动.{0,8}滑块|验证码|access\s+denied|request\s+blocked|verify\s+(?:that\s+)?you\s+are\s+human)/iu;
const CTRIP_SECURITY_BODY_PATTERN = /(?:携程提醒.{0,80}(?:block|拦截|验证)|请.{0,12}完成.{0,8}安全验证|检测到.{0,12}异常访问|访问.{0,8}过于频繁|请求.{0,8}(?:被拦截|已阻止))/iu;

function hostnameFor(value) {
  try {
    return new URL(String(value || "")).hostname.toLocaleLowerCase();
  } catch {
    return "";
  }
}

function isCtripHostname(hostname) {
  return hostname === "ctrip.com" || hostname.endsWith(".ctrip.com");
}

export function detectBrowserSecurityBlock(snapshot = {}) {
  const title = String(snapshot?.title || "").replace(/\s+/gu, " ").trim().slice(0, 500);
  const pageText = String(snapshot?.pageText || "").replace(/\s+/gu, " ").trim().slice(0, 12_000);
  const url = String(snapshot?.url || "").trim().slice(0, 2_000);
  const hostname = hostnameFor(url);
  const ctripHostname = isCtripHostname(hostname);
  const visibleText = `${title}\n${pageText}`;
  const frameText = (Array.isArray(snapshot?.frames) ? snapshot.frames : [])
    .slice(0, 24)
    .map((frame) => `${String(frame?.name || "").slice(0, 240)} ${String(frame?.url || "").slice(0, 1_000)}`)
    .join("\n");
  const whaleGuard = WHALEGUARD_PATTERN.test(title)
    || (ctripHostname && WHALEGUARD_PATTERN.test(`${pageText}\n${frameText}\n${url}`));
  const explicitSecurityChallenge = SECURITY_TITLE_PATTERN.test(title)
    && SECURITY_BODY_PATTERN.test(pageText);
  const ctripSecurityChallenge = ctripHostname
    && pageText.length <= 6_000
    && CTRIP_SECURITY_BODY_PATTERN.test(pageText);
  if (!whaleGuard && !explicitSecurityChallenge && !ctripSecurityChallenge) return null;

  if (whaleGuard && ctripHostname) {
    return {
      code: "ctrip-whaleguard",
      message: "携程 WhaleGuard 已拦截本次自动访问。Brizo 已立即停止后续动作，未尝试刷新、绕过或处理网站验证；当前页面已保留，请手动完成验证或稍后重试，再重新发起 Use。",
      progress: "检测到携程 WhaleGuard 拦截，已停止后续动作",
      site: "携程",
    };
  }

  if (ctripSecurityChallenge) {
    return {
      code: "ctrip-security-challenge",
      message: "携程触发了安全验证或访问拦截。Brizo 已立即停止后续动作，未尝试刷新、隐藏或绕过验证；当前页面已保留，请手动处理或稍后重试，再重新发起 Use。",
      progress: "检测到携程网站安全验证，已停止后续动作",
      site: "携程",
    };
  }

  return {
    code: whaleGuard ? "whaleguard" : "site-security-challenge",
    message: "目标网站触发了安全验证或访问拦截。Brizo 已立即停止后续动作，未尝试刷新或绕过验证；当前页面已保留，请手动处理或稍后重试。",
    progress: "检测到网站安全验证，已停止后续动作",
    site: hostname || "目标网站",
  };
}

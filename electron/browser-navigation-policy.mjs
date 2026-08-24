import { isIP } from "node:net";

// This is intentionally a deterministic, side-effect-free policy module. The
// same host/address checks can be reused by navigation event guards and by a
// DNS resolver without teaching either layer a second definition of "local".
const UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
  79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
  135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526,
  530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6697,
  10080,
  ...Array.from({ length: 5 }, (_, index) => 6665 + index),
]);

const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "100.100.100.200",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "metadata.azure.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const LOCAL_NAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".lan",
  ".internal",
  ".home.arpa",
];

const POLICY_MESSAGES = {
  credentials: "地址中不能包含用户名或密码。",
  host: "地址缺少有效主机名。",
  invalid: "请输入有效的 http 或 https 地址。",
  local: "不允许导航到本机、局域网、链路本地或云元数据地址。",
  port: "目标地址使用了浏览器禁止的高风险端口。",
  protocol: "只能导航到 http 或 https 地址。",
};

export class BrowserNavigationPolicyError extends Error {
  constructor(code, details = {}) {
    super(POLICY_MESSAGES[code] || "目标地址已被安全策略阻止。");
    this.name = "BrowserNavigationPolicyError";
    this.code = code;
    this.details = details;
  }
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function parseIpv4Bytes(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((part, index) => !/^\d+$/.test(parts[index]) || !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return bytes;
}

function parseIpv6Bytes(value) {
  let address = normalizeHostname(value).split("%")[0];
  if (!address || !address.includes(":")) return null;

  const lastColon = address.lastIndexOf(":");
  const embeddedIpv4 = address.slice(lastColon + 1);
  if (embeddedIpv4.includes(".")) {
    const bytes = parseIpv4Bytes(embeddedIpv4);
    if (!bytes) return null;
    address = `${address.slice(0, lastColon + 1)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;

  const bytes = [];
  for (const group of groups) {
    const numeric = Number.parseInt(group, 16);
    bytes.push(numeric >> 8, numeric & 0xff);
  }
  return bytes;
}

function blockedIpv4Reason(bytes) {
  if (!bytes) return "local";
  const [a, b] = bytes;
  if (a === 0 || a === 10 || a === 127) return "local";
  if (a === 100 && b >= 64 && b <= 127) return "local";
  if (a === 169 && b === 254) return "local";
  if (a === 172 && b >= 16 && b <= 31) return "local";
  if (a === 192 && b === 168) return "local";
  if (a === 198 && (b === 18 || b === 19)) return "local";
  if (a >= 224) return "local";
  return "";
}

function blockedIpv6Reason(bytes) {
  if (!bytes) return "local";
  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (allZero || loopback) return "local";
  if ((bytes[0] & 0xfe) === 0xfc) return "local"; // fc00::/7 unique-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return "local"; // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return "local"; // fec0::/10 legacy site-local
  if (bytes[0] === 0xff) return "local"; // multicast

  const mappedIpv4 = bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;
  const compatibleIpv4 = bytes.slice(0, 12).every((byte) => byte === 0);
  if (mappedIpv4 || compatibleIpv4) return blockedIpv4Reason(bytes.slice(12));

  // 6to4 embeds an IPv4 address immediately after 2002::. A private embedded
  // endpoint is local even though the IPv6 literal itself has a global prefix.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return blockedIpv4Reason(bytes.slice(2, 6));
  }
  return "";
}

export function evaluateResolvedNavigationAddress(value) {
  const address = normalizeHostname(value);
  const family = isIP(address);
  if (family === 4) {
    const code = blockedIpv4Reason(parseIpv4Bytes(address));
    return code ? { allowed: false, code, address } : { allowed: true, address, family };
  }
  if (family === 6) {
    const code = blockedIpv6Reason(parseIpv6Bytes(address));
    return code ? { allowed: false, code, address } : { allowed: true, address, family };
  }
  return { allowed: false, code: "host", address };
}

export function evaluateNavigationHostname(value) {
  const hostname = normalizeHostname(value);
  if (!hostname) return { allowed: false, code: "host", hostname };
  if (
    hostname === "localhost"
    || METADATA_HOSTS.has(hostname)
    || LOCAL_NAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    || (!hostname.includes(".") && isIP(hostname) === 0)
  ) {
    return { allowed: false, code: "local", hostname };
  }
  if (isIP(hostname)) {
    const result = evaluateResolvedNavigationAddress(hostname);
    return { ...result, hostname };
  }
  return { allowed: true, hostname };
}

export function evaluateBrowserNavigationUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    return { allowed: false, code: "invalid", url: "" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { allowed: false, code: "protocol", url: parsed.href };
  }
  if (parsed.username || parsed.password) {
    return { allowed: false, code: "credentials", url: parsed.href };
  }
  const hostResult = evaluateNavigationHostname(parsed.hostname);
  if (!hostResult.allowed) return { ...hostResult, url: parsed.href };
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || UNSAFE_PORTS.has(port)) {
    return { allowed: false, code: "port", port, url: parsed.href };
  }
  return {
    allowed: true,
    hostname: hostResult.hostname,
    port,
    url: parsed.href,
  };
}

export function assertBrowserNavigationUrl(value) {
  const result = evaluateBrowserNavigationUrl(value);
  if (!result.allowed) throw new BrowserNavigationPolicyError(result.code, result);
  return result.url;
}

export function assertResolvedNavigationAddress(value) {
  const result = evaluateResolvedNavigationAddress(value);
  if (!result.allowed) throw new BrowserNavigationPolicyError(result.code, result);
  return result.address;
}

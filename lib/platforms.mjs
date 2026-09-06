const skill = (...path) => ({ type: "skill", path });
const command = (template, ...path) => ({ type: "command", template, path });

export const HARNESS_ADAPTERS = Object.freeze([
  {
    id: "agent-skills",
    aliases: ["agents", "universal"],
    name: "Agent Skills 标准",
    invocation: "按宿主调用",
    entries: [skill(".agents", "skills", "brizo")],
  },
  {
    id: "codex",
    aliases: ["openai-codex"],
    name: "OpenAI Codex",
    invocation: "$brizo",
    entries: [skill(".codex", "skills", "brizo")],
  },
  {
    id: "claude-code",
    aliases: ["claude"],
    name: "Claude Code",
    invocation: "/brizo",
    entries: [skill(".claude", "skills", "brizo")],
  },
  {
    id: "cursor",
    aliases: [],
    name: "Cursor",
    invocation: "/brizo",
    entries: [skill(".cursor", "skills", "brizo")],
  },
  {
    id: "trae",
    aliases: ["trae-cn", "trae-ide"],
    name: "TRAE IDE",
    invocation: "/brizo",
    entries: [
      skill(".trae-cn", "skills", "brizo"),
      command("markdown-arguments", ".trae-cn", "commands", "brizo.md"),
    ],
  },
  {
    id: "trae-cli",
    aliases: ["traecli"],
    name: "TraeCode CLI",
    invocation: "自动调用 Brizo skill",
    entries: [skill(".traecli", "skills", "brizo")],
  },
  {
    id: "codebuddy",
    aliases: ["codebuddy-code"],
    name: "腾讯 CodeBuddy Code",
    invocation: "/brizo",
    entries: [skill(".codebuddy", "skills", "brizo")],
  },
  {
    id: "workbuddy",
    aliases: ["workbuddy-desktop"],
    name: "腾讯 WorkBuddy",
    invocation: "导入 skill 后调用",
    entries: [{ type: "archive", path: [".local", "share", "brizo", "imports", "brizo-workbuddy.zip"] }],
  },
  {
    id: "lingma",
    aliases: ["lingma-ide", "tongyi-lingma"],
    name: "通义灵码 / Qoder CN IDE",
    invocation: "/brizo",
    entries: [skill(".lingma", "skills", "brizo")],
  },
  {
    id: "qoder",
    aliases: ["qoder-cli"],
    name: "Qoder",
    invocation: "/brizo",
    entries: [skill(".qoder", "skills", "brizo")],
  },
  {
    id: "qoder-cn",
    aliases: ["qodercn", "qoder-cn-cli"],
    name: "Qoder CN CLI",
    invocation: "/brizo",
    entries: [skill(".qoder-cn", "skills", "brizo")],
  },
  {
    id: "qwen-code",
    aliases: ["qwen"],
    name: "Qwen Code",
    invocation: "/brizo",
    entries: [skill(".qwen", "skills", "brizo")],
  },
  {
    id: "kimi-code",
    aliases: ["kimi", "kimi-cli"],
    name: "Kimi Code CLI",
    invocation: "/skill:brizo",
    entries: [skill(".kimi", "skills", "brizo")],
  },
  {
    id: "gemini",
    aliases: ["gemini-cli"],
    name: "Gemini CLI",
    invocation: "/brizo",
    entries: [
      skill(".gemini", "skills", "brizo"),
      command("gemini", ".gemini", "commands", "brizo.toml"),
    ],
  },
  {
    id: "antigravity",
    aliases: ["google-antigravity"],
    name: "Google Antigravity",
    invocation: "/brizo",
    entries: [
      skill(".gemini", "config", "skills", "brizo"),
      skill(".gemini", "antigravity-cli", "skills", "brizo"),
    ],
  },
  {
    id: "opencode",
    aliases: ["open-code"],
    name: "OpenCode",
    invocation: "/brizo",
    entries: [
      skill(".config", "opencode", "skills", "brizo"),
      command("markdown-arguments", ".config", "opencode", "commands", "brizo.md"),
    ],
  },
  {
    id: "windsurf",
    aliases: ["cascade"],
    name: "Windsurf / Cascade",
    invocation: "/brizo 或 @brizo",
    entries: [
      skill(".codeium", "windsurf", "skills", "brizo"),
      command("markdown-context", ".codeium", "windsurf", "global_workflows", "brizo.md"),
    ],
  },
  {
    id: "copilot",
    aliases: ["github-copilot", "copilot-cli"],
    name: "GitHub Copilot CLI",
    invocation: "/brizo",
    entries: [skill(".copilot", "skills", "brizo")],
  },
  {
    id: "kiro",
    aliases: ["kiro-cli"],
    name: "Kiro IDE / CLI",
    invocation: "/brizo",
    entries: [skill(".kiro", "skills", "brizo")],
  },
  {
    id: "junie",
    aliases: ["jetbrains-junie"],
    name: "JetBrains Junie",
    invocation: "/brizo 或 $brizo",
    entries: [skill(".junie", "skills", "brizo")],
  },
  {
    id: "roo",
    aliases: ["roo-code"],
    name: "Roo Code",
    invocation: "/brizo",
    entries: [
      skill(".roo", "skills", "brizo"),
      command("markdown-context", ".roo", "commands", "brizo.md"),
    ],
  },
  {
    id: "cline",
    aliases: [],
    name: "Cline",
    invocation: "/brizo.md 或自动调用",
    entries: [
      skill(".cline", "skills", "brizo"),
      command("markdown-context", ".cline", "data", "workflows", "brizo.md"),
    ],
  },
]);

const adapterByTarget = new Map();
for (const adapter of HARNESS_ADAPTERS) {
  adapterByTarget.set(adapter.id, adapter);
  for (const alias of adapter.aliases) adapterByTarget.set(alias, adapter);
}

export function selectHarnessAdapters(targets) {
  const normalizedTargets = targets?.map(target => String(target).toLowerCase());
  if (!normalizedTargets?.length || normalizedTargets.includes("all")) return [...HARNESS_ADAPTERS];
  const selected = [];
  const seen = new Set();
  for (const target of normalizedTargets) {
    const adapter = adapterByTarget.get(target);
    if (!adapter) {
      const error = new Error(`未知平台：${target}。可用值：${HARNESS_ADAPTERS.map(item => item.id).join(", ")}`);
      error.code = "TARGET_INVALID";
      throw error;
    }
    if (!seen.has(adapter.id)) {
      selected.push(adapter);
      seen.add(adapter.id);
    }
  }
  return selected;
}

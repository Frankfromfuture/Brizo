import { readFile } from "node:fs/promises";
import {
  executeBrowserCommand,
  methodReadsJson,
  parseJsonInput,
  readJsonInput,
} from "./client.mjs";
import {
  installIntegration, integrationStatus, uninstallIntegration, universalPrompt,
} from "./installer.mjs";
import { HARNESS_ADAPTERS } from "./platforms.mjs";
import { BRIZO_PACKAGE_VERSION } from "./version.mjs";

const VERSION = BRIZO_PACKAGE_VERSION;
const HELP = `Brizo Agent CLI ${VERSION}

用法：
  brizo install [--target <平台[,平台...]>] [--app <Brizo 路径>]
  brizo platforms
  brizo prompt [网页任务]
  brizo doctor
  brizo uninstall
  brizo create [--json <JSON> | --input <文件>]
  brizo observe <sessionId>
  brizo act <sessionId> [--json <JSON> | --input <文件>]
  brizo open|switch|close-tab <sessionId>
  brizo status|screenshot|handoff|finish|close <sessionId>
  brizo ping

示例：
  echo '{"goal":"在百度搜索 Brizo","client":"Codex","url":"https://www.baidu.com/"}' | brizo create
  brizo create --json '{"goal":"读取当前网页标题","client":"Cursor"}'

浏览器命令的成功或错误均输出一行 JSON，适合 Agent 调用。
`;

function printJson(value, output = process.stdout) {
  output.write(`${JSON.stringify(value)}\n`);
}

async function browserCommandInput(method, argv, io) {
  const requiresSession = !["ping", "create"].includes(method);
  const sessionId = requiresSession ? argv[1] : undefined;
  const rest = argv.slice(requiresSession ? 2 : 1);
  if (!methodReadsJson(method)) {
    if (rest.length) {
      throw Object.assign(
        new Error("命令参数过多。运行 brizo help 查看用法。"),
        { code: "ARGUMENT_INVALID" },
      );
    }
    return { args: {}, sessionId };
  }
  if (!rest.length) {
    return { args: await readJsonInput(io.input || process.stdin), sessionId };
  }
  if (rest.length !== 2 || !["--json", "--input"].includes(rest[0])) {
    throw Object.assign(
      new Error("JSON 命令只接受 --json <JSON>、--input <文件> 或标准输入。"),
      { code: "ARGUMENT_INVALID" },
    );
  }
  const raw = rest[0] === "--json" ? rest[1] : await readFile(rest[1], "utf8");
  return { args: parseJsonInput(raw), sessionId };
}

function parseInstallArgs(args) {
  const options = {};
  const targets = [];
  let targetProvided = false;
  const invalid = () => Object.assign(
    new Error("用法：brizo install [--target <平台[,平台...]>] [--app <Brizo 路径>]"),
    { code: "ARGUMENT_INVALID" },
  );
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--app" && args[index + 1] && !args[index + 1].startsWith("--")) {
      options.appPath = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--target" && args[index + 1] && !args[index + 1].startsWith("--")) {
      targetProvided = true;
      const values = args[index + 1].split(",").map(value => value.trim()).filter(Boolean);
      if (!values.length) throw invalid();
      targets.push(...values);
      index += 1;
      continue;
    }
    if (argument.startsWith("--target=")) {
      targetProvided = true;
      const values = argument.slice(9).split(",").map(value => value.trim()).filter(Boolean);
      if (!values.length) throw invalid();
      targets.push(...values);
      continue;
    }
    throw invalid();
  }
  if (targetProvided) options.targets = targets;
  return options;
}

export async function main(argv, io = {}) {
  const output = io.output || process.stdout;
  const errorOutput = io.errorOutput || process.stderr;
  const runBrowserCommand = io.executeBrowserCommand || executeBrowserCommand;
  const command = argv[0];

  try {
    if (!command || ["help", "--help", "-h"].includes(command)) {
      output.write(HELP);
      return;
    }
    if (["version", "--version", "-v"].includes(command)) {
      output.write(`${VERSION}\n`);
      return;
    }
    if (command === "platforms") {
      if (argv.length > 1) throw Object.assign(new Error("用法：brizo platforms"), { code: "ARGUMENT_INVALID" });
      output.write(`${HARNESS_ADAPTERS.map(item => `${item.id}\t${item.name}\t${item.invocation}`).join("\n")}\n`);
      return;
    }
    if (command === "prompt") {
      output.write(`${universalPrompt(argv.slice(1).join(" "), io.installOptions)}\n`);
      return;
    }
    if (command === "install") {
      const result = await installIntegration({ ...parseInstallArgs(argv.slice(1)), ...io.installOptions });
      const ready = result.adapters.filter(item => item.status === "installed");
      const incomplete = result.adapters.filter(item => item.status !== "installed");
      const workBuddy = result.adapters.find(item => item.id === "workbuddy");
      output.write(
        `Brizo Agent 集成已安装。\nSkill：${result.bundle}\n`
        + `完整适配：${ready.length ? ready.map(item => item.name).join("、") : "无"}\n`
        + (workBuddy?.status === "installed" ? `WorkBuddy 导入包：${result.workBuddyArchive}\n` : "")
        + (incomplete.length ? `未完整适配：${incomplete.map(item => item.name).join("、")}\n` : "")
        + (result.skipped.length
          ? `已保留同名用户文件：\n${result.skipped.map(item => `- ${item.platform}: ${item.path}`).join("\n")}\n`
          : "")
        + (result.launchConfigured
          ? "桌面版启动配置已就绪。\n"
          : "尚未找到 Brizo 桌面版；安装桌面版后运行 brizo install --app <路径>。\n"),
      );
      if (result.skipped.length) process.exitCode = 1;
      return;
    }
    if (command === "uninstall") {
      await uninstallIntegration(io.installOptions);
      output.write("Brizo Agent 集成已移除。\n");
      return;
    }
    if (command === "doctor") {
      const status = await integrationStatus(io.installOptions);
      let bridge = { connected: false };
      try {
        const result = await runBrowserCommand("ping", undefined, {}, io.clientOptions);
        bridge = { connected: true, product: result.product, protocol: result.protocol };
      } catch (error) {
        bridge = { connected: false, code: error.code || "CLIENT_ERROR", message: error.message };
      }
      const ok = status.skillInstalled && status.adapterCount > 0;
      printJson({ ok, status: { ...status, bridge } }, output);
      if (!ok) process.exitCode = 1;
      return;
    }

    const method = command;
    const { args, sessionId } = await browserCommandInput(method, argv, io);
    const result = await runBrowserCommand(method, sessionId, args, io.clientOptions);
    printJson({ ok: true, result }, output);
  } catch (error) {
    printJson({
      ok: false,
      error: {
        code: error.code || "CLIENT_ERROR",
        message: error.message || String(error),
      },
    }, output);
    if (errorOutput !== process.stderr) errorOutput.write("");
    process.exitCode = 1;
  }
}

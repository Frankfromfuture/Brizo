import { app, BrowserWindow } from "electron";
import { readFile } from "node:fs/promises";
import { startAgentBridge } from "../runtime/electron/agent-bridge.mjs";
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const width=Number(option("--width") || 1348), height=Number(option("--height") || 802);
const directory = option("--directory");
const fixturePath = option("--fixture");
if (!directory || !fixturePath) throw new Error("--directory and --fixture are required");
app.setPath("userData", `${directory}/profile`);
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
for (const method of ["show", "showInactive", "focus", "moveTop"]) BrowserWindow.prototype[method] = () => { throw new Error(`Forbidden foreground API ${method}`); };
app.focus = () => { throw new Error("Forbidden foreground activation"); };
let bridge;
void app.whenReady().then(async () => {
  app.dock?.hide();
  const fixture = await readFile(fixturePath, "utf8");
  const window = new BrowserWindow({ width, height, show: false });
  await window.loadURL("data:text/html,<title>Hidden benchmark host</title>");
  bridge = await startAgentBridge({
    directory,
    installNetworkPolicy(partition) {
      partition.protocol.handle("https", request => {
        if (new URL(request.url).origin !== "https://fixture.brizo.example") return new Response("Blocked", { status: 403 });
        return new Response(fixture, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      });
    },
    validateTarget(address) { if (new URL(address).origin !== "https://fixture.brizo.example") throw new Error("Fixture only"); return address; },
    host: {
      offscreenRendering: true,
      attachTab({ view, shield }) { window.contentView.addChildView(view); window.contentView.addChildView(shield); view.setBounds({ x: 0, y: 0, width, height }); view.setVisible(true); },
      detachTab(view) { view.webContents.close(); }, loadRunningEffect: async () => {}, updateTab: () => {}, publish: () => {},
    },
  });
  process.stdout.write(`${JSON.stringify({ ready: true, directory, electron: process.versions.electron, chromium: process.versions.chrome })}\n`);
}).catch(error => { process.stderr.write(error.stack); app.exit(1); });
process.on("SIGTERM", () => { void bridge?.close().finally(() => app.exit(0)); });

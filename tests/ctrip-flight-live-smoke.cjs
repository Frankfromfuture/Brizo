const { app, BaseWindow, WebContentsView } = require("electron");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

async function captureViewport(webContents) {
  const debuggerApi = webContents.debugger;
  const attachedHere = !debuggerApi.isAttached();
  if (attachedHere) debuggerApi.attach("1.3");
  try {
    await debuggerApi.sendCommand("Page.enable");
    const metrics = await debuggerApi.sendCommand("Page.getLayoutMetrics");
    const viewport = metrics.cssVisualViewport || metrics.visualViewport;
    const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: false,
      clip: {
        x: Math.max(0, viewport?.pageX || 0),
        y: Math.max(0, viewport?.pageY || 0),
        width: Math.max(1, viewport?.clientWidth || viewport?.width || 1),
        height: Math.max(1, viewport?.clientHeight || viewport?.height || 1),
        scale: 1,
      },
      format: "png",
      fromSurface: true,
    });
    return Buffer.from(result.data, "base64");
  } finally {
    if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
  }
}

app.whenReady().then(async () => {
  const flow = await import("../electron/ctrip-flight-flow.mjs");
  const window = new BaseWindow({ height: 920, show: true, width: 1440 });
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1440, height: 920 });
  view.webContents.setBackgroundThrottling(false);

  try {
    const command = process.env.BRIZO_CTRIP_SMOKE_COMMAND
      || "查找从北京到上海的后天最便宜的机票";
    const intent = flow.parseCtripFlightCommand(
      command,
      process.env.BRIZO_CTRIP_SMOKE_COMMAND ? new Date() : new Date(2026, 7, 9, 9, 30),
    );
    void view.webContents.loadURL(flow.buildCtripFlightUrl(intent)).catch(() => {});
    await flow.waitForCtripFlightResults(view.webContents, { timeout: 60_000 });
    const result = await flow.collectCtripFlightResults(view.webContents);
    const selected = flow.selectCtripFlights(result.cards, intent);
    if (!selected.length) throw new Error("No flights matched the requested departure window.");
    const highlighted = await flow.highlightCtripFlights(
      view.webContents,
      selected.map((flight) => flight.index),
    );
    if (!highlighted) throw new Error("No flight cards were highlighted.");
    const outputDirectory = path.join(process.cwd(), "output", "desktop");
    await mkdir(outputDirectory, { recursive: true });
    const screenshotPath = path.join(
      outputDirectory,
      `ctrip-${intent.origin.code.toLowerCase()}-${intent.destination.code.toLowerCase()}-brizo.png`,
    );
    await writeFile(screenshotPath, await captureViewport(view.webContents));
    console.log("[ctrip-flight-smoke]", JSON.stringify({
      cards: result.cards.length,
      date: intent.date,
      departureWindow: intent.departureWindow,
      highlighted,
      selected: selected.length,
      screenshotPath,
      status: "passed",
      url: result.url,
    }));
  } catch (error) {
    const outputDirectory = path.join(process.cwd(), "output", "desktop");
    await mkdir(outputDirectory, { recursive: true });
    const screenshotPath = path.join(outputDirectory, "ctrip-bjs-sha-brizo-failure.png");
    await writeFile(screenshotPath, await captureViewport(view.webContents)).catch(() => {});
    const extraction = await flow.readCtripFlightResults(view.webContents)
      .then((value) => ({ extractionCards: value.cards.length }))
      .catch((failure) => ({ extractionError: failure.message }));
    const diagnostics = await view.webContents.executeJavaScript(`({
      priceAncestors: [...document.querySelectorAll("body *")]
        .filter((node) => /^[¥￥]\\s*400(?:起)?$/.test(String(node.textContent || "").trim()))
        .slice(0, 3)
        .map((node) => {
          const chain = [];
          let current = node;
          for (let index = 0; current && index < 7; index += 1, current = current.parentElement) {
            chain.push(current.tagName.toLowerCase() + "." + String(current.className || "").replace(/\\s+/g, "."));
          }
          return chain;
        }),
      text: String(document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1200),
      title: document.title,
      url: location.href,
    })`).catch(() => ({}));
    console.error("[ctrip-flight-smoke]", JSON.stringify({
      ...diagnostics,
      ...extraction,
      message: error instanceof Error ? error.message : String(error),
      screenshotPath,
      status: "failed",
    }));
    process.exitCode = 1;
  } finally {
    await flow.clearCtripFlightHighlights(view.webContents);
    window.close();
    app.quit();
  }
}).catch((error) => {
  console.error("[ctrip-flight-smoke]", JSON.stringify({ message: error.message, status: "failed" }));
  process.exitCode = 1;
  app.quit();
});

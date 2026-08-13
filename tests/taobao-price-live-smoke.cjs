const { app, BaseWindow, WebContentsView } = require("electron");

app.whenReady().then(async () => {
  const flow = await import("../electron/taobao-price-flow.mjs");
  const window = new BaseWindow({ height: 760, show: true, width: 1100 });
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1100, height: 760 });
  const cards = [89, 89, 129.9, 59, 169, 219].map((price, index) => `
    <a class="Card--doubleCardWrapper--fixture" href="https://item.taobao.com/item.htm?id=${index}">
      <div class="Title--title--fixture">背背佳护姿带型号 ${index + 1}</div>
      <div class="Price--priceWrapper--fixture"><span>¥</span><span class="Price--priceInt--fixture">${price}</span></div>
    </a>
  `).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font-family:sans-serif}
    a{height:220px;padding:18px;border-radius:12px;background:#fff3e8;color:#222;text-decoration:none}
    [class*='title']{font-size:18px}[class*='priceWrapper']{margin-top:120px;color:#f40;font-size:26px}
  </style>${cards}`;
  try {
    await view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const result = await flow.waitForTaobaoPriceResults(view.webContents, { timeout: 3_000 });
    const selected = flow.selectDistinctPriceItems(result.items, 5);
    const highlighted = await flow.highlightTaobaoItems(
      view.webContents,
      selected.map((item) => item.index),
    );
    if (selected.length !== 5 || highlighted < 2) throw new Error("Taobao extraction fixture failed.");
    console.log("[taobao-price-smoke]", JSON.stringify({
      highlighted,
      prices: selected.map((item) => item.price),
      status: "passed",
    }));
  } catch (error) {
    console.error("[taobao-price-smoke]", JSON.stringify({ message: error.message, status: "failed" }));
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}).catch((error) => {
  console.error("[taobao-price-smoke]", JSON.stringify({ message: error.message, status: "failed" }));
  process.exitCode = 1;
  app.quit();
});

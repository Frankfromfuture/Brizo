import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("page-edge sampling is trailing-debounced and capped during continuous viewport activity", async () => {
  const source = await readFile(path.join(root, "electron", "browser-page-preload.cjs"), "utf8");

  assert.match(source, /TOP_EDGE_TRAILING_DELAY_MS\s*=\s*350/);
  assert.match(source, /TOP_EDGE_MAX_INTERVAL_MS\s*=\s*500/);
  assert.match(source, /reportPageInteraction\(event,\s*"viewport-activity"\)/);
  assert.match(source, /window\.addEventListener\("scroll",\s*reportViewportInteraction/);
  assert.doesNotMatch(source, /window\.addEventListener\("scroll",\s*reportPageInteraction/);
  assert.match(source, /topEdgeStructureObserver\.observe\(document\.documentElement,\s*\{\s*childList:\s*true,\s*subtree:\s*true/);
  assert.match(source, /topEdgeRootAttributeObserver\.observe\(document\.body,\s*\{\s*attributeFilter:/);
  assert.match(source, /window\.addEventListener\("pagehide",[\s\S]*topEdgeStructureObserver\?\.disconnect\(\)/);
});

test("SoftBlurIn scopes ordinary UI and directly managed portal observers", async () => {
  const source = await readFile(
    path.join(root, "src", "components", "remocn", "soft-blur-in.tsx"),
    "utf8",
  );

  assert.match(source, /root\.closest\("#root"\) \|\| root/);
  assert.match(source, /scopeObserver\.observe\(scope, \{ childList: true, subtree: true \}\)/);
  assert.match(source, /bodyObserver\.observe\(document\.body, \{ childList: true \}\)/);
  assert.match(source, /portalObservers\.forEach\(\(portalObserver\) => portalObserver\.disconnect\(\)\)/);
  assert.doesNotMatch(source, /revealWithin\(document\.body\)/);
  assert.doesNotMatch(source, /observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  assert.match(source, /reducedMotion\.matches/);
});

test("idle new-tab particles render one entrance burst and then fully quiesce", async () => {
  const source = await readFile(
    path.join(root, "src", "components", "NewTabParticleBackground.jsx"),
    "utf8",
  );

  assert.match(source, /TARGET_FRAME_INTERVAL\s*=\s*1000\s*\/\s*24/);
  assert.match(source, /FULL_RATE_DURATION\s*=\s*2_400/);
  assert.match(source, /if \(!reducedMotion && now < fullRateUntil\)/);
  assert.match(source, /frameTimer\s*=\s*window\.setTimeout[\s\S]*TARGET_FRAME_INTERVAL/);
  assert.doesNotMatch(source, /SETTLED_FRAME_INTERVAL/);
  assert.doesNotMatch(source, /now\s*-\s*lastFrameAt\s*<\s*TARGET_FRAME_INTERVAL/);
  assert.match(source, /const stop = \(\) =>/);
});

test("the Ask sparkle loop is timer-sampled instead of a perpetual compositor animation", async () => {
  const [appSource, iconSource, styleSource] = await Promise.all([
    readFile(path.join(root, "src", "App.jsx"), "utf8"),
    readFile(path.join(root, "src", "components", "remocn", "icon-sparkles.tsx"), "utf8"),
    readFile(path.join(root, "src", "styles.css"), "utf8"),
  ]);

  assert.match(appSource, /<SparklesIcon[^>]*softLoop=\{active\}/);
  assert.match(iconSource, /node\.dataset\.sparklesPhase/);
  assert.match(iconSource, /document\.hidden \|\| !document\.hasFocus\(\)/);
  assert.match(iconSource, /SOFT_LOOP_INTERVAL_MS\s*=\s*4_050/);
  assert.match(iconSource, /const schedule = \(delay = SOFT_LOOP_INTERVAL_MS\)/);
  assert.match(iconSource, /timer = window\.setTimeout/);
  assert.doesNotMatch(styleSource, /new-tab-sparkles-(?:breathe|twinkle)[^;{]*infinite/);
  assert.match(styleSource, /data-sparkles-phase="top"/);
});

test("the pinned compass animates on interaction instead of keeping the shell awake", async () => {
  const source = await readFile(path.join(root, "src", "styles.css"), "utf8");
  const defaultBodyRule = source.match(/\.remocn-compass-icon \.remocn-compass-body\s*\{([^}]*)\}/u)?.[1] || "";
  const defaultNeedleRule = source.match(/\.remocn-compass-icon \.remocn-compass-needle\s*\{([^}]*)\}/u)?.[1] || "";
  assert.doesNotMatch(defaultBodyRule, /animation:/u);
  assert.doesNotMatch(defaultNeedleRule, /animation:/u);
  assert.match(source, /\.pinned-tab-btn:is\(:hover, :focus-visible\)[\s\S]*animation: remocn-compass-sway 1\.3s[\s\S]*both/u);
  assert.match(source, /\.pinned-tab-btn:is\(:hover, :focus-visible\)[\s\S]*animation: remocn-compass-spin 1\.3s[\s\S]*both/u);
});

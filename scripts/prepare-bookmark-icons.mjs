import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "src", "bookmark-icon-library.jsx");
const outputDirectory = path.join(projectRoot, "src", "bookmark-icons");
const source = await readFile(sourcePath, "utf8");
const entryPattern = /icon\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*([A-Za-z0-9]+),\s*\[([^\]]*)\](?:,\s*(true|false))?\)/g;
const entries = [];
let match;
while ((match = entryPattern.exec(source))) {
  entries.push({
    category: match[4],
    component: match[5],
    id: match[1],
    keywords: [...match[6].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
    label: match[2],
    labelZh: match[3],
    legacy: match[7] === "true",
  });
}
if (entries.length < 80) throw new Error(`Expected at least 80 bookmark icons, found ${entries.length}.`);

await mkdir(outputDirectory, { recursive: true });
for (const entry of entries) {
  const definitionPath = path.join(
    projectRoot,
    "node_modules",
    "@phosphor-icons",
    "react",
    "dist",
    "defs",
    `${entry.component}.es.js`,
  );
  const definition = (await import(pathToFileURL(definitionPath).href)).default;
  for (const [state, weight] of [["default", "regular"], ["active", "fill"]]) {
    const content = renderToStaticMarkup(definition.get(weight));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">${content}</svg>\n`;
    await writeFile(path.join(outputDirectory, `${entry.id}-${state}.svg`), svg);
  }
}
await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(entries.map(({ component, ...entry }) => ({
    ...entry,
    active: `${entry.id}-active.svg`,
    default: `${entry.id}-default.svg`,
  })), null, 2)}\n`,
);
console.log(`Prepared ${entries.length * 2} local bookmark SVG assets.`);

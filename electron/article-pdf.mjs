import { BrowserWindow } from "electron";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const readabilitySource = readFileSync(
  require.resolve("@mozilla/readability/Readability.js"),
  "utf8",
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createPdfFilename(title) {
  const safeTitle = String(title || "Web article")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
  return `${safeTitle || "Web article"}.pdf`;
}

export async function extractReadableArticle(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    throw new Error("The page is no longer available.");
  }

  const article = await webContents.executeJavaScript(`
    (() => {
      const module = { exports: {} };
      ${readabilitySource}
      const Reader = module.exports;
      const metadataEntries = Array.from(document.querySelectorAll("meta")).map((meta) => ({
        content: meta.getAttribute("content")?.trim() || "",
        key: (
          meta.getAttribute("name") ||
          meta.getAttribute("property") ||
          meta.getAttribute("itemprop") ||
          ""
        ).trim().toLocaleLowerCase(),
      }));
      const getMetadata = (...keys) => {
        const normalizedKeys = keys.map((key) => key.toLocaleLowerCase());
        return metadataEntries.find(
          (entry) => normalizedKeys.includes(entry.key) && entry.content,
        )?.content || "";
      };
      const structuredArticles = [];

      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        try {
          const parsedJson = JSON.parse(script.textContent || "null");
          const queue = Array.isArray(parsedJson) ? [...parsedJson] : [parsedJson];
          while (queue.length) {
            const item = queue.shift();
            if (!item || typeof item !== "object") continue;
            if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
            const types = [item["@type"]].flat().map((type) =>
              String(type || "").toLocaleLowerCase()
            );
            if (
              types.some((type) =>
                /(?:article|posting|report|news|blog|legislation|creativework)/.test(type)
              )
            ) {
              structuredArticles.push(item);
            }
          }
        } catch {
          // Ignore malformed structured data and continue with other title signals.
        }
      });

      const clonedDocument = document.cloneNode(true);
      const sourceImages = Array.from(document.querySelectorAll("img"));
      const clonedImages = Array.from(clonedDocument.querySelectorAll("img"));

      const resolveUrl = (value) => {
        if (!value) return "";
        try {
          return new URL(value, document.baseURI).href;
        } catch {
          return "";
        }
      };

      sourceImages.forEach((sourceImage, index) => {
        const clonedImage = clonedImages[index];
        if (!clonedImage) return;
        const lazySource =
          sourceImage.currentSrc ||
          sourceImage.getAttribute("data-src") ||
          sourceImage.getAttribute("data-lazy-src") ||
          sourceImage.getAttribute("data-original") ||
          sourceImage.src;
        const lazySourceSet =
          sourceImage.getAttribute("data-srcset") ||
          sourceImage.getAttribute("srcset") ||
          "";
        const sourceSetCandidate = lazySourceSet
          .split(",")
          .map((candidate) => candidate.trim().split(/\\s+/)[0])
          .filter(Boolean)
          .at(-1);
        const resolvedSource = resolveUrl(lazySource || sourceSetCandidate);

        if (resolvedSource) clonedImage.setAttribute("src", resolvedSource);
        clonedImage.removeAttribute("srcset");
        clonedImage.removeAttribute("sizes");
        clonedImage.removeAttribute("loading");
      });

      const parsed = new Reader(clonedDocument, {
        charThreshold: 120,
        keepClasses: false,
      }).parse();

      if (!parsed || !parsed.content || parsed.length < 40) {
        throw new Error("No readable article content was found on this page.");
      }

      const normalizeText = (value) =>
        String(value || "").replace(/\\s+/g, " ").trim().toLocaleLowerCase();
      const siteNames = [
        getMetadata("sitename", "og:site_name", "application-name"),
        parsed.siteName,
        location.hostname.replace(/^www\\./i, ""),
      ].filter(Boolean);
      const titleCandidates = new Map();
      const addTitleCandidate = (value, score, source) => {
        const rawValue = String(value || "").replace(/\\s+/g, " ").trim();
        if (rawValue.length < 4 || rawValue.length > 320) return;

        let cleanedValue = rawValue;
        for (const siteName of siteNames) {
          for (const separator of [" | ", " - ", " / ", " :: "]) {
            const suffix = separator + siteName;
            if (normalizeText(cleanedValue).endsWith(normalizeText(suffix))) {
              cleanedValue = cleanedValue.slice(0, -suffix.length).trim();
            }
          }
        }

        const key = normalizeText(cleanedValue);
        if (!key || cleanedValue.length < 4) return;
        const isSiteName = siteNames.some((siteName) => normalizeText(siteName) === key);
        const previous = titleCandidates.get(key);
        const consensusBonus = previous ? 24 : 0;
        const nextScore = score + consensusBonus - (isSiteName ? 240 : 0);
        if (!previous || nextScore > previous.score) {
          titleCandidates.set(key, {
            source: previous ? previous.source + "+" + source : source,
            score: nextScore,
            value: cleanedValue,
          });
        }
      };

      addTitleCandidate(
        getMetadata(
          "articletitle",
          "article-title",
          "article_title",
          "dc.title",
          "dcterms.title",
          "headline",
          "parsely-title",
        ),
        150,
        "article-meta",
      );
      structuredArticles.forEach((item) => {
        addTitleCandidate(item.headline || item.name, 145, "structured-data");
      });
      addTitleCandidate(getMetadata("og:title"), 125, "open-graph");
      addTitleCandidate(getMetadata("twitter:title"), 118, "twitter-card");
      document
        .querySelectorAll(
          "article h1, main h1, [role='main'] h1, h1, [itemprop='headline'], .article-title, .article__title, .post-title, .entry-title, .content-title",
        )
        .forEach((heading, index) => {
          if (index < 12 && heading.getClientRects().length) {
            addTitleCandidate(heading.textContent, 132 - index, "visible-heading");
          }
        });
      addTitleCandidate(parsed.title, 88, "readability");
      addTitleCandidate(document.title, 60, "document-title");

      const selectedTitle = Array.from(titleCandidates.values())
        .sort((left, right) => right.score - left.score)[0] || {
          source: "fallback",
          value: parsed.title || document.title || "Web article",
        };
      const structuredArticle = structuredArticles[0] || {};
      const structuredAuthor = Array.isArray(structuredArticle.author)
        ? structuredArticle.author[0]
        : structuredArticle.author;
      const metadataByline =
        getMetadata(
          "author",
          "article:author",
          "contentsource",
          "content-source",
          "dc.creator",
          "dcterms.creator",
        ) ||
        (typeof structuredAuthor === "string"
          ? structuredAuthor
          : structuredAuthor?.name || "");
      const metadataPublishedTime =
        getMetadata(
          "pubdate",
          "publishdate",
          "date",
          "article:published_time",
          "datepublished",
        ) ||
        structuredArticle.datePublished ||
        "";

      const template = document.createElement("template");
      template.innerHTML = parsed.content;
      template.content
        .querySelectorAll(
          "script, style, noscript, nav, aside, form, button, input, textarea, select, iframe, canvas",
        )
        .forEach((element) => element.remove());

      template.content.querySelectorAll("*").forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
          if (
            /^on/i.test(attribute.name) ||
            ["class", "id", "style", "contenteditable", "tabindex"].includes(attribute.name)
          ) {
            element.removeAttribute(attribute.name);
          }
        });
      });

      template.content.querySelectorAll("img").forEach((image) => {
        const source = resolveUrl(image.getAttribute("src"));
        const width = Number.parseInt(image.getAttribute("width") || "", 10);
        const height = Number.parseInt(image.getAttribute("height") || "", 10);
        if (
          !source ||
          (/^(?:data:image\\/gif;base64,R0lGODlhAQABA|about:blank)/i.test(source)) ||
          (Number.isFinite(width) && width <= 2) ||
          (Number.isFinite(height) && height <= 2)
        ) {
          image.remove();
          return;
        }
        image.setAttribute("src", source);
        image.setAttribute("loading", "eager");
        image.setAttribute("decoding", "sync");
      });

      const normalizeByline = (value) =>
        normalizeText(value).replace(/^(?:by\\s+|作者\\s*[:：]?\\s*)/i, "");

      const selectedByline = parsed.byline || metadataByline;
      if (selectedByline) {
        const parsedByline = normalizeByline(selectedByline);
        Array.from(template.content.querySelectorAll("p, div, span"))
          .slice(0, 12)
          .filter((element) => element.children.length === 0)
          .forEach((element) => {
            if (normalizeByline(element.textContent) === parsedByline) {
              element.remove();
            }
          });
      }

      const firstHeading = template.content.querySelector("h1");
      if (
        firstHeading &&
        normalizeText(firstHeading.textContent) === normalizeText(selectedTitle.value)
      ) {
        firstHeading.remove();
      }

      return {
        byline: selectedByline || "",
        content: template.innerHTML,
        dir: parsed.dir || document.dir || "auto",
        lang: parsed.lang || document.documentElement.lang || "en",
        length: parsed.length,
        publishedTime: parsed.publishedTime || metadataPublishedTime,
        siteName: parsed.siteName || location.hostname.replace(/^www\\./i, ""),
        title: selectedTitle.value,
        titleSource: selectedTitle.source,
        url: location.href,
      };
    })()
  `, true);

  return article;
}

function buildArticleDocument(article) {
  const language = escapeHtml(article.lang || "en");
  const direction = ["ltr", "rtl"].includes(article.dir) ? article.dir : "auto";
  const byline = article.byline
    ? `<p class="article-byline">${escapeHtml(article.byline)}</p>`
    : "";
  const publishedTime = article.publishedTime
    ? `<time class="article-date">${escapeHtml(article.publishedTime)}</time>`
    : "";

  return `<!doctype html>
<html lang="${language}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline';"
    >
    <title>${escapeHtml(article.title)}</title>
    <style>
      @page {
        size: A4;
        margin: 18mm 18mm 20mm;
      }

      * {
        box-sizing: border-box;
      }

      html {
        color: #171717;
        background: #fff;
        font-family: "Times New Roman", "Songti SC", "STSong", SimSun, serif;
        font-size: 12pt;
        font-synthesis: none;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      html:lang(zh),
      :lang(zh) {
        font-family: "Songti SC", "STSong", SimSun, "Times New Roman", serif;
      }

      body {
        margin: 0 auto;
        max-width: 174mm;
        line-height: 1.68;
        overflow-wrap: anywhere;
        text-rendering: optimizeLegibility;
      }

      .article-header {
        margin: 0 0 9mm;
        padding: 0 0 6mm;
        border-bottom: 0.5pt solid #c9c9c9;
      }

      .article-title {
        margin: 0;
        color: #111;
        font-size: 26pt;
        font-weight: 700;
        letter-spacing: -0.018em;
        line-height: 1.13;
        text-wrap: balance;
      }

      .article-byline,
      .article-date {
        margin: 4mm 0 0;
        color: #5d5d5d;
        font-size: 10.5pt;
        line-height: 1.4;
      }

      .article-date {
        display: block;
        margin-top: 1.5mm;
      }

      .article-content {
        font-size: 12pt;
      }

      .article-content > :first-child {
        margin-top: 0;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        break-after: avoid-page;
        color: #171717;
        font-weight: 700;
        line-height: 1.25;
      }

      h1 {
        margin: 9mm 0 3.5mm;
        font-size: 21pt;
      }

      h2 {
        margin: 8mm 0 3mm;
        font-size: 17pt;
      }

      h3 {
        margin: 6mm 0 2.5mm;
        font-size: 14pt;
      }

      h4,
      h5,
      h6 {
        margin: 5mm 0 2mm;
        font-size: 12pt;
      }

      p {
        margin: 0 0 4.2mm;
        widows: 3;
        orphans: 3;
      }

      strong,
      b {
        font-weight: 700;
      }

      em,
      i {
        font-style: italic;
      }

      a {
        color: inherit;
        text-decoration: underline;
        text-decoration-color: #8a8a8a;
        text-underline-offset: 0.12em;
      }

      blockquote {
        margin: 6mm 0;
        padding: 1mm 0 1mm 6mm;
        border-left: 2.5pt solid #6f866f;
        color: #414141;
        font-size: 11.5pt;
      }

      ul,
      ol {
        margin: 0 0 4.5mm;
        padding-left: 7mm;
      }

      li {
        margin: 0 0 1.6mm;
      }

      figure,
      picture,
      img,
      table,
      pre,
      blockquote {
        break-inside: avoid-page;
      }

      figure {
        margin: 7mm 0;
      }

      img {
        display: block;
        width: auto;
        max-width: 100%;
        height: auto;
        max-height: 220mm;
        margin: 6mm auto;
        object-fit: contain;
      }

      figure img {
        margin-bottom: 2.5mm;
      }

      figcaption {
        margin: 0 auto;
        max-width: 95%;
        color: #606060;
        font-size: 9.5pt;
        line-height: 1.45;
        text-align: center;
      }

      table {
        width: 100%;
        margin: 6mm 0;
        border-collapse: collapse;
        font-size: 9.5pt;
      }

      th,
      td {
        padding: 2mm;
        border: 0.5pt solid #bdbdbd;
        text-align: start;
        vertical-align: top;
      }

      th {
        background: #f0f1ef;
        font-weight: 700;
      }

      pre,
      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 9.5pt;
      }

      pre {
        max-width: 100%;
        padding: 4mm;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        background: #f4f4f2;
      }

      hr {
        margin: 8mm 0;
        border: 0;
        border-top: 0.5pt solid #c9c9c9;
      }
    </style>
  </head>
  <body>
    <article>
      <header class="article-header">
        <h1 class="article-title">${escapeHtml(article.title)}</h1>
        ${byline}
        ${publishedTime}
      </header>
      <main class="article-content">${article.content}</main>
    </article>
  </body>
</html>`;
}

export async function renderArticlePdf(article) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: "#ffffff",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    const html = buildArticleDocument(article);
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await printWindow.webContents.executeJavaScript(`
      Promise.race([
        Promise.all([
          document.fonts?.ready || Promise.resolve(),
          ...Array.from(document.images).map((image) =>
            image.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                })
          )
        ]),
        new Promise((resolve) => setTimeout(resolve, 12000))
      ])
    `, true);

    return await printWindow.webContents.printToPDF({
      generateDocumentOutline: true,
      generateTaggedPDF: true,
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

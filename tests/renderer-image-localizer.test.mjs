import assert from "node:assert/strict";
import test from "node:test";
import { createRendererImageLocalizer } from "../electron/renderer-image-localizer.mjs";

function createFakeProxy() {
  const calls = [];
  return {
    calls,
    async getDataUrl(url) {
      calls.push(url);
      if (url.includes("blocked")) throw new Error("blocked");
      return { dataUrl: `data:image/png;base64,${Buffer.from(url).toString("base64")}` };
    },
  };
}

test("search images are localized without changing their clickable source URL", async () => {
  const proxy = createFakeProxy();
  const localizer = createRendererImageLocalizer({ proxy });
  const images = await localizer.localizeSearchImages([
    { imageUrl: "https://images.example/a.png", url: "https://source.example/article" },
    { imageUrl: "https://blocked.example/a.png", url: "https://source.example/blocked" },
  ]);
  assert.equal(images.length, 1);
  assert.match(images[0].imageUrl, /^data:image\/png;base64,/u);
  assert.equal(images[0].thumbnailUrl, "");
  assert.equal(images[0].url, "https://source.example/article");
});

test("search cards remove unusable remote image fallbacks", async () => {
  const proxy = createFakeProxy();
  const localizer = createRendererImageLocalizer({ proxy });
  const cards = await localizer.localizeSearchCards([{
    kind: "news",
    items: [
      { thumbnailUrl: "https://images.example/thumb.webp", url: "https://news.example/" },
      { imageUrl: "http://insecure.example/image.png", url: "https://news.example/two" },
    ],
  }]);
  assert.match(cards[0].items[0].imageUrl, /^data:image\/png;base64,/u);
  assert.equal(cards[0].items[0].thumbnailUrl, "");
  assert.equal(cards[0].items[1].imageUrl, "");
});

test("Brief deduplicates repeated stories and emits only local renderer images", async () => {
  const proxy = createFakeProxy();
  const localizer = createRendererImageLocalizer({ proxy, concurrency: 2 });
  const story = {
    id: "same-story",
    faviconUrl: "https://news.example/favicon.png",
    imageUrl: "https://images.example/hero.jpg",
    sources: [{ faviconUrl: "https://news.example/favicon.png", url: "https://news.example/story" }],
  };
  const edition = await localizer.localizeBriefEdition({
    pages: [
      { stories: [story] },
      { sections: [{ stories: [story] }] },
    ],
  });
  assert.match(edition.pages[0].stories[0].imageUrl, /^data:image\/png;base64,/u);
  assert.equal(edition.pages[0].stories[0].imageUrl, edition.pages[1].sections[0].stories[0].imageUrl);
  assert.equal(proxy.calls.filter((url) => url.includes("hero.jpg")).length, 1);
  assert.equal(proxy.calls.filter((url) => url.includes("favicon.png")).length, 2);
});

test("Brief reports localize cover, gallery, sources, and related stories", async () => {
  const proxy = createFakeProxy();
  const localizer = createRendererImageLocalizer({ proxy });
  const report = await localizer.localizeBriefReport({
    imageUrl: "https://images.example/cover.png",
    images: ["https://images.example/cover.png", "https://blocked.example/no.png"],
    relatedStories: [{ id: "related", imageUrl: "https://images.example/related.png", sources: [] }],
    sources: [{ faviconUrl: "https://news.example/favicon.png" }],
  });
  assert.match(report.imageUrl, /^data:image\/png;base64,/u);
  assert.equal(report.images.length, 1);
  assert.match(report.relatedStories[0].imageUrl, /^data:image\/png;base64,/u);
  assert.match(report.sources[0].faviconUrl, /^data:image\/png;base64,/u);
});

// Serialized into the selected page. No imports, eval, or cross-origin access.
export function createBrowserObservationScope(options, lookup) {
  const kind = options.scope || "viewport", offscreen = kind !== "viewport";
  const limit = options.maxElements ?? 140, captureLimit = Math.max(140, limit), offset = options.offset || 0;
  const maxChars = options.maxChars ?? 6000, captureChars = Math.max(6000, maxChars), textOffset = options.textOffset || 0;
  const regions = [], seenText = new WeakSet(), parts = [];
  let count = 0, omitted = 0, chars = 0, clipped = false, scopeAnchor = "";
  let root = document, context = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  if (kind === "subtree") {
    const found = lookup(options.rootDomRef, options.rootAttribute);
    if (!found) return { error: "ROOT_GONE" };
    root = found.element; context = { offsetX: found.offsetX, offsetY: found.offsetY, scaleX: found.scaleX, scaleY: found.scaleY };
    scopeAnchor = "scope-" + Math.random().toString(36).slice(2);
    root.setAttribute("data-brizo-scope-root", scopeAnchor);
    if (/^(IFRAME|FRAME)$/.test(root.tagName)) {
      let child; try { child = root.contentDocument; } catch { /* inaccessible boundary */ }
      if (!child?.documentElement) return { error: "FRAME_UNAVAILABLE" };
      const r = root.getBoundingClientRect(), sx = r.width / Math.max(1, root.offsetWidth), sy = r.height / Math.max(1, root.offsetHeight);
      context = { offsetX: context.offsetX + (r.left + root.clientLeft * sx) * context.scaleX, offsetY: context.offsetY + (r.top + root.clientTop * sy) * context.scaleY, scaleX: context.scaleX * sx, scaleY: context.scaleY * sy };
      root = child;
    }
  }
  const rendered = element => {
    const view = element.ownerDocument?.defaultView, style = view?.getComputedStyle(element);
    return Boolean(style && element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > .02 && element.getClientRects().length);
  };
  const role = element => element.getAttribute("role") || ({ MAIN: "main", ARTICLE: "article", NAV: "navigation", ASIDE: "complementary", HEADER: "banner", FOOTER: "contentinfo", FORM: "form" })[element.tagName];
  const mark = (element, attribute, ref) => {
    const domRef = "root-" + Math.random().toString(36).slice(2) + "-" + ref;
    element.setAttribute(attribute, domRef); return domRef;
  };
  return {
    root, context, offscreen, rendered, regions,
    region(element, frameRef) {
      if (regions.length >= 32 || !element.matches('main,article,nav,aside,header,footer,[role="main"],[role="navigation"],[role="search"],[role="region"],[role="dialog"]')) return;
      const ref = "@r" + (regions.length + 1);
      regions.push({ ref, domRef: mark(element, "data-brizo-region-ref", ref), role: role(element), name: clean(element.getAttribute("aria-label") || element.querySelector('h1,h2')?.textContent).slice(0, 180), ...(frameRef ? { frameRef } : {}) });
    },
    frame(element, ref) { return mark(element, "data-brizo-frame-ref", ref); },
    control(element, name, value, frameRef) {
      const f = options.filter;
      const r = element.getAttribute("role") || ({ A: "link", BUTTON: "button", INPUT: /checkbox|radio/.test(element.type) ? element.type : "textbox", TEXTAREA: "textbox", SELECT: "combobox", CANVAS: "canvas" })[element.tagName] || element.localName;
      if (f && ((f.role && f.role !== r) || (f.frameRef && f.frameRef !== frameRef) || (f.text && !(name + " " + value).toLocaleLowerCase().includes(String(f.text).toLocaleLowerCase())))) return false;
      if (count++ < offset) return false;
      if (count - offset > captureLimit) { omitted++; return false; }
      return true;
    },
    collectText(nodes, visible) {
      for (const node of nodes) {
        if (clipped) break;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(node.tagName || "") || !visible(node)) continue;
        const view = node.ownerDocument.defaultView;
        let top = 0, bottom = view.innerHeight, left = 0, right = view.innerWidth;
        if (!offscreen) for (let parent = node; parent; parent = parent.parentElement || parent.getRootNode()?.host) {
          const style = view.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
          if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        }
        for (const child of node.childNodes) {
          if (child.nodeType !== Node.TEXT_NODE || seenText.has(child) || !child.textContent.trim()) continue;
          if (!offscreen) {
            const range = node.ownerDocument.createRange(); range.selectNodeContents(child);
            if (![...range.getClientRects()].some(r => r.bottom > top && r.top < bottom && r.right > left && r.left < right)) continue;
          }
          seenText.add(child);
          const text = clean(child.textContent), remaining = textOffset + captureChars + 1 - chars;
          if (remaining <= 0) { clipped = true; break; }
          parts.push(text.slice(0, remaining)); chars += text.length + 1;
          if (chars > textOffset + captureChars) { clipped = true; break; }
        }
      }
    },
    finish() {
      const text = parts.join(" "), pageText = text.slice(textOffset, textOffset + captureChars);
      return { scope: kind, pageText, truncated: { elements: count > offset + limit, omittedElements: Math.max(omitted, count - offset - limit), text: clipped || text.length > textOffset + maxChars },
        pagination: { offset, nextOffset: limit && count > offset + limit ? offset + limit : null, textOffset, nextTextOffset: (clipped || text.length > textOffset + maxChars) && maxChars ? textOffset + Math.min(maxChars, pageText.length) : null },
        selection: { ...options, rootDomRef: scopeAnchor || undefined, rootAttribute: scopeAnchor ? "data-brizo-scope-root" : undefined } };
    },
  };
}

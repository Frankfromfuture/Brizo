const localBookmarkIconAssets = import.meta.glob("./bookmark-icons/*.svg", {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

function localBookmarkIconUrl(id, state) {
  return localBookmarkIconAssets[`./bookmark-icons/${id}-${state}.svg`]
    || localBookmarkIconAssets[`./bookmark-icons/folder-${state}.svg`]
    || "";
}

export function BookmarkSemanticIcon({ active = false, id = "folder", size = 18 }) {
  return (
    <span
      className={`bookmark-semantic-icon ${active ? "is-active" : ""}`}
      aria-hidden="true"
      data-icon-id={id}
      style={{ height: size, width: size }}
    >
      <span
        className="bookmark-icon-outline"
        style={{ "--bookmark-icon-url": `url("${localBookmarkIconUrl(id, "default")}")` }}
      />
      <span
        className="bookmark-icon-fill"
        style={{ "--bookmark-icon-url": `url("${localBookmarkIconUrl(id, "active")}")` }}
      />
    </span>
  );
}

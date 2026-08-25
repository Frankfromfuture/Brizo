import { MagnifyingGlass } from "@phosphor-icons/react";

export function LibraryPageFrame({
  children,
  className = "",
  navigation,
  onQueryChange,
  query = "",
  searchLabel,
  title,
  titleIcon,
}) {
  return (
    <section className={`brizo-settings-page brizo-library-page ${className}`.trim()} aria-label={title}>
      <header className="brizo-settings-header">
        <div className="brizo-settings-title brizo-library-title">
          {titleIcon}
          <h1>{title}</h1>
        </div>
        <label className="brizo-settings-search">
          <MagnifyingGlass size={16} aria-hidden="true" />
          <input
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
          />
        </label>
      </header>

      <div className="brizo-settings-layout">
        <nav className="brizo-settings-nav brizo-library-nav" aria-label={`${title}分类`}>
          {navigation}
        </nav>
        <main className="brizo-settings-content brizo-library-content">
          {children}
        </main>
      </div>
    </section>
  );
}

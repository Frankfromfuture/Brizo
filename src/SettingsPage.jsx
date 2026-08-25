import { useEffect, useMemo } from "react";
import {
  ArrowUUpLeft,
  Brain,
  Browsers,
  CirclesFour,
  DownloadSimple,
  EyeSlash,
  GlobeHemisphereWest,
  Info,
  Key,
  Leaf,
  MagnifyingGlass,
  PuzzlePiece,
  Rocket,
  ShieldCheck,
  SidebarSimple,
  UserCircle,
} from "@phosphor-icons/react";
import brizoLogoUrl from "../logo.svg";
import { SETTINGS_SECTIONS } from "./settings/settingsCatalog.js";
import { SettingsSectionContent } from "./settings/SettingsSections.jsx";

const SECTION_ICONS = {
  accessibility: EyeSlash,
  ai: Brain,
  appearance: CirclesFour,
  autofill: Key,
  defaultBrowser: Browsers,
  downloads: DownloadSimple,
  extensions: PuzzlePiece,
  help: Info,
  languages: GlobeHemisphereWest,
  onStartup: Rocket,
  people: UserCircle,
  performance: Leaf,
  privacy: ShieldCheck,
  reset: ArrowUUpLeft,
  search: MagnifyingGlass,
  system: SidebarSimple,
};

export function SettingsPage({
  actions = {},
  activeSection = "people",
  onSectionChange,
  state = {},
}) {
  const query = state.settingsQuery || "";
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter((section) => (
      `${section.label} ${section.keywords}`.toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [normalizedQuery]);
  const resolvedSection = visibleSections.some((section) => section.id === activeSection)
    ? activeSection
    : visibleSections[0]?.id || "";
  const resolvedState = {
    ...state,
    accountProfile: state.accountProfile || { name: "本地用户", email: "" },
    appPreferences: state.appPreferences || {},
    siteHygienePreferences: state.siteHygienePreferences || {},
  };

  const navigate = (sectionId) => {
    if (!SETTINGS_SECTIONS.some((section) => section.id === sectionId)) return;
    onSectionChange?.(sectionId);
  };

  useEffect(() => {
    if (resolvedSection && resolvedSection !== activeSection) {
      onSectionChange?.(resolvedSection);
    }
  }, [activeSection, onSectionChange, resolvedSection]);

  return (
    <section className="brizo-settings-page" aria-label="Brizo 设置">
      <header className="brizo-settings-header">
        <div className="brizo-settings-title">
          <img src={brizoLogoUrl} alt="" aria-hidden="true" />
          <h1>设置</h1>
        </div>
        <label className="brizo-settings-search">
          <MagnifyingGlass size={16} aria-hidden="true" />
          <input
            aria-label="搜索设置"
            placeholder="搜索设置"
            value={query}
            onChange={(event) => actions.updateSettingsQuery?.(event.target.value)}
          />
        </label>
      </header>

      <div className="brizo-settings-layout">
        <nav className="brizo-settings-nav" aria-label="设置分类">
          {visibleSections.map((section) => {
            const Icon = SECTION_ICONS[section.id] || Info;
            const isActive = resolvedSection === section.id;
            return (
              <div className={section.dividerBefore ? "brizo-settings-nav-item has-divider" : "brizo-settings-nav-item"} key={section.id}>
                <button
                  className={isActive ? "is-active" : ""}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => navigate(section.id)}
                >
                  <Icon size={17} weight={isActive ? "bold" : "regular"} aria-hidden="true" />
                  <span>{section.label}{section.pending ? <small>（待定）</small> : null}</span>
                </button>
              </div>
            );
          })}
          {!visibleSections.length ? <span className="brizo-settings-no-match">无匹配项</span> : null}
        </nav>

        <main className="brizo-settings-content">
          {normalizedQuery && visibleSections.length ? (
            <div className="brizo-settings-search-results" aria-label="设置搜索结果">
              {visibleSections.map((section) => (
                <SettingsSectionContent
                  actions={actions}
                  key={section.id}
                  onNavigate={navigate}
                  section={section.id}
                  state={resolvedState}
                />
              ))}
            </div>
          ) : resolvedSection ? (
            <SettingsSectionContent
              actions={actions}
              onNavigate={navigate}
              section={resolvedSection}
              state={resolvedState}
            />
          ) : (
            <div className="brizo-settings-empty-results" role="status">没有匹配的设置</div>
          )}
        </main>
      </div>
    </section>
  );
}

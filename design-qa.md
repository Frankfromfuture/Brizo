## 2026-08-26 — Bookmark editor / tab hover-card frame parity correction

**Comparison Target**

- Source visual truth: the existing rendered tab hover card in `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/tab-hover-card-spacing-2026-08-26.jpeg` (1152 × 768 px).
- Focused source evidence: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/tab-hover-card-frame-focused-2026-08-26.jpeg` (180 × 120 px).
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/design-qa-bookmark-editor-exact-hover-frame.jpg` (331 × 677 px).
- Focused implementation evidence: `/Users/frankfan/Desktop/Project/Brizo/design-qa-bookmark-editor-exact-hover-frame-focused.jpg` (321 × 275 px).
- State: an ordinary external page is selected and the address-toolbar bookmark editor is open. The comparison is scoped to the floating surface's outer frame because the two components intentionally contain different controls and have different dimensions.
- Density normalization: all captures are one output pixel per CSS pixel. The focused crops preserve native pixels; outer-frame equality is additionally verified from browser-computed CSS rather than inferred from differently sized content crops.

**Findings**

- No actionable P0, P1, or P2 difference remains in the requested outer frame.
- Spacing and layout rhythm: both components now consume the same shared CSS rule and compute to `padding: 14px 14px 12px`, `border-radius: 14px`, and `box-sizing: border-box`. This restores the same top/side/bottom breathing space at the floating-surface boundary.
- Colors and visual tokens: both compute to the neutral `rgb(248, 248, 248)` surface and the same `1px solid rgba(255,255,255,.9)` white hairline.
- Elevation: both consume the same two-layer shadow: `0 8px 24px rgba(45,50,46,.12), 0 1px 4px rgba(45,50,46,.08)`.
- Fonts and typography: unchanged from the selected editor anatomy; no typography change was requested in this correction.
- Image quality and asset fidelity: the correction affects only CSS outer-frame material. Existing Phosphor controls remain crisp vector assets; no new raster or approximate asset was introduced.
- Copy and content: unchanged; `编辑收藏夹`, `管理收藏夹`, `删除`, and `完成` remain intact.

**Comparison History**

- Pass 1 / user-reported P2: the authored `.bookmark-toolbar-editor` block contained hover-card-like values, but a later equal-specificity generic `.bookmark-editor` rule won the cascade. Browser-computed output was therefore `5px` padding, `10px` radius, `1px solid rgba(0,0,0,.16)` border, and the generic menu shadow. The prior visual QA incorrectly judged the authored declaration instead of the computed result.
- Fix: the hover card and toolbar bookmark editor now share one later `.collapsed-tab-hovercard, .bookmark-toolbar-editor` outer-frame rule. This rule is the single source of truth and wins over the generic editor material.
- Pass 2: the browser-computed editor values exactly match the hover-card rule for padding, border, radius, background, and both shadow layers. The focused visual comparison confirms the same pale hairline, 14 px corner profile, and light outward elevation. No P0–P2 correction remains.

**Interaction And Runtime Checks**

- Address-toolbar bookmark button → editor open: passed.
- Existing editor inputs and actions remain unchanged and visible.
- Browser console errors after hot reload and opening the corrected editor: none.
- `npm run build`: passed and regenerated the production `dist` output.
- Packaged desktop preview: restarted with `npm run desktop:run` against the corrected production build; no startup error was emitted.

**Implementation Checklist**

- [x] Remove the generic menu material's cascade override from the rendered result.
- [x] Share one exact outer-frame rule between the tab hover card and bookmark editor.
- [x] Verify browser-computed padding, border, radius, background, and shadow.
- [x] Compare focused visual evidence and retain existing editor behavior.

final result: passed

---

## 2026-08-26 — Toolbar bookmark editor redesign

**Comparison Target**

- Source visual truth: `/var/folders/cj/fpsmzyhn5hd3dgl4lyjvw6c40000gn/T/codex-clipboard-f487d176-7368-4c2d-b581-dfffb7f5e11c.png`
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/design-qa-bookmark-editor-v2.jpg`
- Focused implementation evidence: `/Users/frankfan/Desktop/Project/Brizo/design-qa-bookmark-editor-focused.jpg`
- Open folder-tree evidence: `/Users/frankfan/Desktop/Project/Brizo/design-qa-bookmark-folders.jpg`
- State: ordinary external webpage selected; toolbar star editor open with the name field selected. A second capture shows the folder list open across three nested levels.
- Browser viewport and implementation pixels: 1247 × 720 CSS px and 1247 × 720 output px at one output pixel per CSS pixel. The rendered dialog measures 320 × 240.25 CSS px.
- Source pixels: 700 × 612. Its macOS browser chrome and 642 px-wide dialog indicate an approximately 2× source capture, giving an approximately 321 px-wide CSS dialog. The focused comparison therefore normalizes by visible component scale rather than resizing the full surrounding browser frame.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the dialog uses the project-bundled HarmonyOS Sans SC face with upright 17 px/600 title text, 12.5 px labels and field copy, and restrained 12 px actions. The hierarchy and selected-name state follow the source without reintroducing italic UI text.
- Spacing and layout rhythm: the dialog matches the source's compact 320 px footprint and vertically stacked field anatomy. Its outer 14 px radius, white hairline, 14 px content inset, control spacing, and soft two-layer shadow exactly reuse the tab hover-card geometry requested by the user.
- Colors and visual tokens: the neutral near-white floating surface, gray controls, subtle gold-gray focus ring, pale hover states, and dark primary completion button use existing Brizo menu tokens. The source's darker webpage background is intentionally not copied into the unrelated Brizo page canvas.
- Image quality and asset fidelity: the reference contains only standard UI icons. The close, folder, caret, selected-folder, and check controls use the established Phosphor/project icon components. No emoji, placeholder, handcrafted SVG, CSS-drawn icon, or generated raster asset was introduced.
- Copy and content: `编辑收藏夹`, `名称`, `文件夹`, `删除`, and `完成` follow the selected reference. The source's `更多` action is intentionally replaced with the requested explicit `管理收藏夹` action.
- Folder hierarchy: first-, second-, and third-level folder rows advance by 18 px per level; the open-state capture shows `Research → Protein structure → Tools / Papers` as a clearly staggered hierarchy while preserving deeper levels.

**Interaction And Runtime Checks**

- Toolbar star → bookmark editor: passed; the current page is added and its name field receives selected focus.
- Folder trigger → hierarchical listbox: passed; the current folder is selected, nested rows are visibly indented, and choosing a row retains the existing folder-update path.
- `管理收藏夹` → existing reusable `brizo://bookmarks` tab: passed.
- Close, Delete, and Done remain connected to the existing close/remove/retain behavior; destructive deletion was not invoked during visual QA.
- Browser-rendered console errors after opening the editor, opening/closing the folder list, and navigating to the organizer: none.
- `npm run build`: passed and regenerated `dist/client`, `dist/server`, and `dist/.openai/hosting.json`.
- Packaged desktop launch: `npm run desktop:run` loaded the latest production output without runtime errors.
- No smoke or automated suite was run, per project instructions.

**Comparison History**

- Pass 1: the first render exposed a P2 hierarchy mismatch: the compact shared-menu header reduced the title and introduced a divider absent from the source. The toolbar editor now overrides that compact context style with a 17 px title, no divider, and source-like vertical field anatomy.
- Pass 2: focused source/implementation inspection confirmed the 320 px scale, rounded surface, field rhythm, raised secondary controls, dark completion control, and explicit close affordance. The open folder-tree capture confirmed the requested three-level stagger. No P0–P2 correction remains.

**Implementation Checklist**

- [x] Match the hover card's outer radius, border, inset, surface, and shadow.
- [x] Rebuild the toolbar bookmark editor with header, vertical fields, and reference button layout.
- [x] Replace `更多` with a working `管理收藏夹` action.
- [x] Show clear first-, second-, and third-level folder indentation.
- [x] Preserve existing bookmark creation, editing, folder selection, deletion, and completion behavior.
- [x] Verify the rendered states and production build.

final result: passed

---


## 2026-08-25 — 收藏夹与独立历史记录的设置页设计语言

**Comparison Target**

- Source visual truth: `/Users/frankfan/Desktop/Project/Brizo/qa/library-settings-source.png`
- Bookmark implementation: `/Users/frankfan/Desktop/Project/Brizo/qa/bookmarks-settings-language-final.png`
- History implementation: `/Users/frankfan/Desktop/Project/Brizo/qa/history-settings-language-final.png`
- Full-view combined evidence: `/Users/frankfan/Desktop/Project/Brizo/qa/library-settings-language-comparison.png`
- Focused combined evidence: `/Users/frankfan/Desktop/Project/Brizo/qa/library-settings-language-comparison-focused.png`
- State: the source is the existing `brizo://settings` account root; the bookmark page is open on `Research / Protein structure / Papers` with real rows visible; the history page is open on the independent `brizo://history/search` route.
- Viewport: 1280 × 720 CSS px. All three browser captures are 1280 × 720 px. The browser reported DPR 2, while its screenshot API returned one output pixel per CSS pixel, so the three artifacts required no further density normalization.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: all three pages resolve to the project-bundled HarmonyOS Sans SC face. The 20 px page title, 16 px section heading, 13 px rows, 11 px secondary copy, 600 selected navigation weight, truncation, and line heights follow the visible Settings source.
- Spacing and layout rhythm: both new pages reuse the exact 64 px header, `240px / 568px / remaining` grid, 40 px column gap, 226 px navigation rail, 222 × 32 px navigation pills, 36 px search field, 8 px card radius, hairline dividers, and centered content column from Settings. Bookmark rows intentionally use 52 px instead of 50 px to fit a readable title and URL without changing the card rhythm.
- Colors and visual tokens: white canvas, neutral gray hierarchy, card frame/shadow, pale gray-gold selected state, darker gray-gold selected foreground, hover tint, focus ring, and CTA treatments all come from the existing `--brizo-settings-cta*` variables.
- Image quality and asset fidelity: the visible Brizo title asset is the same project logo used by Settings. Bookmark favicons use the existing real favicon pipeline; category, folder, search, edit, open, overflow, and delete icons use the established Phosphor/project icon libraries. No emoji, placeholder, CSS-drawn icon, or handcrafted SVG was introduced.
- Copy and content: the bookmark page keeps real folder names, titles, URLs, counts, and actions. The independent history page uses the concise `浏览记录` / `搜索记录` categories, truthful empty states, and the same search/header language as Settings.

**Interaction And Runtime Checks**

- Settings `整理收藏夹` action → reusable `brizo://bookmarks` internal tab: passed.
- Settings menu `历史记录` action → reusable standalone `brizo://history` internal tab: passed; it no longer opens the old modal.
- Bookmark folder navigation through `Research → Protein structure → Papers`: passed. Parent branches expand automatically and the current deep folder remains visibly selected with the gray-gold bold state.
- Bookmark row controls remain connected to select, open, edit, overflow, copy, delete, and drag logic; the manual preview exercised the non-destructive folder/navigation path.
- History `浏览记录` / `搜索记录` switch: passed; the active category, content heading, and internal address update together to `brizo://history` or `brizo://history/search`.
- Browser-rendered console errors after reload, page entry, nested-folder navigation, and history switching: none.
- `npm run build`: passed and regenerated `dist/client`, `dist/server`, and `dist/.openai/hosting.json`. No smoke or automated suite was run, per project instructions.

**Comparison History**

- Pass 1: the first rendered bookmark card exposed a P2 alignment issue—folder text inherited centered grid alignment and sat far from its icon. The list main control now explicitly left-aligns its grid items; the revised row begins at the same content inset as Settings rows.
- Pass 2: navigating through content into a deep folder exposed a P2 state issue—the selected folder could be hidden inside collapsed ancestors. Folder selection now expands its full parent chain before rendering the active gray-gold pill.
- Pass 3: the full and focused combined inputs show matching header/search geometry, navigation width and selected treatment, centered content column, type hierarchy, card material, white canvas, and interaction state. No P0–P2 correction remains.

**Implementation Checklist**

- [x] Reuse the Settings page shell instead of maintaining a second fixed-position organizer layout.
- [x] Keep all real bookmark data and existing organizer actions connected.
- [x] Add one reusable standalone History internal page with real browser/search data.
- [x] Apply the shared gray-gold selected, CTA, hover, focus, and card language.
- [x] Verify both desktop pages in the open local browser preview.

final result: passed

---

## 2026-08-26 — Interactive page-tab hover card

**Comparison Target**

- Source visual truth: `/var/folders/cj/fpsmzyhn5hd3dgl4lyjvw6c40000gn/T/codex-clipboard-74af5459-8d43-4cf1-826e-3bc73b18ed1d.png`
- Desktop implementation evidence: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/tab-hover-card-spacing-2026-08-26.jpeg`
- State: expanded page-tab sidebar with an ordinary external-page tab hover card open to the sidebar's right.
- Desktop viewport: 1152 × 768 CSS px; card width is exactly 180 CSS px.

**Findings**

- No actionable P0, P1, or P2 visual differences remain.
- Anatomy matches the reference: softly elevated neutral card, rounded outer edge, bold clamped title, muted registrable domain, generous internal spacing, and an evenly distributed bottom icon row.
- The requested action set replaces the reference's actions in the exact order: pin, show in new window, bookmark, delete.
- The title clamps to two lines with an ellipsis; the domain is reduced to the registrable domain and omitted for tabs without a real HTTP(S) address.
- The card's left edge resolves exactly 10 px to the right of the sidebar/browser-surface visual boundary rather than to an individual tab's text width and remains clamped to the visible window.
- The domain-to-control gap and control-to-lower-edge gap both resolve from the same 12 px spacing token; no flexible spacer remains between them.

**Interaction And Runtime Checks**

- Ordinary external-page tab hover: passed in the packaged Electron desktop runtime.
- Keyboard semantics: the card is exposed as a labelled dialog with a labelled four-action toolbar.
- Card controls: pin/unpin, new Brizo webpage window, add/remove bookmark, and delete are wired to real product actions; invalid URL actions and the last-tab delete state are disabled.
- Production build: `npm run build` passed and refreshed `dist`.
- Desktop launch: `npm run desktop:run` loaded `dist/client/index.html` and exposed the hover card above the isolated webpage surface.

**Implementation Checklist**

- [x] Use a fixed 180 px card exactly 10 px to the right of both expanded and collapsed page-tab sidebar boundaries.
- [x] Render the bold truncated title and registrable domain.
- [x] Match the domain-to-controls and controls-to-lower-edge spacing at 12 px.
- [x] Keep pointer and keyboard movement into the interactive card stable.
- [x] Add a trusted renderer-to-main bridge for the real new-window action.
- [x] Record the durable interaction decision in `AGENTS.md`.

final result: passed

---

## 2026-08-25 — Settings selected navigation emphasis

**Visual Target**

- User direction: make both the selected Settings navigation label and its icon bold.
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/qa/settings-active-nav-bold.png`

**Findings**

- The selected navigation label renders at 600 weight; inactive labels remain at 400.
- The selected category icon uses Phosphor's `bold` weight; inactive icons remain `regular`.
- The restored Chrome-derived navigation geometry and pale gray-gold selected background are unchanged.
- No horizontal overflow or renderer console/runtime error was found after a clean reload.
- `npm run build`: passed and regenerated the production desktop/Sites artifacts. No smoke or automated suite was run, per project instructions.

final result: passed

---

## 2026-08-25 — New-tab ASK / USE expanding capsule

**Comparison Target**

- Source visual truth: `/var/folders/cj/fpsmzyhn5hd3dgl4lyjvw6c40000gn/T/codex-clipboard-f5489852-e9f0-4e75-99b8-df672737b633.png`
- Browser-rendered ASK state: `/Users/frankfan/Desktop/Project/Brizo/qa/ask-use-toggle-ask.jpg`
- Browser-rendered USE state: `/Users/frankfan/Desktop/Project/Brizo/qa/ask-use-toggle-use.jpg`
- Focused comparison evidence: `/Users/frankfan/Desktop/Project/Brizo/qa/ask-use-toggle-comparison.jpg`
- Focused ASK crop: `/Users/frankfan/Desktop/Project/Brizo/qa/ask-use-toggle-ask-crop.jpg`
- Focused USE crop: `/Users/frankfan/Desktop/Project/Brizo/qa/ask-use-toggle-use-crop.jpg`
- State: idle Brizo new-tab composer, first with ASK selected and then with USE selected.
- Browser viewport and implementation pixels: 1280 × 720 CSS px at device scale factor 1; both full screenshots are 1280 × 720 px. The focused switch is 128 × 32 CSS px and is shown with 16 px of surrounding context in each 160 × 64 crop.
- Source pixels: 380 × 108. The reference contains three destinations, while the requested Brizo adaptation contains two; comparison therefore evaluates the selected-expands/inactive-compresses anatomy, proportions, material, and icon/text states rather than identical total width.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the selected segment shows only `ASK` or `USE` in the existing 11 px Brizo UI face with centered compact weight. The inactive segment contains no hidden visible label, matching the reference's icon-only compressed state.
- Spacing and layout rhythm: the outer control is a 128 × 32 px capsule with a 3 px inset. Its selected segment expands to 78 px while the inactive segment compresses to 44 px; the white indicator and segment widths slide together on the shared Remocn easing without moving adjacent composer controls.
- Colors and visual tokens: the outer capsule uses the requested deep gray `#292929`; the selected surface uses near-white `#fafafa`, dark selected copy, and restrained white inactive glyphs. The subtle inset line and compact shadow reproduce the supplied dark-pill/white-chip depth without importing unrelated reference styling.
- Image quality and icon fidelity: the source contains only standard UI glyphs. Brizo uses the project-bundled Remocn Star and Monitor icons; no emoji, CSS-drawn icon, handcrafted SVG, raster placeholder, or generated asset was introduced.
- Copy and content: ASK selected shows only `ASK` and a Monitor icon for inactive USE. USE selected shows only `USE` and a Star icon for inactive ASK, exactly matching the requested state rules.

**Interaction And Runtime Checks**

- ASK → USE and USE → ASK through the semantic radio controls: passed.
- Checked state, placeholder change, direct-search-tool collapse in USE, and restoration in ASK: passed.
- Keyboard semantics remain native radios with explicit `ASK 模式` and `USE 模式` accessible names; the decorative visible content is hidden from duplicate announcement.
- Reduced motion removes the sliding/resizing/content entrance animation while preserving both visual states.
- No browser-side interaction exception, failed render, or JavaScript dialog surfaced during repeated switching. The Codex in-app browser surface does not expose a separate live console stream.
- `npm run build`: passed and regenerated the production desktop/Sites artifacts. No smoke or automated suite was run, per project instructions.

**Comparison History**

- Pass 1: the focused combined evidence showed the reference's deep rounded rail, high-contrast white active chip, expanded selected state, and compressed icon-only alternatives all represented in both Brizo states. No P0–P2 correction was required.

**Implementation Checklist**

- [x] Use a deep-gray capsule with a white selected pill.
- [x] Expand the selected item and compress the inactive item.
- [x] Show selected mode text only.
- [x] Show Star for inactive ASK and Monitor for inactive USE.
- [x] Preserve native radio interaction and reduced-motion behavior.

final result: passed

---

## 2026-08-25 — Settings gray-gold CTA palette

**Visual Target**

- User direction: replace Chrome-blue and green Settings action colors with Brizo's browser gray-gold palette; use a lighter gray-gold tint for selected and hovered backgrounds.
- Verified desktop preview: `/Users/frankfan/Desktop/Project/Brizo/qa/settings-gray-gold-cta.png`

**Findings**

- Active navigation uses the pale gray-gold selection tint with a darker gray-gold label and icon.
- Checked toggles, radio controls, focus treatments, outlined action buttons, API configured states, save confirmations, profile accents, and About confirmation all use the shared Settings gray-gold tokens.
- Pending and disabled controls remain neutral gray; error messages remain red so status meaning is preserved.
- The selected background is intentionally lighter than the CTA fill and does not overpower the neutral Chrome-style canvas.
- No horizontal overflow, plaintext API credential, or renderer console/runtime error was found in the final desktop check.
- `npm run build`: passed and regenerated the production desktop/Sites artifacts. No smoke or automated suite was run, per project instructions.

final result: passed

---

## 2026-08-25 — Complete Chrome Settings architecture in Brizo

**Comparison Target**

- Source visual truth: `/Users/frankfan/Desktop/Project/Brizo/qa/chrome-settings-complete-source.png`
- Appearance implementation: `/Users/frankfan/Desktop/Project/Brizo/qa/chrome-settings-complete-implementation-pass-4.png`
- Final API Settings state: `/Users/frankfan/Desktop/Project/Brizo/qa/chrome-settings-complete-implementation-final.png`
- Full side-by-side evidence: `/Users/frankfan/Desktop/Project/Brizo/qa/chrome-settings-source-vs-implementation.png`
- Focused side-by-side evidence: `/Users/frankfan/Desktop/Project/Brizo/qa/chrome-settings-source-vs-implementation-focused.png`
- State: the reusable internal Settings tab is open on `brizo://settings/appearance` for source comparison; the retained desktop preview ends on `brizo://settings/ai` so the two direct API Key controls are visible.
- Implementation viewport: 1440 × 960 CSS px at device scale factor 2; screenshot 2880 × 1920 px. The renderer-owned Settings page occupies 1236 × 854 CSS px inside the existing Brizo desktop shell.
- Source pixels: 1097 × 653. The implementation source-comparison crop was taken from the exact Settings page origin and normalized to 1097 × 653 before the combined inspection; the source capture does not declare its device density.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Information architecture: all sixteen current desktop Chrome categories appear in the same order and separator groups. Chrome/Google product names are adapted only where the setting belongs to Brizo; unavailable categories and controls carry the literal `（待定）` suffix.
- Layout and density: the implementation matches the Chrome title/search header, 226 px left rail, compact 32 px navigation rows, selected blue pill, narrow centered content column, 8 px cards, hairline row dividers, and native toggle/select geometry. The Brizo shell and address toolbar remain outside the copied Settings surface by design.
- Typography and color: the established bundled Brizo UI font remains in use while scale, weight, gray hierarchy, Chrome-blue selection, disabled states, and white Settings canvas follow the visual source.
- Icons and assets: every Settings/category/action glyph uses the existing Phosphor/project asset pipeline. No emoji, handcrafted SVG, CSS-drawn icon, placeholder avatar, or fake source asset was introduced.
- API controls: `AI 创新功能` contains direct DeepSeek analysis and Bocha search API Key rows. Both use password inputs, render only sanitized configured status, clear plaintext renderer state after a successful save, and persist through Electron `safeStorage` rather than renderer storage.
- Accessibility and resilience: navigation and actions are semantic buttons, inputs have accessible names, disabled pending controls cannot be invoked, focus styles are visible, and the layout remains free of horizontal overflow at 1440, 1024, 760, and 640 CSS px widths. At 640 px the category rail becomes a horizontal scroller above the content.

**Interaction And Runtime Checks**

- Bottom-dock Settings menu → `设置`: passed; it opens one reusable internal tab at `brizo://settings`.
- All sixteen category routes: passed; each selected item updates the internal `brizo://settings/<section>` address and renders the matching page.
- Pending integrity: every pending content row includes `（待定）`; no pending row was found without the suffix.
- Settings search: entering `下载` reduced the rail to `下载内容` and synchronized the route; a multi-category `AI` query aggregated both matching sections; a zero-result query showed a true empty state.
- Settings route history: Back returned from `外观` to `AI 创新功能`, and Forward restored `外观`.
- Working appearance preference: `显示书签栏` removed and restored the real bookmarks bar, then returned to its original enabled state.
- Password integration: `Brizo 密码箱` opened the existing local credential manager; initial focus entered the modal, Tab wrapped inside it, Escape closed it, and focus returned to the trigger.
- Downloads integration: the save-directory reset returned to the captured system default, and `下载完成后显示下载内容` now controls the real completion popover.
- Responsive layout: at 640 CSS px the two-row header expands to 103 px, the horizontal category rail begins exactly below it, and no horizontal page overflow is present.
- API controls: both inputs are empty password fields with autocomplete disabled; configured credentials expose only sanitized masks and no key-like plaintext appears in the document.
- Renderer console/runtime errors during navigation, filtering, toggling, dialog, resize, and final AI-page checks: none.
- `npm run build`: passed and regenerated `dist/client`, `dist/server`, and `dist/.openai/hosting.json`. The standard chunk-size advisory remains non-blocking.
- No smoke or automated test suite was run because the project instructions reserve them for explicit user requests; the checks above were performed directly against the open Electron renderer.

**Comparison History**

- Pass 1: verified the new complete rail, Chrome-like page geometry, and local-profile root section inside the full Brizo shell.
- Pass 2: selected `外观`, aligned the comparison crop to the Settings page origin, removed one duplicate external-link glyph, rebuilt, and compared the complete and focused views side by side.
- Pass 3: independent coverage audits found partial or misleading rows. Missing Chrome entries were added, existing Brizo behaviors were connected, and partial functions were relabeled `（待定）`.
- Pass 4: restored Chrome's visible Appearance density, added aggregate Settings search, internal Back/Forward history, modal focus management, truthful download/search/startup states, and the final responsive/accessibility corrections.
- Final state: exercised real settings actions, audited all sixteen categories for missing pending labels, confirmed zero runtime errors, rebuilt production artifacts, and left the open desktop preview on the visible API controls in `AI 创新功能`.

final result: passed

---

## 2026-08-25 — Chromium-style `brizo://settings`

**Comparison Target**

- Source visual truth: `/Users/frankfan/Desktop/Project/Brizo/qa/chrome-settings-reference-redacted.png`
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/qa/settings-implementation-pass-4.png`
- Full-view comparison: `/Users/frankfan/Desktop/Project/Brizo/qa/settings-source-vs-implementation.png`
- Focused settings-body comparison: `/Users/frankfan/Desktop/Project/Brizo/qa/settings-source-vs-implementation-focused.png`
- State: Settings root menu action opened the reusable internal Settings tab on `搜索与 AI`.
- Implementation viewport: 1280 × 768 CSS px at device scale factor 1; screenshot 1280 × 768 px. The renderer-owned Settings page occupies 1076 × 662 CSS px inside the Brizo shell.
- Source pixels: 1273 × 768. It is a direct Chrome desktop capture with undeclared device density, so comparisons use the visible desktop scale rather than asserting a DPR.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Information architecture: the implementation preserves Chromium Settings' title/search header, left category rail, selected pill, section heading, and centered card-based content. Brizo intentionally reduces the rail to five relevant categories.
- Typography and density: all Brizo-owned text uses the bundled HarmonyOS Sans SC regular face. The compact row heights, narrow content column, rounded search field, and restrained card borders match the source hierarchy without importing Chrome's unrelated account copy.
- Color and product adaptation: Chrome blue is translated to Brizo's restrained logo-gold selection and focus language. The white Settings canvas and neutral-gray controls stay visually native to Chromium while the outer Brizo shell remains intact.
- API controls: the first section contains only the requested DeepSeek analysis key and Bocha search key rows. Inputs are password fields; configured values cross IPC only as masks and plaintext is not rendered or stored in renderer state after save.
- Image and icon fidelity: the existing Brizo logo and project icon library are used. No emoji, placeholder, handcrafted SVG, or CSS-drawn stand-in was introduced.

**Interaction And Runtime Checks**

- Bottom-dock Settings menu → `设置`: passed; it opens `brizo://settings` directly.
- Reopening Settings: passed; one reusable Settings tab remains rather than creating duplicates.
- Internal route restoration after renderer reload: passed; the address field remains `brizo://settings`.
- Category navigation: `关于 Brizo` rendered its correct section, then returned to `搜索与 AI`.
- Settings search: entering `下载` reduced the rail to `下载内容`; clearing restored all categories.
- API controls: two password rows are present, configured keys render only masked suffixes, and no key-like plaintext appears in the rendered document.
- Source/build scan found no long `sk-…` token in `src`, `electron`, `dist`, `qa`, or `AGENTS.md`.
- Renderer console/runtime errors during the route, category, and filter checks: none.
- `npm run build`: passed. No smoke or automated test suite was run because the project instructions reserve them for explicit user requests.

**Comparison History**

- Pass 1: the content column sat too low and was broader than the Chrome reference. Recorded as a P2 density mismatch.
- Pass 2: tightened the header/body overlap, rail width, grid columns, and card width; added a responsive rail-width correction.
- Pass 3: reload inspection exposed an empty address field on an already-restored Settings tab. Recorded as a P1 internal-route state mismatch.
- Pass 4: synchronized the restored tab to `brizo://settings`, rebuilt, reloaded the real Electron renderer, and repeated the full/focused comparisons. No P0–P2 issue remains.

final result: passed

---

**Comparison Target**

- Source visual truth: `/var/folders/cj/fpsmzyhn5hd3dgl4lyjvw6c40000gn/T/codex-clipboard-a454cb7f-192b-484d-bf47-0507b62b7a4f.png`
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-final.png`
- Combined comparison evidence: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-final-comparison.png`
- Full implementation viewport: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-final-full.png`
- State: Brizo new-tab page with the rightmost Settings menu open.
- Browser viewport: 342 × 684 CSS px in the Codex in-app browser.
- Source pixels: 488 × 756. The source was proportionally normalized to 292 px wide for comparison.
- Implementation menu: 292 × 370 CSS px; focused screenshot is 292 × 371 pixels because the half-pixel menu origin was rounded to the enclosing pixel.
- Density normalization: both comparison columns were rendered at 292 px width. The source is a reference crop rather than a declared @2x asset, so no device-density claim was made.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: every account and menu text node resolves to the existing Brizo UI family at exactly 12 px. The source uses a heavier sans-serif, but Brizo's established UI font and the user's explicit 12 px requirement take precedence. No secondary copy, counts, paths, or shortcut hints remain.
- Spacing and layout rhythm: the implementation preserves the reference's account row, profile row, primary destination group, separated private-window row, rounded frame, hairline dividers, and aligned icon/text/arrow columns. The shorter total height is intentional because Brizo retains its fixed brand accent and does not expose the reference browser's accent-spectrum control.
- Colors and visual tokens: the source's dark glass was intentionally translated to Brizo's requested warm shell glass—`rgba(250, 249, 246, 0.76)` with 28 px blur, restrained border, inset highlight, and soft elevation.
- Image quality and asset fidelity: the menu contains no raster imagery requiring recreation. All functional glyphs use the project's existing Phosphor icon library; no emoji, handwritten SVG, or placeholder icon was introduced.
- Copy and content: source anatomy is preserved while product-specific destinations remain truthful: `大模型护航` replaces the unrelated reference browser's extension manager. Bookmarks, downloads, password, settings, profile, and private-window actions remain functional.

**Focused Region Evidence**

- The menu itself is the focused component and is readable at comparison scale, so no additional sub-crop was necessary.
- Computed-style inspection confirmed a 292 px menu width, 370 px height, 12 px across all visible text-bearing controls, zero `<small>` elements, warm translucent background, and `blur(28px) saturate(1.18)` backdrop treatment.

**Interaction And Runtime Checks**

- Open/close from the rightmost toolbar button: passed.
- `书签` destination opens its existing dialog: passed.
- Backdrop and dialog close paths: passed.
- Browser console errors after opening and navigating from the menu: none.
- `npm run build`: passed.
- `npm run test:sites`: 4/4 passed.
- `npm run desktop:smoke`: the app rendered and emitted its diagnostic payload, but the existing broad smoke suite exited nonzero on unrelated bookmark-favicon and active-tab-border baseline expectations. The Settings popover is not part of either failing assertion; its browser-rendered interaction and visual checks above passed.

**Comparison History**

- Initial pass: the account-row button inherited a 16 px control size even though its rendered text descendants were 12 px. This was recorded as a P2 typography-token inconsistency.
- Fix: set `.settings-account-row` itself to 12 px and removed now-unused menu imports.
- Post-fix evidence: computed styles report 12 px for every queried button, strong, and span in the menu; zero small-description elements remain. The final combined comparison shows aligned grouping, density, radii, and icon columns.

**Implementation Checklist**

- [x] Match the reference account/profile/menu/private-window anatomy.
- [x] Use 12 px throughout the complete popover.
- [x] Remove all secondary explanatory copy.
- [x] Match Brizo shell glass color and transparency.
- [x] Preserve working product destinations.
- [x] Verify visually and interactively in the in-app browser.

**Follow-up Polish**

- P3: if Brizo later gains a user-selectable accent system, the reference's bottom accent control can be added as a real functional preference rather than decorative chrome.

final result: passed

---

## 2026-08-10 — 收藏夹二级菜单与双栏整理器

**Comparison Target**

- Source visual truth: `/Users/frankfan/.codex/attachments/3b4142e9-c932-4127-b7b8-c5edb913a545/image-1.png`
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/bookmark-organizer-implementation.png`
- Combined comparison evidence: `/Users/frankfan/Desktop/Project/Brizo/bookmark-organizer-comparison.png`
- State: `设置 → 收藏夹 → 整理收藏夹`, with a nested folder selected and real bookmark rows visible.
- Browser viewport and implementation pixels: 1261 × 720 CSS px at device scale factor 1; screenshot 1261 × 720 px.
- Source pixels: 2200 × 1516. It was proportionally normalized to 1045 × 720 px for the combined comparison; no density claim was made for the supplied reference.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: Brizo intentionally keeps its established Source Han Serif SC / EB Garamond UI family and the durable 13 px pop-up-menu scale instead of copying the reference's larger sans-serif. Bookmark names and essential URLs are readable, left aligned, and ellipsize within the right column.
- Spacing and layout rhythm: the source's hierarchy was preserved as a left folder tree, top search field, and right current-folder content list. The implementation is a centered pop-up rather than a full page because the requested feature is a Brizo pop-up menu; the wide 980 px frame retains the reference's file-manager proportions inside the app's shared modal system.
- Colors and visual tokens: the reference's cool white/blue file manager is translated into Brizo's warm `#faf9f6` surface, 1.5 px frame, faint shared shadow, thin dividers, and restrained gray hover/selected treatment.
- Image quality and assets: favicon rows use the real existing `BookmarkFavicon` pipeline, while all folder, edit, search, selection, overflow, copy, and delete glyphs come from the established Phosphor icon library. No placeholder image, emoji, handcrafted SVG, or CSS-drawn icon was introduced.
- Copy and content: the two second-level entries are exactly `收藏夹导入` and `整理收藏夹`. The organizer shows real hierarchy and bookmark data; the import screen keeps the real browser/HTML import paths.
- Accessibility and states: tree folders, search, selection checkboxes, edit fields, overflow/context actions, close/back controls, empty folder state, selected rows, and bulk selection actions expose semantic names and keyboard-reachable controls.

**Focused Region Evidence**

- The combined comparison contains both complete hierarchy/content compositions at readable scale. A separate sub-crop was unnecessary because the 35–40 px row rhythm, folder indentation, URL lines, hover editor, selection boxes, and overflow controls remain legible in the full implementation capture.

**Interaction And Runtime Checks**

- First-level Settings → 收藏夹, then the two-item second-level menu: passed in the Electron desktop runtime and in-app browser preview.
- 收藏夹导入 screen, browser-source loading state, HTML import action, and disabled no-selection action: passed; desktop continues to use the existing real import IPC.
- Nested left hierarchy, current-folder child-folder rows, and double-click folder traversal: passed with real nested bookmark data.
- Search across title, URL, and folder: passed.
- Hover edit control and editable name/URL form: passed without modifying the test bookmark.
- Multi-selection and bulk copy/delete tool strip: passed; destructive actions were not invoked during QA.
- Per-row overflow menu exposes copy/delete; the same action state is wired to `contextmenu`: passed.
- Drag sources and folder/bookmark drop targets are present and reuse Brizo's existing persisted bookmark/folder move algorithms. Automated pointer synthesis did not produce a native HTML drag event in the preview surface, so mutation was not performed during QA; source inspection confirms both reorder and left-tree destination paths call the existing move functions.
- Browser console warnings/errors: none.
- `npm run build`: passed.
- `npm run test:sites`: 4/4 passed.
- `npm run desktop:smoke`: emitted the complete runtime diagnostic payload but exited nonzero on pre-existing broad baseline assertions outside this feature; the new bookmark flow passed direct desktop and browser interaction checks.

**Comparison History**

- First pass: a folder containing only nested folders incorrectly showed the right-column empty state; bookmark row content also inherited a generic 28 px action-button width and appeared centered. These were P1/P2 mismatches against the reference's file-manager anatomy.
- Fixes: added direct child-folder rows to the right column, made folders draggable/reorderable, and restored the main bookmark button to full-width left-aligned content. Replaced the unreliable controlled native selection input with a semantic icon checkbox button.
- Post-fix evidence: `/Users/frankfan/Desktop/Project/Brizo/bookmark-organizer-implementation.png` and `/Users/frankfan/Desktop/Project/Brizo/bookmark-organizer-comparison.png` show nested navigation, left-aligned bookmark rows, the hover edit action, and the final dual-column proportions.

**Implementation Checklist**

- [x] Add 收藏夹二级菜单 with 收藏夹导入 and 整理收藏夹.
- [x] Keep browser and HTML import functional in a standards-compliant pop-up.
- [x] Implement the two-column folder-tree/current-folder organizer.
- [x] Support bookmark/folder drag ordering and moves into left-side directories.
- [x] Support hover editing of bookmark name and URL.
- [x] Support right-click/overflow copy and delete actions.
- [x] Support multi-selection and batch actions.
- [x] Persist changes through the existing real bookmark library and folder-order stores.

**Follow-up Polish**

- P3: if a future Brizo design allows the organizer to become a dedicated full-page surface, its modal scrim can be removed and the same two-column body can expand to the full canvas without changing the data interactions.

final result: passed

---

## 2026-08-10 — Shared pop-up menu system and Settings utilities

**Comparison Target**

- Source visual truth: `/Users/frankfan/.codex/attachments/7d0dce9c-6b0a-4bf4-afd8-c8a06b28d8f3/image-1.png`
- Browser-rendered implementation: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-13px-implementation.png`
- Full desktop evidence: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-13px-full.png`
- Side-by-side comparison evidence: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-13px-comparison.png`
- State: Brizo's rightmost Settings menu open on the default new-tab page at 100% page zoom.
- Desktop app viewport: 1152 × 768 CSS px. The system capture is a 3420 × 2214 px @2x desktop screenshot that also contains surrounding desktop windows; the focused implementation crop is 520 × 1080 px.
- Source pixels: 708 × 1492. Its device density is not declared.
- Density normalization: the implementation crop was proportionally normalized from 520 px to 708 px width (1471 px height) beside the 708 px source. The comparison judges menu anatomy and rhythm, not unrelated desktop chrome.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the implementation uses the shared Brizo UI family at 13 px for pop-up menu labels. Weight, truncation, and icon/text alignment remain consistent; no shortcut hints or fragmented secondary explanations were introduced.
- Spacing and layout rhythm: ordinary rows resolve to the shared 35 px pitch, the compact menu is 234 px wide, grouping uses a thin divider with 3 px breathing space, and row padding does not add hidden vertical height. The account row remains the intentional identity exception.
- Colors and visual tokens: the source's dark Chrome surface is intentionally translated into Brizo's warm translucent `#faf9f6` language. Gray rounded hover/focus surfaces, restrained hairlines, and soft elevation preserve the source hierarchy without copying Chrome's theme.
- Image quality and asset fidelity: there is no raster content inside the menu. Visible controls use the existing Phosphor/project icon language; no emoji, CSS drawings, or placeholder graphics were added.
- Copy and content: the reference's password, history, downloads, bookmarks, zoom, settings, and private-window anatomy is preserved with Brizo-specific naming. Browser functions that do not belong to Brizo were omitted instead of shown as decorative placeholders.
- Accessibility and interaction: menu items expose semantic labels, zoom buttons expose named controls and disabled bounds, dialogs retain close/back paths, and focus/hover surfaces use the same rounded gray state.

**Focused Region Evidence**

- The focused implementation crop contains the complete menu at readable scale, so no smaller typography sub-crop was needed.
- The side-by-side comparison shows the source and implementation together at equal normalized width. It confirms the account/profile hierarchy, functional cluster, zoom control, separators, icon column, destination chevrons, and private-window action.

**Interaction And Runtime Checks**

- Menu open/close: passed in the real Electron desktop runtime.
- Zoom: 100% → 110% → 100% reset passed; the menu remained fixed while the page scale changed.
- Password vault: empty state and add/edit form opened; encrypted save/edit/reveal/delete behavior passed its unit test. No credential was entered during visual QA.
- History: combined 网页/搜索 tabs and empty state opened; row removal and clearing persist through the existing local stores.
- Bookmarks: browser detection, import selection, HTML import action, and the searchable management tab opened with real bookmark data and edit/delete controls.
- Downloads: native desktop runtime smoke passed; records retain open/reveal behavior and can be cleared without deleting files.
- `npm run build`: passed.
- `npm run test:password`: 1/1 passed.
- `npm run test:sites`: 4/4 passed.
- `npm run desktop:smoke`: passed.
- `npm run desktop:browser-smoke`: passed.
- Console/runtime errors during the tested menu and dialog interactions: none observed.

**Comparison History**

- Earlier implementation used 12 px menu text, taller/wider visual density, and separate Settings destinations without a real zoom or unified history/bookmark management flow.
- Fixes applied: shared 13 px/35 px/234 px tokens, unified first- and second-level menu styling, compact gray rounded hover/focus feedback, working page zoom, safeStorage password vault, combined history, native download record control, and bookmark import plus management.
- Post-fix evidence: `/Users/frankfan/Desktop/Project/Brizo/tmp/design-qa/settings-menu-13px-comparison.png`; desktop accessibility inspection exposed every new functional destination and the 100%/110%/100% zoom state changes.

**Implementation Checklist**

- [x] Apply one 13 px / 35 px pop-up menu system to existing first- and second-level menus.
- [x] Keep compact 234 px standard width with content-driven exceptions.
- [x] Use gray rounded hover/focus feedback and restrained dividers.
- [x] Add functional zoom, password, history, downloads, and bookmark utilities.
- [x] Remove placeholder-only cards and explanatory fragments.
- [x] Record the durable decisions in `AGENTS.md`.
- [x] Verify build, Sites packaging, desktop runtime, external-page runtime, and visual comparison.

**Follow-up Polish**

- P3: a future full-screen command could be added beside zoom if Brizo exposes a dedicated product action; it was not included as decorative reference chrome.

final result: passed

## 2026-09-04 浏览记忆

新增本地历史导入、使用偏好画像与历史网址/标题联想，沿用设置页的卡片、字体和颜色。支持 Chrome、Edge 及列出的 Chromium/Firefox 配置；以后台 SQLite 一致性快照读取，保留逐次访问记录，重复导入按来源去重。Ask/Use 使用相关域名，明确指定网站时跳过偏好选站。

一次生产构建通过；桌面真实导入 Chrome 与 Edge 得到 2,841 条访问记录、2,605 个不同网页。导入中发现 Chromium 1601 纪元微秒值超过 JS 安全整数，改用 SQLite int64 读取后完成导入。地址栏站点名与含空格的标题关键词均显示历史结果，标题关键词仍保留三种搜索入口。网页预览正确提示桌面功能不可用。未运行自动化测试或外部模型完整任务；Firefox、Windows、Linux 的导入路径尚未实机验证。

## 2026-09-04 收藏夹浏览权重叠加

收藏夹排序改为导入浏览器访问次数与 Brizo 访问次数相加；Brizo 普通历史、浏览记忆和收藏夹点击计数重叠时取较大值，避免重复累加。网站首页汇总该站访问，独立子域首页仅汇总对应子域，深层页面使用该页访问。收藏夹栏、级联菜单和管理页共用权重；手动顺序保持原始数据，关闭时直接恢复。开关位于设置 → 智能浏览，默认开启。

一次 npm run build 通过。浏览器预览已确认开关关闭与重新开启，页面无渲染错误；桌面重载及真实收藏夹顺序检查暂被 macOS 锁屏阻止，已请用户解锁。未运行自动化测试。

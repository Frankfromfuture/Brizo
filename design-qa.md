# Brizo Bookmark Sidebar Design QA

- Source visual truth: `/var/folders/cj/fpsmzyhn5hd3dgl4lyjvw6c40000gn/T/codex-clipboard-30cdbf13-b361-4e54-a5e8-95f7913faece.png`
- Implementation screenshot: `/Users/frankfan/Desktop/Project/Brizo/brizo-bookmark-sidebar-final.png`
- Combined comparison: `/Users/frankfan/Desktop/Project/Brizo/brizo-bookmark-sidebar-comparison.png`
- Viewport: 1440 × 900 CSS px
- Source pixels: 618 × 1414
- Implementation pixels: 1440 × 900
- Density normalization: implementation captured at 1 CSS px per screenshot pixel; source resized to the implemented 169 px sidebar width for focused comparison
- State: light theme, 收藏夹 selected, Research folder expanded

## Full-view comparison evidence

The full implementation keeps Brizo's existing logo header, model guard footer, 169 px rail, and browser chrome. Within that product-owned frame, the bookmark controls and tree follow the supplied GitHub explorer hierarchy: view selector, search field, then compact expandable rows.

## Focused region comparison evidence

The combined comparison aligns both sidebars at 169 px wide. The control heights, thin gray outlines, compact tree indentation, chevrons, filled folders, single-line truncation, and hover/selected row treatment match the reference language. Brizo intentionally substitutes Chinese product labels and its sampled logo gold for GitHub blue.

## Required fidelity surfaces

- Fonts and typography: existing Brizo Harmony CJK and Inter stack retained; compact 10–11.5 px UI hierarchy matches the narrow rail.
- Spacing and layout rhythm: selector and search use equal 37 px heights with a 7 px gap; tree rows use 34–35 px rhythm and progressive 13 px indentation.
- Colors and visual tokens: neutral white/gray GitHub-like surfaces retained; folder fill uses Brizo logo gold `#a58c5e`.
- Image quality and asset fidelity: no new raster assets were required; existing Brizo logo and real circular favicons remain unchanged. Interface icons use the existing Phosphor family.
- Copy and content: 收藏夹 / 智能收藏夹 implement the requested master-style switch; “Go to file” searches title, URL, and folder path; the future smart mode clearly states that it is not yet available.

## Interaction verification

- 收藏夹 selector opens and switches to 智能收藏夹.
- 智能收藏夹 renders the future-feature state.
- Switching back restores the real bookmark tree.
- “Go to file” filtered for `AlphaFold` and automatically expanded all matching folder ancestors.
- Search clear restored the normal tree.
- Browser console errors: none.

## Findings

No actionable P0, P1, or P2 mismatches remain. The persistent Brizo logo header and model guard footer are intentional product constraints outside the referenced GitHub tree component.

## Comparison history

- Initial implementation used regular outline folder glyphs, which read weaker than the filled GitHub folders.
- Fix: changed closed and open folder glyphs to filled Phosphor variants and applied the sampled Brizo gold.
- Post-fix evidence: `brizo-bookmark-sidebar-final.png` and `brizo-bookmark-sidebar-comparison.png`.

## Follow-up polish

- P3: when more root folders are imported, confirm that the current 35 px row rhythm remains comfortable across a very long tree.

final result: passed

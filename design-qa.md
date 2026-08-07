# Brizo Brief design QA

- Source visual truth: `/var/folders/cj/fpsmzyhn5hd3dgl4lyjvw6c40000gn/T/codex-clipboard-c1523185-a695-4b52-be41-f244d92d769f.png`
- Final implementation screenshot: `/Users/frankfan/Desktop/Project/Brizo/brief-implementation-final.png`
- Combined comparison: `/Users/frankfan/Desktop/Project/Brizo/brief-design-comparison-final.png`
- Detail-state screenshot: `/Users/frankfan/Desktop/Project/Brizo/brief-report-implementation.png`
- Responsive screenshot: `/Users/frankfan/Desktop/Project/Brizo/brief-responsive-800-pass2.png`
- Reference pixels: 1514 × 1600
- Implementation pixels: 1489 × 1082 at device scale factor 1
- Desktop CSS viewport requested: 1489 × 1588; the Codex in-app browser surface captured its available 1489 × 1082 viewport.
- Responsive CSS viewport: 800 × 900 at device scale factor 1
- Density normalization: the reference was center-cropped to 1489 × 1082 without resampling and paired with the 1489 × 1082 implementation in the combined comparison.
- State: Brief selected, 全部 category, stream at top, no hover/focus treatment in the final desktop capture.

## Full-view comparison evidence

The final comparison confirms the same core Discovery hierarchy: a dominant two-column lead with a two-to-three-line headline, publication time, multi-line summary, large image, stacked source marks and source count; a three-column image-news row follows immediately. Brizo intentionally retains its existing light browser shell, POST masthead, serif typography, and category rail instead of copying Perplexity's dark palette. These product constraints do not change the requested information density or scan order.

## Required fidelity surfaces

- Fonts and typography: Brizo's bundled Source Han Serif SC / EB Garamond system is retained. Lead, card, metadata, summary, and report-body sizes establish the same large-title/editorial-summary hierarchy as the reference without broken wrapping.
- Spacing and layout rhythm: lead copy/image proportions, footer placement, three-card grid, dividers, radii, and vertical gaps are balanced at desktop and collapse cleanly at 800 px.
- Colors and tokens: the reference's dark surface is intentionally translated into Brizo's established white, charcoal, and muted-gold tokens. Contrast remains clear and metadata stays subordinate.
- Image quality: cards use real article or source images with cover crops and rounded corners; publisher favicons use circular masks. No CSS-drawn or fake replacement artwork is used.
- Copy and content: every story exposes a concrete Chinese headline, factual summary, source count, and `已发布 X 分钟/小时/天前`. Detail copy is organized as cited paragraphs and ends with five related image-news summaries.
- Icons: Phosphor clock, heart, overflow, back, refresh, close, and link icons share one outline family and remain optically aligned.
- Accessibility and states: story and source controls remain semantic buttons, Escape closes the report, focus outlines remain available, refresh/loading/error content is announced, and no horizontal overflow exists at 800 px.

## Focused region comparison evidence

- Lead footer: pass 1 showed the source stack competing with the final summary line. The footer was moved into the lead-copy flow; the final screenshot shows clean separation and preserves the reference's source-count/action anatomy.
- Responsive source stack: the first 800 px capture measured publisher icons as 20 × 340 px because a broad responsive image selector treated favicons as hero images. The selectors were restricted to each story button's direct hero image. Post-fix measurements are 20 × 20 px with a 50% circular mask in both lead and card footers.
- Detail report: the captured report opens immediately with cached title, time, sources, lead, and hero image; DOM verification found five related story controls. The page console had no errors or warnings.

## Comparison history

1. Initial desktop comparison
   - Finding [P2]: lead source footer overlapped the summary line.
   - Fix: render the lead footer inside `.brief-stream-story-copy` and use normal flow spacing.
   - Post-fix evidence: `brief-implementation-pass2.png` and final combined comparison.
2. Initial responsive comparison
   - Finding [P1]: responsive hero-image rules stretched publisher favicons to article-image height.
   - Fix: scope lead/card/wide/row image-height rules to `> button > img`.
   - Post-fix evidence: `brief-responsive-800-pass2.png`; measured lead and card favicons are 20 × 20 px, body width equals viewport width, and there is no horizontal overflow.
3. Final desktop comparison
   - No actionable P0/P1/P2 differences remain. The light palette, masthead, browser chrome, and category rail are intentional Brizo product-system adaptations.

## Findings

No actionable P0, P1, or P2 findings remain.

## Interaction checks

- Brief tab opens the stream.
- Lead story opens an in-Brief report without blanking the cached story content.
- Report displays source links and five related image-news items.
- Back closes the report and preserves the stream surface.
- 800 px responsive layout has no horizontal overflow.
- Browser console errors/warnings checked: none.

final result: passed

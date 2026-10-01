# Advisor conversation UI QA — 12 September 2026

final result: passed

Scope: approved conversation shell in the separate local synthetic prototype. Main Banking/Azure is unchanged. Previous app-wide QA remains in [UI QA](docs/ui-qa-2026-09-10.md).

## Source and comparison evidence

- Source: `docs/design-targets/advisor-conversation.png`, the third displayed image in the latest set, 1122 × 1402 pixels.
- User corrections supersede the image: voice icon inside the composer beside Send; sidebar icon replaces Close; expanded modal displays chat history alongside the active conversation; detailed voice animation deferred.
- Browser implementation: Chrome at `http://127.0.0.1:5450/`.
- Compact desktop: `artifacts/advisor-prototype/conversation-desktop.png` and `conversation-visual.png`, 1122 × 1402 CSS/pixel viewport, device scale 1. Both views were opened with the source in the same comparison input; the final header/bubble capture was separately refreshed after resetting the conversation scroll to its top.
- Expanded: `artifacts/advisor-prototype/conversation-expanded.png`, 1440 × 1000.
- Tablet Light: `artifacts/advisor-prototype/conversation-tablet-light.png`, 820 × 1180.
- Phone: `artifacts/advisor-prototype/conversation-mobile.png`, 390 × 844.
- State: Graphite, voice idle, history closed in compact mode, real generated summer-house analysis. Actual test history contains two exchanges rather than the source's single illustrative exchange; additional messages legitimately require scrolling. The generated chart is model-authored, not a replica of the source's illustrative chart. The same 2,000 DKK scenario reconciles to May 2029 / 12 months earlier / 10,000 DKK available.
- Focused comparison: header controls and bottom composer were inspected at full resolution in the source and browser captures. The requested replacements, alignment, reachable controls, and smaller unified composer are present. No separate comparison collage or pixel-perfect claim is made.

## Findings and fixes

- P1, startup: an Appearance listener initially referenced a missing element. Added the drawer control and reloaded successfully; no new JavaScript errors in subsequent browser checks. The console retained only the historical error from before this fix.
- P2, summary density: long generated fallback text dominated the bubbles. Keep a short excerpt and a user-expandable full reply. Full text remains available and persisted.
- P2, pane proportions: increased compact width and message/header type after inspecting the first implementation. Retain Banking's production text density rather than enlarging every label to the image's illustrative type scale.
- P2, scenery obstruction: background promotional text was partially covered by the enlarged pane. Removed it; final desktop captures show the scenic background and unobstructed Banking label.
- Voice correctness found during workflow QA: no-selection reads lacked calculated baseline dates and voice inferred an incorrect date. Added explicit baseline results and a no-selection distinction; actual API voice retest and the backend regression assertion confirmed May 2030 / 44 deposits / 12,000 DKK available. See `docs/advisor-conversation-ui.md`.

## Fidelity surfaces

- Typography: coherent Segoe UI host typography, larger conversation heading, readable bubbles, small secondary timestamps and footer hints. Generated artifact typography is model-owned and can vary. Long chat names wrap rather than overflow.
- Layout/rhythm: single floating pane, tonal user/assistant bubbles, inline isolated visual, starter chips, persistent composer. Expanded desktop gives history its own column; compact/phone uses an overlay. Header and composer remain outside the scrollable conversation. No page overflow at measured 390, 820 and 1122 widths.
- Colors/tokens: existing five Banking themes, tonal selection and complete focus outlines; no colored left-edge indicators. All five theme selections confirmed active after their API response. Light and Graphite visually inspected.
- Imagery/icons: reused Banking's evening-lake asset, preserving the established scenic direction. Standard outline icons are vendored Tabler v3.34.1 with MIT license. No mock image is used as the interface.
- Copy/content: actual provider replies and synthetic context; no prefilled fake conversation masquerades as a response. History is clearly browser-local. Prototype mode remains visible; detailed voice animation is intentionally deferred.

## Workflow verification

- Starter → actual Agents API response → generated HTML; typed follow-up → corrected scenario and saved version.
- New chat, independent draft, searchable history, old-chat recovery, and refresh persistence.
- Voice icon → actual GPT-Live connection → recorded synthetic speech → caption bubbles → backend read tool → provider-confirmed end. Expansion preserved the voice session. Physical microphone/speaker use was not retested.
- Generated slider → host dirty state; expand/collapse preserved its value; centered discard confirmation worked. Discard restored saved version 2 at 2,000 DKK.
- Theme changes confirmed for Graphite, Light, Slate, Sand and Forest; phone/tablet/desktop controls inspected. Drawer obscured content is inert to keyboard interaction.
- 21 automated checks passed across server, agent, voice and conversation tests. No Azure actions performed. Normal local host restored with test audio endpoints disabled.

## Remaining limitations

Browser-local chat persistence is intentionally not cross-device storage. One active analysis/voice session at a time; chat switching is blocked until the current operation ends. The main deployed app does not yet contain this prototype. Generated content remains variable and financial responses still need checking. Subjective visual acceptance belongs to Dan; no remaining observed P0/P1/P2 shell issue blocks this local preview.

## Global floating advisor — 17 September 2026

This section supersedes the earlier prototype-only shell conclusions above. Approved reference: docs/design-targets/advisor-floating-approved.png. Current implementation uses the real Banking dashboard, not the illustrative dashboard content in the reference.

- Fidelity: transparent outer overlay; separate readable bubbles and generated visual surface; retained colorful composer beam; reused state-specific particle orb with reflected light underneath. Actions animate beside the orb on hover, focus or tap. Both normal chat and voice can move independently. Expanded chat retains the existing history layout.
- Browser evidence: Chrome local Demo, desktop plus 820x1180 and 390x844. Real prompt returned read_goals and the three stored goals. Draft survived page changes and reload. Active generation remained present across Memory, Analysis, Goals and Review. New chat, expand/collapse and history remained accessible.
- Synthetic voice evidence: actual shared component and orb bundle, fake provider messages only. Orb-only start, Speaking caption, caption hide, Searching state, drag, route change and stop cleanup inspected. No live audio or spoken goodbye test performed.
- Findings fixed: unsupported 112px preset lookup (use supported 64px preset with canvas scale); excess empty-chat spacing; small history drawer (now expands when opened); caption overlapping Stop; mobile composer overlapping bottom navigation after restoring a desktop position.
- Seventeen focused Node tests passed, including actual particle painting for all four presets, reduced-motion rendering and observer cleanup. The original console errors occurred before the preset fix; corrected synthetic fixture had no console errors.
- Existing accessible button names, full focus outlines, keyboard position reset, motion preference, opaque readable surfaces and viewport bounds preserved. The reflection is a CSS effect and respects reduced motion.

Result: local visual and interaction pass for the requested floating shell. Generated layouts remain model-owned and variable. Production acceptance and physical microphone/audio testing remain separate; no deployment was performed for this change.

Final visual E2E: the actual generated timeline rendered with its own opaque surface. The timeline control responded; starting New chat saved its state and restoring the previous chat recovered month 207. This exposed and fixed the existing large-preview request failure using scoped saved-artifact references (also for state-only saves), retaining the 64 KiB app limit and sandbox. Eleven additional API checks passed, including cross-workspace rejection. See docs/floating-advisor.md.

Composer refinement QA: real Demo chat verified blank placeholder after the first message, no orb in the composer, compact Solving activity, task icons and tinted solid message surfaces. Toolbar and starters share one row; a separate tiny centered drag row sits directly below it, above the input. Desktop and 390px checked; both starter choices fit on phone with abbreviated labels. Seventeen relevant tests passed. No deployment.


## 17 September 2026 - toned-down selected chat option 2

Target: docs/design-targets/chat-materials-2026-09-17/option-2.png plus the owner's explicit reduced-curvature/highlight and width corrections. Scope is bubble material and responsive spacing, not replacement of the mock's fictional page content.

Evidence: selected reference and current Chrome screenshot were emitted together in the browser comparison call. Real application screenshot uses existing Demo conversation text over Overview; generated reference uses fictional concise conversation over Goals. These are material/alignment comparisons, not a pixel-identical content claim. Additional rendered checks: Graphite Glass, Light standard finish, 390px Graphite Glass, and reduced transparency.

Initial finding (P2): stronger refraction allowed chart labels through long-message centers, harming readability. Fixed with a 91%-opaque inset writing surface while retaining a 5px optical edge. Re-captured and inspected desktop and phone; chat text stays distinct and undistorted, actual chart lines bend in the perimeter.

Post-fix result: restrained 18px corners and edge sheen replace the concept's exaggerated rounded lens. AI remains left and user right; long bubbles cap at 78%, short Hi stays content-sized. Composer/toolbar remain floating without an outer panel or expansion icon. Standard surfaces retain the richer finish. Phone text wraps within viewport, and resize/scroll remain usable. No outstanding P0/P1/P2 observed in the checked states. Non-Chromium fallback appearance/performance was not independently tested. Subjective owner acceptance remains open.

final result: passed

17 September Glass background correction: replaced the fixed 91%-opaque inset with a continuous theme-tinted 64%-to-48% translucent surface. Removed the inset pseudo-element entirely. Added 2px optical softening to reduce background detail behind text. Glass composer now has inset edge lighting only (no cast shadow); other glass surfaces have a restrained 2px/6px shadow at 8% opacity. Chrome Demo verified Graphite over the Overview chart and Light over Appearance. Computed composer style confirms only two inset highlights, no exterior shadow; console errors empty. Standard non-Glass materials and reduced-transparency solid fallback remain unchanged. Local only.

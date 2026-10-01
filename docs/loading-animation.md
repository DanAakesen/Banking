# Monogram loading animation

Selected by Dan on 27 September 2026 from three prototyped concepts (Untangle, Liquid ledger, Monogram) and implemented locally the same day. Dan's words: "Definitely monogram. Looks amazing… it's stunning." Keep this direction; it replaces the earlier sculpted and line-flow startup screens. The comparison prototype remains in [prototypes/loading-concepts](../prototypes/loading-concepts/index.html).

## Behavior

- **Startup** (first view of a page session): a full-screen layer on the theme background shows one 112 px particle glyph (96 px on phones) and one status line. There is no headline, progress bar or stage list.
- **While loading, the glyph never forms a letter.** About 1,100 particles in a 9-second loop move through:
  - an orbiting ring with a highlight that travels around the centre;
  - a flowing infinity ribbon with a gentle sway (it does not rotate, so it never reads as an "8");
  - a dense spinning core that spirals back out into the ring.
- **When the view has finished rendering**, `finish()` assembles the particles into the brand initial, and a light sweep crosses it (800 ms). The layer then dissolves while the initial flies onto the sidebar brand icon (850 ms), and a landing sequence plays:
  - the particles cross-fade into the solid icon;
  - the icon pops with a spring and a light sweep;
  - a soft glow and a ring pulse outward;
  - the rest of the wordmark ("anking") slides out from behind the B.

  If no icon is visible (collapsed sidebar, or Overview on a phone where the header brand is hidden), the initial fades in place (600 ms).
- **Brand icon:** the wordmark is the icon followed by the rest of the name (B-icon + "anking"). The icon is the settled monogram, cropped to the letter and used as an alpha mask. It is painted with the `--accent` → `--ai-accent` gradient and sits on the baseline at cap height, so it follows theme changes. Screen readers get the full name "Banking" through visually hidden text.
- **Status text** follows completed requests ("Loading accounts", "Preparing your overview", "Opening workspace", then "Your workspace is ready") in English or Danish. It blurs in on each change. No percentages are shown.
- **Page changes** use the same engine at 52 px, centred in the content area, with 200 particles. The loader appears only if rendering takes longer than 250 ms. Once visible, it stays at least 450 ms and then briefly forms the initial (420 ms). While a page renders, its content is hidden except the page header. The content then fades in upwards over 450 ms.
- **The initial follows the wordmark.** The glyph and icon are sampled from the first letter of `brandName` (`data-brand`) in Georgia, so renaming the app updates both.

## Accessibility, failure and cleanup

- The startup status is a polite live region, and page changes announce "Loading…". The canvases are decorative (`aria-hidden`). The app is `inert` and `aria-busy` while the startup layer is present.
- Reduced motion shows a still ring while loading, then reveals without the flight or fade. When loading finishes in a hidden tab, the flourish is skipped and the page is revealed immediately.
- Failure removes both loaders and shows the existing error and Retry. Navigation, session loss and new loads cancel the animation frame loop, timers, the flight animation and the layer.
- Colours come from `--accent` and `--ai-accent`, the same tokens as the AI surfaces. Light and Sand themes use larger, more opaque dots and a deeper highlight for contrast.
- Styles are set through CSSOM only, so the CSP is unchanged. No new static files were added; `loading-ui.js` and `loading.css` keep their public-asset entries.

## Verification (27 September 2026, local Demo, headless Chrome)

- Held the trends response for 4–9 seconds:
  - frames at 0.8, 4.4, 6.8, 7.6 and 8.5 s showed ring, ribbon, core and spiral-back phases, never a letter;
  - the initial formed only after `#overview-data` had rendered;
  - the settled initial landed on the "B" of the sidebar wordmark;
  - afterwards `#app` was not inert, `aria-busy` was cleared and the body class was removed.
- Page change with the accounts response held for 2.2 s: the 52 px glyph appeared and `aria-busy` was set. After rendering, the loader was removed and no content remained hidden.
- A fast page change showed no glyph when it rendered in under 250 ms. The Review page's own data sometimes takes longer, and then the glyph correctly appears.
- An injected trends failure removed the loader and showed a visible error and Retry.
- Light theme, reduced motion (still ring, then reveal) and a 390 × 844 phone (96 px glyph, no horizontal overflow) all revealed correctly. No page errors were recorded in any run.

## Scope

Local only; Azure was not changed. Section-level and dialog loaders (`quietLoading`) are unchanged.

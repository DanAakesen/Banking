---
applyTo: "src/Banking.Api/wwwroot/**"
---

# Banking UI consistency

These rules were established while aligning 360, Accounts, Review, Budgets, Goals and Markets. They apply to every new or changed page, including Investments, Pension, Loans and future pages. The rationale is recorded in `DESIGN.md` under "Composed scenic headers", "Frontend rule compliance" and "App-wide consistency". If a page differs from these rules, change the page to follow them. Do not add a page-specific override of a shared pattern.

## Page header

- Main pages use the shared `header(title, controls)` in `app.js` and appear in its scenic title list.
- Every scenic page has a `sceneBuilders` entry in `app.js`. It composes the photo stage from the page's own rendered summary:
  - the title top-left;
  - the controls top-right, as glass pills;
  - one headline figure bottom-left;
  - up to three glass cards bottom-right.
- The builder hides the source summary with `scene-sourced`. Page logic keeps rendering the summary, so behaviour and updates continue to work.
- If a page redraws its summary (refresh, polling or drafts), recompose after each draw. Either pass `composeScene` to the page module or use the builder's `watch`.
- Never change the scenic header's height, padding, background, shading or radius for one page. Do not use `!important` header overrides. The shared styles are in the "Composed scenic headers" block at the end of `markets.css`.
- Status or freshness text in the header uses the Accounts structure: `.overview-controls`, containing a `<small>` and a `.controls` glass group.
- Glass on the photo stays light-on-dark in every theme. Content below the photo uses theme tokens.

## Content below the header

- Panels use a `var(--surface)` background, a full `1px solid var(--line)` border and `var(--radius)` corners.
- Section and panel titles use Georgia at weight 400, about 1.5rem. Each block has one title, with no eyebrow or subtitle.
- Empty and idle states use plain labels, such as "No holdings yet" or "Nothing selected". Do not use slogans.
- A selected tab or segment is a tinted pill: `color-mix(in srgb, var(--accent) 16%, transparent)` with `var(--ink)` text. Do not use an underline or a one-sided border.
- List rows are rounded and use zebra striping with `var(--row-alt)`. A selected row gets a full outline and a fill.
- Use theme tokens for colour: `--accent`, `--good`, `--warn`, `--bad`, `--ai-accent`, `--ink`, `--muted` and `--line`. Hard-coded colours are only for glass on the photo or an existing chart palette.
- Do not colour one edge of a component. This covers borders, stripes and pseudo-elements. Timeline connectors and chart geometry are allowed.
- The Content Security Policy blocks inline `style="…"` attributes in HTML strings. Put values in `data-*` attributes and apply them with `element.style` after rendering, as `paintScene` does, or use classes.
- Format amounts with the shared `money()`, which adds the currency suffix. Show an unknown value as `—`, never as zero.

## Verify before handoff

- Open the changed page next to Accounts in the browser, at 1440, 1024 and 390 px. Compare the header anatomy, panels, headings, tabs and rows.
- Confirm there are no console or CSP errors and no horizontal overflow.
- Check at least one light theme (Light or Sand) as well as a dark theme.
- Check for one-sided borders at runtime. The following snippet must return an empty list:
  `[...document.querySelectorAll('#main *')].filter(el=>{const s=getComputedStyle(el),n=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none').length;return n>0&&n<4})`
- When a page's headline figure or glass cards change, update the page table in `DESIGN.md` under "Composed scenic headers".

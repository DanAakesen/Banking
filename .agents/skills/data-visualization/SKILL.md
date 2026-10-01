---
name: data-visualization
description: Build or review Banking charts, dashboards, and data-heavy views. Use when a task presents financial or operational data visually.
---

# Data visualization

## Load the relevant context

1. Read the repository `AGENTS.md` and `docs/agent-context.md` context map.
2. Follow its routes to the relevant feature, source/API, and design guidance. Read only the sections and data definitions needed for this question; do not load every project document by default.
3. Read `docs/data-model.md` or `docs/architecture.md` when needed to confirm field meaning, data provenance, workspace boundaries, or aggregation behavior.

## Make the numbers trustworthy

- State the question the visual answers. Confirm the source, measure, unit/currency, sign convention, date range, grouping, and aggregation before choosing a chart.
- Use source values and documented definitions. Do not invent, silently estimate, or change financial values. Reconcile displayed totals and representative points against the authoritative source/API, including debit/credit signs and rounding.
- Make missing, stale, partial, and estimated data visible. Preserve source freshness and status meaning; do not imply that a complete-looking chart is current when its data is not.
- Keep Live and Demo results separate. Clearly identify synthetic Demo data wherever a chart or summary could be mistaken for observed financial history.
- Do not imply causation from a correlation or before/after coincidence. Explain any material filtering or aggregation that could change the interpretation.

## Choose and present the visual

- Choose the simplest chart or table that answers the question. Use a table when exact values or lookup matter more than a visual pattern. Add filtering, inspection, or linked selection only when it helps the actual task.
- Use readable labels, appropriate scales, explicit units and date ranges, and color-independent meaning. Preserve project tokens and accessible contrast. Include a short text summary or table when it helps readers interpret the visual.
- **One headline per content block.** Do not put an eyebrow or kicker above a headline, or a subtitle or secondary heading below it. Put needed explanation in ordinary body text, without styling or labeling it as another headline.
- **Never color only one edge of a component.** Do not use a colored left, right, top, or bottom border, stripe, or pseudo-element as an accent or state marker. If a border is needed, apply one consistent border color around the whole component. Use the full background, text, icon, or shape to show state.

## Verify

- Compare rendered values with the source/API; check totals, signs, units, periods, labels, missing-data states, and workspace identity.
- Inspect the result at relevant desktop and mobile widths and exercise any changed interactions. Fix concrete issues and run checks appropriate to the change.
- Report the question answered, source and period, what you verified, and any material data limitation. Do not claim a verification you did not perform.

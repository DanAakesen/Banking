# Overnight quality and visual upgrade

Owner authorization: Dan approved a local quality pass followed by online visual research and substantial UI component upgrades on 7 September 2026. Preserve approved workflows. No additional mockup approval is needed for these refinements.

## Status

The quality pass and visual upgrade are complete locally. **54 backend tests and 39 browser workflow checks pass**, with no script errors. Verification includes all 17 routes at 1440, 1024, 768, 390 and 360px, six primary workflows in all five themes/both languages, error recovery, draft protection and workspace isolation. Screenshots use disposable synthetic test records, not Dan's finances or product goals/budgets.

The normal local HTTPS host is running and the upgraded Overview was verified in Chrome. Read-only checks confirm zero goals, zero named plans and zero active plans in both Dan and Demo, with the eight historical Demo category limits preserved. [Record-count verification](ui-review/2026-09-07/overnight/product-record-counts.json). The overnight heartbeat is paused because the authorized work is complete.

## Morning review

1. Start on Overview: inspect the cash-flow chart with the pointer, timeline slider or keyboard; switch Net saved / Income / Spending.
2. On Accounts, select a spending category in the ring legend to inspect its amount.
3. Create your own budget: the monthly totals and allocation waterfall update as you edit. Make active explicitly when ready.
4. Review the visual direction, then continue your own goal/budget acceptance in Dan and Demo.

| Screen | Desktop | Mobile |
|---|---|---|
| Overview | [Graphite](ui-review/2026-09-07/overnight/overview-graphite-desktop.png) · [Light](ui-review/2026-09-07/overnight/overview-light-desktop.png) | [390px](ui-review/2026-09-07/overnight/overview-mobile.png) |
| Accounts | [Graphite](ui-review/2026-09-07/overnight/accounts-graphite-desktop.png) | [390px](ui-review/2026-09-07/overnight/accounts-mobile.png) |
| Budgets | [Graphite](ui-review/2026-09-07/overnight/budgets-graphite-desktop.png) | [390px](ui-review/2026-09-07/overnight/budgets-mobile.png) |
| Review | [Graphite](ui-review/2026-09-07/overnight/review-graphite-desktop.png) | [390px](ui-review/2026-09-07/overnight/review-mobile.png) |

Other themes: [Slate](ui-review/2026-09-07/overnight/overview-slate-desktop.png), [Sand](ui-review/2026-09-07/overnight/overview-sand-desktop.png), [Forest](ui-review/2026-09-07/overnight/overview-forest-desktop.png). [Workflow results](ui-review/2026-09-07/overnight/verification.json) and [layout matrix](ui-review/2026-09-07/overnight/matrix.json).

## Boundaries

All work stays local. No Azure, deployment, account/registration changes, public exposure or actual AI integration. Mutations only in disposable GUID-named test databases. Dan and Demo product goals/budgets must remain unchanged. Do not invent bank series, achieved savings or AI advice for visual effect.

## Quality findings and evidence

- Reviewed local browser authorization, no-store responses, same-origin checks and finite static assets. Production mode is refused by this local host.
- Reviewed logging: framework/HTTP/EF detail logging is filtered; operational logs use codes and job IDs instead of transactions/secrets.
- Shared form controls are locked while saves are pending, then restored on failure without losing the draft. A delayed failing goal save is covered in the browser.
- Synthetic transaction descriptions and the test authorization token were checked against host output and were absent.
- Backup restore is restricted to a separate empty local restore database; encrypted and portable recovery have existing tests.
- Fixed a response-isolation gap: workspace/route checks now run again after asynchronous JSON parsing. A delayed-body browser test verifies the boundary.

## Visual direction

Implemented after the quality pass: a native cash-flow area/bar chart with date inspection and a data table, factual spending highlights, selectable spending rings, a budget allocation waterfall and goal rings. Refined surfaces, controls, navigation, Review details and forms share all five theme tokens. Responsive SVG geometry improves phone labels; duplicate goal progress indicators were removed. The approved navigation and disconnected advisor remain.

## Reference decisions

- [Mercury Insights](https://mercury.com/insights): financial hierarchy, compact context next to charts and a clear relationship to transactions.
- [Bklit Area Chart](https://bklit.com/docs/components/area-chart): restrained area fills, crosshairs, hover inspection and considerate motion.
- [Tremor Area Chart](https://www.tremor.so/docs/visualizations/area-chart): useful legends, formatted values and a shared component language.
- [shadcn area gallery](https://ui.shadcn.com/charts/area): integrated controls and chart/metric composition.

Original implementation in the existing native JavaScript/SVG stack; these are design references, not copied library source. No React migration, remote chart renderer, analytics service or CDN. New time series must come from a bounded, read-only aggregate of booked transactions with the same exclusion rules as existing totals. No fabricated balance history.

## Limits and handoff

- Owner visual approval, creation of actual product goals/budgets and real-bank figure reconciliation remain Dan's acceptance tasks.
- Cash-flow curves describe booked transaction movement, not reconstructed account balances. Partial import/history is labeled. Long ranges aggregate every daily point into at most 60 visual buckets.
- Spending highlights are factual arithmetic, not AI advice. Actual AI, budget comparison/projections, currency conversion and entry-to-actual-spending mapping remain deferred.
- This is a local app. The earlier Codex built-in-browser certificate problem and remote image persistence bug are not claimed fixed; Chrome works locally.
- No Git commit/push was possible because this workspace has no .git directory. Source, tests, reports and screenshots are saved locally.

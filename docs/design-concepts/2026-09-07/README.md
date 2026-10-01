# Banking design exploration — 7 September 2026

Status: exploration archive. The v3 light Overview is now approved with the Custom-only date-field correction; see [canonical targets](../../design-targets/README.md). Earlier alternatives remain unselected. Dark selection is pending. Generated with built-in image_gen; numbers are fictional, not copied live balances or exact product-demo totals. No frontend is implemented and no Azure changes were made.

The owner confirmed a personal digital advisor as an important feature: access to connected financial data, user-defined goals, spending analysis, explanations and scenarios. Its access stays read-only, and Demo uses fictional context. Future investment/pension connections must fit the information architecture; neither is currently connected or implemented. Advisor implementation scope and delivery remain to be planned after design selection.

Displayed selection order:

1. [Ledger](01-ledger.png) — overview beside contextual advisor. The generated Ledger label is a concept label; the project name remains Banking.
2. [Meridian](02-meridian.png) — dark financial-position overview with horizontal navigation.
3. [Forward](03-forward.png) — advisor-first scenario workspace with visible data context.

The three matching `*-prompt.md` files contain the exact generation prompts. Full images preserve the initial exploration; the owner subsequently selected and refined the first direction. Mobile layouts still need design because mobile is a product priority.

## Refinement after owner feedback

The owner prefers the first direction. Revision v2 preserves its left menu and light style, moves utilities into the lower-left area, adds DA/EN, replaces the permanent advisor column with pills/overlay chat, and introduces expected payments, comparable trends, and goal progress. Final implementation approval remains pending.

- [Revised overview, chat closed](04-ledger-v2-overview.png)
- [Same direction, advisor overlay open](05-ledger-v2-advisor-open.png)

These are two interaction states of the selected direction, not two new alternatives. Exact edit prompts are saved alongside the images. Upcoming payments are explicitly estimated from recurring activity. New backend capabilities and mobile design remain to be planned. Repository language stays English; bilingual product UI is requested.

## Revision v3 — annotated feedback

[Latest Overview](06-ledger-v3-overview.png) moves profile and language into Settings while retaining Live/Demo in the sidebar, adds five period presets and a custom From/To range, and replaces the single goal chart with a compact conditional-status goal list. Color is accompanied by labels/icons; progress bars show target completion rather than a generic health score. Fictional green/amber/red examples illustrate the states; exact plan thresholds remain undecided. Generation/edit prompts are in [06-ledger-v3-prompt.md](06-ledger-v3-prompt.md). No UI was built.

## Dark-mode selection set

The owner approved the light v3 Overview and requested two dark variations. From/To fields must appear only under Custom in both themes. The latest displayed dark selection order is 1 = [Graphite](07-dark-graphite-candidate.png), 2 = [Midnight](08-dark-midnight-candidate.png). Both were edited from the same approved light reference using built-in image_gen. Exact prompts are saved alongside each candidate. The owner subsequently selected Graphite (first/darkest), now copied to the approved canonical dark target. Midnight remains an unselected exploration. The later Dan/Demo account-selector correction overrides the older toggle shown in these images; Settings will offer five preset themes, with three additional palettes still to design. See [binding target records](../../design-targets/README.md). Earlier option numbers refer to different selection sets and must not be reused.


## Settings responsive proposal — latest local-build checkpoint

[Desktop and mobile Settings](09-settings-responsive-proposal.png) follows the approved Graphite language, with dedicated Settings navigation, central content, Back to Overview, and a mobile section selector. The five-theme grid includes approved Light/Graphite plus proposed Slate/Sand/Forest. These three palettes and the responsive layout await owner review. This is a generated design mockup, not implemented UI. [Exact built-in generation prompt](09-settings-responsive-prompt.md).

## Mobile creation flows — next review checkpoint

1. [Mobile Overview and blank goal creation](10-mobile-overview-goal-proposal.png) — [exact prompt](10-mobile-overview-goal-prompt.md).
2. [Budget entry, suggestion preview and unsaved review/create](11-mobile-budget-flow-proposal.png) — [exact prompt](11-mobile-budget-flow-prompt.md).

Built-in image_gen proposals based on the approved Graphite image. No records were created. [Frontend review](../../frontend-review.md) specifies the interaction contract and overrides: preserve sans-serif page headings, retain comparison trends/recent activity beyond the compact Overview view, and describe credits separately without assuming they are refunds. Images do not imply the historical Demo budgets were removed. These new layouts await review.

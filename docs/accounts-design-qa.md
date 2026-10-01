# Accounts option 2 — design QA

final result: passed

Source: `docs/design-targets/accounts-atlas.png`, the second displayed image selected by Dan. Actual source pixels and comparison viewport: 1448 × 1086; browser device scale factor 1. Implementation: public fictional Demo at `https://localhost:5443/#/accounts`, Graphite, one month (9 August–8 September 2026).

## Comparison history

First comparison: `artifacts/ui-review/accounts-atlas-first.png`. P2 findings: header allocation colours did not match directory colours; the hero was taller than necessary; table text was too small; the standalone Rules link added excessive vertical space. Fixed by reusing the shared colour order, reducing hero/ring spacing, increasing table type, placing Rules by the heading and matching seven-row pagination to the selected design.

Final comparison: source and `artifacts/ui-review/accounts-atlas-final.png` opened together in the same comparison input, alongside `accounts-atlas-ledger-detail.png` and `accounts-atlas-light-final.png`. No remaining P0/P1/P2 issue was observed. Tablet and phone captures were also inspected. The mobile date range was restored outside the hidden scenic panel.

## Required fidelity surfaces

- Typography: serif display headings and cash total, shared sans-serif controls and tabular figures. Smaller currency suffixes, readable category labels, and wrapping account names instead of clipped identifiers. Retains the application's fonts rather than adding font downloads.
- Layout: panoramic summary above a left account directory and broad right ledger. Account bars and the category strip carry real data. The reference's ordering/hierarchy is preserved; the app's existing page margins and explicit search/Rules controls remain intentional functional differences. At smaller widths the directory moves above transactions instead of squeezing the ledger.
- Colours: all five existing themes work. On the dark photo, data hues use their bright counterparts; light content surfaces use the existing light theme tokens. Account hue identity remains consistent. No coloured left borders.
- Imagery: existing generated alpine-lake WebP scene assets are reused, with the matching morning/afternoon/evening selection. They remain raster imagery; data graphs are rendered from actual amounts using the existing chart component. No decorative pseudo-image substitutes. Existing application icons are reused rather than introducing a second library.
- Copy and data: actual synthetic Demo names and current amounts supersede image-generation errors. Current cash is 452,414 DKK; period income 53,000 DKK, spending 37,430 DKK, net retained 15,570 DKK. No fabricated account-growth chart or AI recommendation. Missing/negative balances and incomplete history retain visible limitations.

## Workflow evidence

- Full disposable-database suite: 36 checks, zero browser errors; authentication, isolation, categories, goals, budgets and other screens retained.
- Accounts-specific matrix: thirteen widths (360–1920px), ten-account search, account-scoped API totals, pagination independence, open native category picker sizing, five themes and two languages.
- Additional browser-only response fixtures: zero spending, missing and negative available balances. No product-data mutations.
- Real Demo captures: `accounts-atlas-final.png`, `accounts-atlas-ledger-detail.png`, `accounts-atlas-tablet.png`, `accounts-atlas-mobile-final.png`, `accounts-atlas-light-final.png` under `artifacts/ui-review/`.

P3 follow-up: the generated mock uses richer individual merchant/account pictograms. The implementation uses the existing application icon set and original bank names; this is a visual refinement opportunity, not a workflow blocker. Human acceptance is pending. The local build remains running; nothing was deployed.

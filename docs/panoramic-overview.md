# Panoramic Overview — local implementation

Approved by Dan on 8 September 2026. Target: [selected design](design-targets/overview-panoramic.png). The subsequent request explicitly retains all five themes.

## Delivered

- Morning, afternoon and evening photography, greeting and supporting text. Copenhagen time, including daylight saving; refresh on a 30-second timer and tab visibility.
- Fading welcome overlays; full-width current cash balance and account allocation; Financial pulse comparisons; proportional income/spending/retained-flow diagram; spending mix; goal journey; seven-day estimated payments; right-side advisor preview and Review action.
- Accounts and individual categories link into their existing filters. Goal links open the editable goal. Upcoming View all opens all estimates within the same seven-day horizon.
- Five themes and both languages. Theme values remain in the shared stylesheet; Overview layout uses overview.css. Photographs are local WebP files, approximately 907 KB combined, with no external image requests.
- No actual AI connection. Advisor preview presents deterministic aggregate facts, explicitly labels AI as disconnected and opens the existing honest placeholder.
- Amounts come from existing scoped APIs. Unknown balances remain unknown. The flow explicitly identifies a deficit as drawn from balance, does not count it as income, and groups smaller categories without discarding their amounts. The comparison is against the preceding equal-length period. One month is the initial period.
- On phones the diagram becomes a readable cash-flow summary; exact category amounts and an accessible chart data table remain available.

## Specifically authorized Demo refinement

`node scripts/Refine-DemoOverview.cjs --apply` uses the local public Demo API only and verifies synthetic product-demo provenance before mutation. It is not run at startup.

Verified result: 629 transactions inspected; 66 known synthetic internal-transfer pairs matched; 135 unclassified entries categorised; one fictional, editable Family holiday goal created against the Savings account. Four coffee transactions remain in Review. No bank amounts, Live records or budgets changed. A second explicit run matched/classified/created nothing and preserved the goal.

This is the owner's specific exception to the earlier no-new-Demo-goal instruction. It does not authorize automatic resets, future unattended seeding or changes to Live goals.

## Verification

- `scripts/Test-Backend.ps1`: 57 passed. The added access test checks exact public Overview/image paths while private APIs, unknown assets, configuration paths and non-GET asset requests remain protected. CSP was not relaxed.
- `BANKING_VISUAL_PASS=1 scripts/Test-Frontend.ps1`: 41 workflow/visual checks passed, no browser script errors. Includes login/Demo/Live separation, budgets, goals, Review, languages, theme persistence and the redesigned Overview.
- `BANKING_OVERVIEW_ONLY=1 scripts/Test-Frontend.ps1`: 9 grouped checks passed after the account/category link correction. Checks summer/winter greeting boundaries, amount conservation for surplus/deficit/zero cases, displayed API totals, accessible chart details, advisor and Review interactions, all three images, five themes at six widths and both languages.
- Final read-only product Demo matrix: 30 theme/width combinations (1600, 1200, 1024, 768, 390 and 360 pixels), no page/panel/label overflow or console errors. No product records are mutated by this matrix.

Screenshots and machine-readable evidence are under `artifacts/ui-review/panoramic/`; final product captures include `overview-panoramic-current.png`, `overview-panoramic-light.png`, `overview-panoramic-forest.png` and `overview-panoramic-mobile.png`. These are actual browser captures, separate from the approved generated design.

## Boundaries

Dan's own visual acceptance of the implemented screen remains an interactive step. The old Accounts metric-strip concept is recorded as a direction, not included in this Overview implementation. Actual AI, cloud resources, external exposure and deployment remain deferred and require separate authorization. Live and Demo share rendering; screenshots and mutations for this task used synthetic Demo only. Existing Live authentication/integration was not re-consented or exercised through MitID.

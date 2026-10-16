# Employee shares: money and vesting

## Current delivery status — 16 October 2026

Main verified release `38948037018`, hosted `git-105894a154266b119e1e832522d58e1ed2475d9e`, exact assets/CSP and the existing private owner's retained workflow. The three independent fictional Demo reports were then approved through normal Demo APIs. Repeat dry-run returned no operations and repeat apply made zero writes. Real Azure browser checks passed at 1440px EN/light and 390px DA/dark, including three byte-identical downloadable originals and independent native-XLSX validation. No private source contents, holdings declarations or identifiers belong in public documentation.

The **money-first cumulative-line correction is source-only pending Main review and Luna's serialized release**. It needs no migration, data application, re-upload or reseed. Existing approved snapshots, originals, product mappings, pension and Saxo data stay unchanged. Actual hosted Saxo MSFT **and FxSpot USD/DKK** acceptance for the new projection remains pending publication; synthetic provider fixtures do not establish live availability or entitlements.

## Product view

Only the Microsoft employee-share section changes. Three compact money figures show declared held value, source-unvested indicative value and the next scheduled vesting amount/date. DKK is the default; USD is one tap away. Shares are secondary point/table details. Upload/review, source warnings, historical grants/deliveries, saved illustration inputs, employment/archive and originals remain behind existing actions/details.

The main chart is a cumulative stepped line from today's inclusive cutoff through the final remaining source vesting date. Equal dates aggregate; fractional quantities and weekend source dates remain intact. Flat segments between events are not interpolated deliveries. A selected point shows its exact date, gross money vesting then and cumulative gross money. Keyboard arrows/Home/End, pointer inspection and touch select actual source points; container resizing preserves selection/focus and never fetches data. There are no month/year bins or quantity fallback in the primary graph.

- [Rendered desktop](design-targets/employee-stock-money-line-desktop.png)
- [Rendered 390px Danish/dark](design-targets/employee-stock-money-line-mobile.png)

These images use real C#-generated independent synthetic reports and explicitly synthetic market/FX response fixtures, not an actual provider observation.

## Current market data and immutable reports

`GET /api/markets/employee-shares` returns only public-market MSFT and USD/DKK parts, independent of trading SIM/LIVE, portfolios, orders and balances. It uses the existing LIVE research authorization/token generation before cache access and the existing bounded HTTP/budget handler. Concurrent calls coalesce into one batch, shared for 60 seconds; provider work has a 15-second deadline. Quotes do not request historical chart bars. A fresh existing MSFT market snapshot may be reused.

USDDKK is resolved through `ref/v1/instruments?AssetTypes=FxSpot&Keywords=USDDKK`; no UIC is guessed. A unique exact symbol/asset/UIC and the response's USDDKK/DKK display identity are required. `Quote.Mid` means **DKK per one USD**, with positive bounded values, bid/ask consistency when supplied, accepted quote quality, source `LastUpdated` when reported, separate retrieval time and reported delay. An absent/empty/minimum source timestamp on a valid freshly retrieved reference quote is explicitly **source time unknown**, never inferred from retrieval; malformed, future or contradictory timestamps still reject. No account-derived conversion, inverse pair, chart close, grant price or saved illustration substitutes for this live projection.

Stock and FX failures are independent: known USD stays available when DKK is unknown. A missing current price/conversion leaves money unknown, with source dates still inspectable; it never changes the primary graph to shares. Latest valid closed-market observations retain their real dates/closed status. Transient last-known data is marked stale; expired data is not used. Access denial clears the relevant usable cache rather than resurrecting a prior price. Refresh runs once per minute while visible; currency and point interactions are local. Saved/edited assumptions are an explicitly labelled view-only illustration.

Approved report valuations and holding declarations are never rewritten. Private `GET /api/employee-stocks/valuation` and separately guarded Demo `GET /api/employee-stocks/demo/valuation` return a minimized current display projection. Both use their workspace's canonical approved snapshot and the same public market source. No originals, identity/join keys or full grant/transaction rows enter that projection. Zero declared held shares remains zero even when prices are unavailable; unknown holdings remains unknown. Employment archive suppresses active conditional awards and preserves vested ownership/history.

360 replaces one existing explicitly managed product in its read-only display, never adds snapshot values/history or conditional compensation to it. An unmapped holding declaration does not create a wealth product. Conditional future compensation is visible separately from owned net wealth and available cash. Missing mapped valuation is unknown rather than the old saved amount disguised as current. Source statements and their dates remain available unchanged. Employee shares are excluded from Demo's generated investment-factor/performance curve: vesting, extra grants and balance changes do not establish investment returns.

## Existing fictional Demo and safety

The existing three native originals use the exact supported ordered `Award Summary` / `Vest Schedules` / `Transactions` schema (12/9/67 columns), shared strings with a native workbook relationship, independent invented identities and variable schedules. The retained parser/service, approval/version/correction rules and original-download components are shared with the owner flow through separate Demo guards. No private original is copied or anonymized into Demo.

The approved fictional dates remain 15 March, 15 July and 1 October 2026, with held declarations 28.75 / 36.25 / 42.5 and source-unvested 190 / 168 / 152. Saved fictional USD prices 405 / 415 / 425 and DKK-per-USD rates 7.05 / 6.95 / 6.80 remain historical illustrations. The saved current product is 122,825 DKK. The new **current market display may differ**; that is not a history correction or a financial write. No setup command is needed for this UI correction.

Existing `setup-demo-employee-stocks.py` stays an explicit fixed-origin, exact-build, Demo-only dry-run/apply tool. It is never invoked at startup/page load. Reapplying completed setup is outside this correction. Owner/Demo original/download, CSRF, forged-mode and AI isolation rules remain unchanged.

## Validation

Banking Cloud supported release selection: 311 backend tests; 219 frontend/advisor Node tests; 21 frontend-host tests; 104 Python protocol tests. C# tests exercise real synthetic imports/approvals, current-price unit/orientation calculations, no-write history/product preservation, zero/unknown, read-only provider paths, exact FX resolution/quality, partial failures, cache/token/access and concurrency boundaries. The supported selection continues excluding unrelated Windows-DPAPI host baselines.

Browser evidence covers 1440/1024/390 × EN/DA × light/Graphite for retained import/history and the money-line dashboard (24 cases), real C# DTOs, unknown FX with usable USD, denied/stale/closed market states, exact cumulative values, keyboard/touch/resizing, no per-control requests, saved report selection/reload, CSP/overflow and preserved review/security behavior. These are cloud fixtures; Main checks live provider prices/rates and the unchanged existing owner and Demo records after the reviewed release.

References: [Saxo instrument reference](https://www.developer.saxo/openapi/referencedocs/ref/v1/instruments/get__ref), [InfoPrices](https://www.developer.saxo/openapi/referencedocs/trade/v1/infoprices/get__trade), [Quote schema](https://www.developer.saxo/openapi/referencedocs/trade/v1/infoprices/get__trade/schema-quote), [pricing](https://www.developer.saxo/openapi/learn/pricing).

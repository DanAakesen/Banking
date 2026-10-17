# Employee shares: money and vesting

## Current delivery status — 16 October 2026

Main reports the loading-state release at `36ef52c7eef6c28b273cbee3dbb5b25a72735178` complete. Real Saxo LIVE MSFT/USDDKK, DKK/USD arithmetic, one mapped owned value, excluded conditional compensation and retained history were verified on the preceding `de4c326` build through normal isolated Demo sessions and Main's private owner browser. The three fictional Demo originals/history points were already applied and repeat setup was a no-op. Private sources, declarations and identifiers remain outside public documentation.

The **period/range/tooltip and Reports-dialog refinement below is source-only pending Main review and Luna's serialized release**. It changes presentation only: no migration, provider/API change, re-upload, data application or reseed.

## Product view

Three compact figures show held value, conditional source-unvested value and the next vesting amount/date. DKK is the default; USD is one tap away. The main view contains these metrics, a cumulative stepped line, period/range controls and one compact current-price/before-tax label. Shares are secondary in the point tooltip. An actually empty manual-investment list becomes a compact **Add investment** action; populated records remain available.

**6M / 1Y / 2Y / All / Custom** use calendar dates, with month-end clamping. Custom from/to dates and two draggable/keyboard range handles select an inclusive window. The prominent **vesting in this period** amount sums only actual unmatched source events within that window. The separately labelled cumulative amount retains all conditional source vesting from the active cutoff (today for an active report) through the window end; narrowing the window does not reset it. No invented period-end events, clock-based deliveries or returns. Empty windows show zero scheduled events; missing prices/conversion stay unknown for nonzero quantities.

The anchored point popover shows the exact source date, incremental money and cumulative money in the chosen currency, formatted to two decimals. Mouse inspection opens only over a visible dot's fill/stroke and closes when the pointer leaves that dot, including after a click; chart gaps, lines and area do not select a nearest point. Touch keeps the larger actual-point target, and keyboard focus/arrows/Home/End/Enter/Space remain available; Escape closes the popover. It stays within the viewport, repositions with scrolling/resizing, and hides if its anchor leaves the viewport. Period/currency/range/point changes are local and preserve the automatic quote. Pending requests show loading; completed failures stay unavailable and retained valid quote timestamps are not refreshed by a pending request.

One **Reports** action opens a native modal with Reports, Selected report and Source details tabs. Upload/review/approval, original download, dated history, source/grant/delivery tables, manual view-only illustration and audit details live there. Closing respects unsaved review and in-flight save guards; ordinary view-range changes never make an approved report dirty. Source date/money tables retain unknown markers, real currency formatting and text escaping. Technical metadata is collapsed. The primary dashboard has no source tables, manual price fields or nested accordions.

- [Rendered desktop](design-targets/employee-stock-range-desktop.png)
- [Rendered 390px Danish/dark](design-targets/employee-stock-range-mobile.png)

These images use actual components with independent C#-generated synthetic reports and synthetic market/FX fixtures, not private sources or live-provider evidence.

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

Cloud validation for this frontend increment: 94 focused EmployeeStock backend cases and 221 frontend/advisor Node cases passed. Unit checks cover inclusive calendar boundaries, fractional money, zero-event windows, unknown FX and cumulative value before a selected window. Existing retained-service tests cover approval/history/duplicate/correction/isolation without production writes.

The browser matrix exercises the actual component at 1440/1024/390 × EN/DA × light/Graphite: period and custom-range money reconciliation, native drag/keyboard range handles, bounded hover/focus/tap popovers, currency retention, zero extra requests for chart controls, loading/denied/stale/unknown states, report navigation, retained review/concurrency/duplicate/correction/original download, no dirty view controls, modal keyboard/close behavior, CSP/overflow and disposal. These cloud fixtures are separate from Main's later deployed/private-owner acceptance. No original or owner financial record is changed by this increment.

References: [Saxo instrument reference](https://www.developer.saxo/openapi/referencedocs/ref/v1/instruments/get__ref), [InfoPrices](https://www.developer.saxo/openapi/referencedocs/trade/v1/infoprices/get__trade), [Quote schema](https://www.developer.saxo/openapi/referencedocs/trade/v1/infoprices/get__trade/schema-quote), [pricing](https://www.developer.saxo/openapi/learn/pricing).

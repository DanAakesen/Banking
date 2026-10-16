# Employee stock workbook import

## Authority and delivery — 16 October 2026

Dan authorized an Investments upload for external/employee shares, including a Microsoft section while employed, vested versus conditional shares, USD/DKK and a vesting chart. Main privately inspected the authentic export and supplied only its generic schema. Real originals, names, identifiers, values, dates and hashes stay in the owner path; they must never become repository fixtures, logs, shared Demo or raw AI context. All development/tests/previews run in Banking Cloud. Owner-source compatibility requires Main's deployed private preview/reconciliation; synthetic tests are not that acceptance. Existing pension data/repair and Saxo orders are outside this task.

Deliver in reviewable increments:

1. **Current PR: stateless owner preview.** Bounded native XLSX extraction, source-grounded quantities/reconciliation, review metadata, accessible vesting view and restored generic manual external-investment section on Investments. No database reads/writes, original retention, financial approval, product creation or provider connection from workbook preview. The UI explicitly distinguishes preview from saved imports. This provides Main a private authentic-file compatibility check before accepting a model/financial values.
2. **Durable import/history, separately reviewed.** Encrypted originals and per-upload receipts, minimized typed immutable approved snapshots, source report date versus uploaded/approved timestamps, parser/hash provenance, version/concurrency checks, duplicate content with individual receipts/canonical chart points, explicit same-date corrections, current state derived from latest approved report, and archive/hide employment without deleting history. Source identity is joined with private stable hashes; names/raw awardee/award IDs stay only in encrypted originals. Approval never creates current holdings from vested totals. Optional owner-confirmed dated holdings/valuation updates one mapped manual product only after explicit review; conditional awards never enter 360.
3. **Controlled release/acceptance.** If new tables are required, a separate exact additive migration plus explicit operator allowlist/metadata-gate PR must precede feature activation. Current runner permits only the pension history migration. Main/Luna alone coordinates approved helper/operator/schema and serialized publication; no runtime/deploy SQL grants or arbitrary pending migrations. Main validates the authentic owner preview and explicitly reviewed save. Only then may independent fictional Demo data use the proven contracts. No new resources, credentials, paid pricing, local execution, direct production SQL or automatic real import.

The current preview increment intentionally does not claim retained upload/history or completed owner import. Existing originals and approved pension/Demo data must not be reparsed, reset or reseeded.

## Authentic schema contract

Three required sheets, with exact ordered headers (surrounding whitespace is normalized, duplicates rejected):

- `Award Summary` (12): Awardee ID, Last Name, First Name, Award ID, Award Date, Award Type, Awarded, Award Price, Vested, Unvested, Total Transacted, Expiration Date.
- `Vest Schedules` (9): Awardee ID, Last Name, First Name, Award ID, Award Date, Award Type, Award Price, Vest Date, Vest Shares.
- `Transactions` (67): full public generic header array is pinned in the parser/independent fixtures. Essential observations are transaction date/quantity, historical fair market value, transaction type, award reference/date/type/price, taxable spread, total taxes, shares for taxes, net shares and broker field. Tax-country/state/percentage cells are not silently interpreted as current holdings or tax paid.

Identifiers are strings (leading zeros significant), quantities may be fractional, dates are ISO strings, blank expiry is supported. Microsoft and USD are **review-labeled import-profile metadata supplied by Dan**, absent from workbook cells. The workbook supplies no reliable report/as-of date, current MSFT quote, FX rate, current custody holdings, sales ledger, cost basis or actual returns. UploadedAt is not report date. A dollar number format alone is not an explicit currency code. No provider market price is inferred from zero award price or historical vesting FMV.

## Current holdings and variable grant schedules

Current owner holding declarations belong only in the authenticated workspace and override earlier declarations. Never derive current positions from historical vested/net-delivery rows. The upcoming chart focuses source schedule dates on or after an explicitly selected cutoff (including today), conditional on continued employment. Today's schedule is never automatically actual. Every new export requires fresh owner reconciliation. Follow each grant's source schedule (annual awards may span five years, on-hire four), without fabricated future grants or forced four-year truncation. Ending employment never retroactively removes vested ownership; use an explicit end-date review rather than clock-driven mutation. No trade, transfer, bank change or tax-settlement instruction is implied.

## Financial meaning and reconciliation

- Awarded must reconcile to reported vested + unvested per grant; discrepancies remain warnings/needs review, never fabricated adjustments.
- `Total Transacted` is a separate source observation. In this export it reconciles to vesting transaction quantity; it is **not sold shares** and must not be subtracted from vested to infer held shares.
- Reported vested/delivered, unvested conditional and current held (owner-confirmed or unknown) are separate. Import remains useful while holdings/valuation are unknown. No conditional amount or grant summary is added to personal wealth.
- Summary, schedule and transaction rows are three views of grants, not three assets. Match private grant references, quantities/cumulative deliveries and ordered source dates. Preserve scheduled date and actual transaction date separately; weekend/business-day shifts must reconcile without exact-date-only matching. Passing calendar time never turns a scheduled row into an actual delivery.
- Show transaction-only delivered events and unmatched conditional schedule dates in separate chart series/table rows; summary totals remain source totals. Ambiguous, unsupported or partial reconciliation is visible. Historical FMV and tax observations remain dated source observations, not current market price, cost basis or proof of tax paid.
- USD/DKK illustrations require explicit price/rate units, sources and dates; no default quote or FX rate. Converted/conditional values are illustrative at that stated price, not guaranteed future price, net proceeds or return. Unknown is `—`. No Yahoo or new paid integration.

## UI and privacy

Preserve the existing scenic Accounts-aligned Investments header, Saxo environment/sign-in/trading controls and SIM exclusion. Add a separate Microsoft employee-share section and generic manual external-investment section below the brokerage workspace, using existing panels/tokens/rows. The Microsoft section is owner-only and optional; its reviewed profile must not imply employer metadata came from the workbook. No private workbook upload or synthetic production dataset in Demo before owner acceptance.

Use share-count summaries, chart by reported delivery/scheduled date, keyboard-selectable points with visible labels/tooltips and a table alternative. Distinguish source row/sheet, source date, unknown report date and user-entered profile/valuation metadata. Current preview is not an editable financial save; profile/illustrative assumptions can be reviewed without DB writes. Clear results on mode/session/route changes and reject stale responses. Original/PII is excluded from normal typed DTOs/advisor resources; raw data is never treated as instructions.

## Parser and test boundaries

Use .NET ZIP/XML only; no dependency or workbook execution engine. Reject formulas/cached formulas, macros/binary parts, external relationships/links, DTD/entities/DDE, duplicate/traversal entries, unsupported/malformed cell types and duplicate/missing headers. Bound compressed bytes, expanded bytes, entries/ratios, XML characters/depth, row/cell/string counts, numeric precision and total processing time/cancellation. Return fixed errors without source cells/names/IDs/filenames/exception payloads. Mixed-awardee rows across any sheet reject the import rather than combining people.

Synthetic fixtures reproduce all three sheets and all 67 generic headers with independent identities/awards/amounts/dates. Tests cover fractional shares, leading-zero joins, shifted schedule/transaction dates, cumulative matching, reconciliation, reported-zero versus missing, unsupported transaction types, malformed/hostile packages, bounds/cancellation, PII exclusion, owner/Demo/anonymous/forged-mode/CSRF boundaries and zero preview writes. UI checks cover desktop/tablet/mobile, EN/DA, light/dark, keyboard/table/chart/unknown values, existing manual/Saxo controls and stale responses. Persistent history/duplicate/correction/storage tests belong to the next increment and must not be claimed complete by stateless preview evidence.

## Preview source validation — current increment

The parser uses no workbook package dependency. Caps: 8 MiB compressed, 32 MiB expanded across at most 256 XML/relationship parts, 8 MiB/part, expansion ratio 200 (1 KiB compressed floor), depth 32 and 300,000 aggregate XML reader nodes/attributes before tree allocation, 50,000 shared strings of at most 4,096 characters, 5,000 populated rows/sheet, 100,000 cells and 500 grants. Cooperative parse budget is 10 seconds inside a 15-second upload/parse boundary with one active reader and immediate busy response. Exact decimal quantities support eight fractional digits. All output collections derive from these bounded input facts. No formulas, raw source labels, identifiers or package errors are returned.

Cloud validation uses the real C# extraction of a fictional shared-string/numeric three-sheet workbook to generate the browser DTO. The source fixtures include fractional net/gross shares, tax withholding, leading-zero joins, four/five-year source schedules and weekend-to-business-day transactions. Browser coverage exercises Accounts comparison, independent signed-out Saxo, manual statement form, explicit inclusive cutoff, chart keyboard/table scrolling, unknown/reviewed USD/DKK illustration, malformed retry, stale navigation and owner logout to isolated Demo at 1440/1024/390 px, EN/DA and Light/Graphite. No actual owner workbook, production preview, financial write, migration or deployment has been performed by this increment. Main's actual-file preview remains pending owner sign-in.

Validated locally in Banking Cloud: 239 supported isolated backend tests (37 employee-stock cases), 209 frontend/advisor Node tests, 21 frontend-host tests and 12 Chromium combinations. The host build emitted an existing nested test-output copy retry warning but completed successfully. Private source acceptance and the durable-import increment are pending; this is not a deployed or retained import.

Review corrections: strict FYxx/FYxxxx Annual SA classification without raw labels; aggregate XML node cap before XDocument allocation; actual numeric/date validity and finite-product checks for illustrations; plain Demo empty-state copy. No owner holding declaration is stored in these docs or hardcoded in the product.

PR review follow-up validation: 43 focused employee-stock backend tests, 210 frontend/advisor Node tests and the same 12 Chromium combinations pass, including invalid/out-of-range price/rate/date controls and overflowing unit calculations.

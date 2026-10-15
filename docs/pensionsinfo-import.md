# Private pension upload and history

## Current authority and acceptance

Dan's latest 15 October 2026 correction establishes **owner first**. Authentic owner sources and privately reviewed owner data establish accepted formats. Only afterward may independently fictional Demo data use those same proven import/model/rendering paths. Empty owner domains can be correct; visual completeness does not justify invented holdings, debt, property, dates, contributions or performance. Employee-share records require their own authentic source and must not be represented as broker holdings. Future property/loan events require confirmed dates including year and actual financial terms. Preserve existing cash and valid empty portfolios.

The actual private report remains with Main. No original, text, figures or identifiers are stored in GitHub, fixtures, logs, shared Demo or raw AI context. The current parser uses the structural evidence Main supplied, but **real-file compatibility remains unverified** until the authenticated owner checks the deployed preview. Isolated synthetic fixtures establish software behavior only; they do not establish an accepted PensionsInfo product format. Automatic PFA/provider access remains parked.

Prepared Demo setup work is preserved, unmerged and unapplied, at branch `codex/pension-demo-held-20261015`, commit `d9a4694ff09537a20447616839c7622490fa0b2f`. Do not merge/release/apply that bundled setup. No shared Demo financial changes, schema migration or deployment occurred. Its normal-API dry-run returned `PENSION_API_NOT_DEPLOYED` and found no current pension product; it performed no financial writes. The owner feature removes the production sample endpoint/setup script/sample buttons, moves PDF generation into the test assembly, and does not record new Demo manual-history receipts. Demo import/history is held behind the owner-only API boundary. Existing unrelated Demo records are preserved.

## Upload, review and approval

Only authenticated `Live` owner requests can access the new pension upload, receipt, preview, original, snapshot, approval and history endpoints. Demo, anonymous and forged-Live callers are denied. Upload retains the protected original and a receipt, including unsupported or interrupted parsing, but accepts no financial values. Financial approval requires explicit review, confirmation and acknowledgement of coverage limits. The actual owner decides whether to save real values; no automatic import is authorized.

Review shows the original download, source hash/parser version, uploadedAt, report date, each balance's source date, page/section/unit, pattern-match status, warnings and unknown fields. Numeric values and product labels/dates can be edited. Server provenance and field identity cannot be substituted by the client. Edited values are marked `UserEdited`; matched patterns still require review. Unknown is not zero.

One selected agreement maps to one current pension product using stable IDs and rowversion protection. Components explain that balance rather than adding capital. Repeated ratepension components remain distinct. A reported total differing from rounded components remains distinct with a warning; no balancing entry is invented. Older reports enter history without replacing a newer current observation. Payout scenarios, insurance and ATP/public pension entitlements remain separate from saved capital. Units/tax/purchasing-power assumptions are retained only when source patterns support them. Unsupported providers, table structures, terms, dates, holdings, allocation and actual returns require review or remain unknown. Full report coverage is not claimed.

## Retention, correction and comparison

`PensionDocuments` deduplicates encrypted originals by SHA-256 within the workspace. Every upload gets a `PensionUpload` receipt; immutable `PensionSnapshots` preserve approved values, source status and product mappings. Identical concurrent uploads serialize original/receipt creation through a short transaction and cross-instance SQL application lock. Both receipts survive. Parsing runs after commit.

An unchanged approval with the same mapping links to a canonical snapshot rather than creating capital or extra development points. A different duplicate mapping returns a visible conflict. An identical file with previous reviewed edits can explicitly link its receipt to that existing snapshot without replaying financial writes. Same-date corrections for the same selected products require the previous snapshot ID and explicit confirmation; prior values/originals remain selectable. Null/malformed review members return client errors.

History pages contain 50 receipts. The development table shows at most the latest 200 non-superseded approved observations with product coverage and source dates, disclosing truncation. Compare the same products/currency. Annual contributions appear only when explicitly reported in that unit for every included product. No intermediate observations, inferred returns, accumulated deposits or FX conversion are invented. Historical snapshots are not summed into 360 current capital. New confirmed owner manual saves also record their dated values and any stated-age projection; no pre-existing history is fabricated. Existing JSON preview/manual editing remains usable.

## Privacy, recovery and processing limits

Originals are Data Protection ciphertext in the existing private workspace SQL database, scoped by hosting key ring, mode and Demo scope. Existing `/home/Banking` keys/protection certificate remain necessary for recovery. HTTP returns explicit DTOs without `protectedOriginal`, internal `previewJson`, filenames or PDF metadata. Authorized original download uses a fixed attachment filename, `no-store, private`, sandbox CSP and mode-bound browser fetch. No raw report text/bytes enter advisor tools, logs, OCR/LLM services or instructions. Existing accepted capital facts remain ordinary financial context.

[PdfPig 0.1.16](https://www.nuget.org/packages/PdfPig/0.1.16), a pure managed Linux-compatible Apache-2.0 dependency, was checked against its [versioned primary documentation](https://github.com/UglyToad/PdfPig/tree/v0.1.16). Extraction groups words by coordinates instead of assuming `page.Text` reading order. Locks/audit remain enabled and upstream notices ship with the package.

A separate `--pension-pdf-worker` starts before web configuration, with runtime lookup variables only, disabled diagnostics, a 256 MiB GC cap, 384 MiB working-set check, one concurrent parser and 20-second deadline. Input/output and whole-process-tree cancellation are bounded. Limits: 8 MiB PDF, 80 pages, 60,000 letters/page, 600,000 total letters, 512,000 output characters; JSON 60 KB; reviewed approval 768,000 bytes. Encrypted, blank/scanned, malformed, excessive and unrecognized files return safe outcomes. No normal Linux business backend or local data fallback is introduced.

Recovery archives include protected originals and snapshots. Portable recovery encrypts originals inside the outer passphrase archive and re-protects on restore. Non-portable recovery needs the original key ring. Existing production SQL and `/home` backups retain their roles. No new storage, permission, retention expiry or destructive reset is introduced.

## Additive schema and feature-only release

Required migration: `20261015000000_PensionUploadHistory`. It creates three history/original tables and nullable `WealthRecords.PensionSourceKey`, with scoped unique indexes, rowversions and restrictive parent references. Existing financial rows are not rewritten. Do not execute its destructive `Down` as code rollback; preserve history/schema while restoring old code.

Publication remains code-only. Before live ZIP upload, the workflow stages the checksum-verified release under `/home/Banking/releases/<sha>` and runs `dotnet Banking.Api.dll --verify-pension-schema`. This early CLI checks only migration/object/column metadata using existing Managed Identity settings in both `Banking_Demo` and `Banking_Live_Dan`. It does not start workers, query financial rows, grant roles or perform DDL. Missing configuration/schema/access returns nonzero before changing the running app. Same-SHA staging can be retried only after checksum/tree checks.

Main must establish a supported cloud operator migration capability before mutation. The tracked `CloudImport.Schema` mechanism expects `/home/Banking/deployment/operator.protected`, applies pending migrations to both existing databases, then removes that temporary protected token. The historical Windows-only `refresh-operator` utility loads local protected config/keyring and cannot be run under the cloud-only rule. No supported cloud credential/execution route has been demonstrated here. Website-only GitHub OIDC and the data-only runtime identity cannot supply SQL DDL; do not grant SQL roles or export plaintext tokens/secrets as a workaround.

After reviewed feature-only source and controlled migration, publish only the owner import feature through the approved Luna medium cloud route, verify build/assets/CSP and unauthorized denial, then conduct the private real-file preview and explicit owner review. **Do not apply or release prepared product Demo data before owner acceptance.** Runner capability is unverified until a fresh supported run; no new deployment/rollback is claimed.

## Test evidence and limits

Tests exercise typed extraction, locales, dates/units, repeated components/equal payout rows, discrepancy warnings, scenarios/insurance, malformed/encrypted/blank/resource limits, cancellation, private-field exclusion, relational save/reload/dedup/correction, concurrent receipts, null input, source/mapping protection and full owner/Demo/anonymous/forged-Live denial. The generator lives in the test project and is asserted absent from the product assembly. Browser checks use synthetic typed C# DTOs at desktop/tablet/mobile, light/dark and Danish layouts, including a pending owner response across logout/entry into Demo. This evidence is not actual-report, product Demo or deployed acceptance.

The owner-only revision passes 143 selected isolated backend tests (including 50 pension tests), 207 Node tests, 34 Python protocol tests and EF migration/model parity. Eight responsive browser configurations pass: seven owner combinations across 1440/1024/390 px, light/dark and Danish, plus the held Demo view with no upload/sample controls or data creation. The unchanged frontend-host boundary previously passed 20 tests. These checks do not apply the migration or start a production backend.

Safe cloud fixture regeneration and responsive verification:

```bash
BANKING_PENSION_BROWSER_FIXTURE_DIR="$PWD/artifacts/pension-history/browser" dotnet test tests/Banking.Tests -c Release --no-restore --filter FullyQualifiedName~Pension
node tests/ui/pension-import.browser.cjs
```

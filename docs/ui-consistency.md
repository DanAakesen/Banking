# UI consistency pass — 8 September 2026

Dan supplied screenshots showing inconsistent View all actions, compressed Accounts insight cards and category options wrapping one letter at a time. Earlier page-width checks did not catch those internal layout failures.

## Changes

- Shared `sectionAction` markup and `.text-action` styling for navigation links and dialog actions, including one arrow, font, spacing and keyboard focus treatment. View all actions sit in section headers. Shared Back and primary link styles cover related navigation actions.
- Removed conflicting Accounts layout rules. Use the available content width to place insights beside the ledger when there is space, above it on narrower desktop/tablet, and below it on phones; card columns retain readable minimum widths.
- Aligned the shell and transaction-card breakpoint at 900px. Removed desktop cell padding from mobile transaction cards and expanded the mobile category filter to the available width.
- Reserved enough width for transaction categories. The color marker sits inside the trigger; native option rows use a block layout with a separately positioned checkmark so text is not squeezed between flex items. Option panels remain the same width as their trigger.
- Ring legends adapt their value placement to card width. Insight totals and payment rows can wrap at sensible boundaries.

## Evidence

`BANKING_CONSISTENCY_ONLY=1` with `scripts/Test-Frontend.ps1` checks 20 routes at 360, 390, 768, 900, 901, 1024, 1100, 1200, 1280, 1440 and 1920px. It checks internal card overflow, category-control widths, option row heights and consistent View all styling. Six screens also run in all five themes and both languages. The matrix passed with no browser script errors.

The existing 34 workflow checks passed, including category changes, budget creation/rename/import, goals, sign-in, workspace isolation and unsaved-change protection. All persistence tests use disposable test databases; normal product records are untouched by this pass.

Captures and machine-readable results are under `artifacts/ui-review/consistency/`, including light Overview/Accounts at 1200px and open category lists at desktop and mobile sizes. Desktop, intermediate desktop and mobile captures were visually inspected. Browser evidence is Chrome; other engines are not claimed as tested.

Currency follow-up: the shared monetary renderer places a smaller currency code after every displayed amount. Chart accessibility labels use a plain-text suffix formatter; interactive ring selection preserves the styled suffix. The expanded visual workflow check passed (38 checks), and the layout matrix now verifies insight ordering and smaller currency suffixes.

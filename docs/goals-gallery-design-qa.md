# Goals option 1 — design QA

final result: passed

Source: `docs/design-targets/goals-gallery.png`, selected first displayed image. Actual: `artifacts/ui-review/goals-gallery-viewport.png`, 1448 x 1086, Graphite, public Demo, first goal selected. Both images were opened together in the same comparison input after the final changes. Full-page and Car-selected evidence is retained alongside it. Previous Budget QA is preserved in `docs/budget-design-qa.md`.

## Findings and corrections

- Initial implementation had overly small supporting type and taller, less consistent cards. Raised text sizes, restored editorial card/detail headings, fixed description height, and compacted remaining/monthly amounts. Recaptured and compared after the changes.
- Light-theme hero numbers lacked contrast when the photographic shade overlaid the light fade. Reordered the fade layers; inspected the revised Light capture. Theme captures disable transition animations to avoid judging an intermediate palette.
- The approved status-pill correction is implemented beside each goal title, right-aligned, without a duplicate beside the detail heading. Whole card bodies select the associated journey. The first goal is on track and the Car is behind, using actual synthetic records.
- Hero stays 320px at wide desktop, 360px on narrower desktop, following the stronger shared-height requirement. This accounts for the vertical difference from the generated source. Mobile is content-driven.
- Source illustrative data and inconsistent status/forecast are replaced by reconciled API values. Forecast is labeled estimated; dates and missing contributions are explained. Car's 2,500 DKK August return produces a one-month delay. No invented bank figures.

## Verified behavior

- 62 backend tests pass, including contribution reconciliation, catch-up, pending exclusion, unavailable/stale history, scope isolation, photo validation and optimistic concurrency.
- 40 browser checks pass, zero console errors. Goal creation/edit/notes/links persist; a real image uploads, normalizes, reloads and removes. Deleting the selected goal from the root gallery returns to the explicit empty state.
- Public Demo inspected at 1448, 1024, 768 and 390px; no horizontal page overflow. Five themes captured. Danish inspected at 1448, 1024 and 390px, translated status/controls, no horizontal page overflow.
- Native keyboard-focusable card links, labeled file inputs and existing edit controls remain. The selected card uses a complete outline, no colored left border. Currency follows amounts with a smaller suffix.
- Demo refinement rerun reports `updated: 0`; paired return is an internal transfer and all three goal accounts reconcile. Live bank records and budget entries are untouched.

No remaining P0/P1/P2 findings. Intentional differences: existing shared app typography/assets and hero height, theme-dependent scenery, accurate financial labels, expandable transaction evidence and fully functioning photo controls. Final subjective visual acceptance belongs to Dan. App remains local; no deployment.


## Latest owner follow-up — 9 September 2026

final result: passed

The original reference is superseded for these five explicitly requested refinements: full-card/photo selection, status-driven red progress, no repeated Received labels, expense styling for withdrawals including zero until Reached, and a redesigned forecast. Revised desktop/mobile Danish captures were opened and inspected; the current theme captures also reflect the change. Nine targeted browser checks pass with zero page errors (`artifacts/ui-review/goals-followup-checks.json`). Photo hit testing and file picker independence are verified. Status restoration and Reached styling use browser-only API response fixtures; stored Demo/Live records are untouched. The original 62 backend / 40 workflow checks above describe the preceding full build; no backend changes were made or backend rerun claimed in this follow-up.

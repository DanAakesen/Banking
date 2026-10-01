# Selected goal contribution detail — design QA

final result: passed

## Source and evidence

- Selected visual truth: `docs/design-targets/goals-contribution-detail.png`, first displayed result of the latest three-detail concept set (9 September 2026).
- Wide detail capture: `artifacts/ui-review/goals-detail-graphite.png` (1394 × 877 output canvas; CSS detail width 1394 at a 1664 requested viewport). The in-app browser capture includes scaled content and extra canvas; compare the visible panel boundaries, not the blank canvas. This is a structural/visual comparison, not a pixel-diff claim.
- Final normal-browser viewport: `artifacts/ui-review/goals-detail-final-viewport.png`, Danish/Graphite/Demo/Family holiday selected. Actual CSS viewport width 1079; the support photo intentionally stacks under the notes at this narrower width. The normal viewport was restored after the responsive tests.
- Source and implementation were opened together in the same comparison input, including a separate readable final-viewport inspection after corrections. Car/Light and Car/mobile captures were also inspected directly.
- Browser evidence: `artifacts/ui-review/goals-detail-browser-checks.json`; 10 desktop/mobile theme states, tablet, no overflow, no captured console errors.

## Findings and corrections

- [Resolved P2] The initial future connector became dashed only halfway across the last interval. It now becomes dashed immediately after the final actual contribution; verified in the final screenshot and computed style.
- [Resolved P2] The supporting photo was hidden at tablet widths. It now remains visible below the notes; verified at the restored 1079px viewport with no overflow.
- [Resolved P2] The synthetic Holiday notes contained an old engineering placeholder. Replaced through the real Demo edit form with a family-trip example; saved and rendered successfully. No financial fields changed.

## Fidelity surfaces

- Typography: existing editorial Georgia headings and shared sans-serif body; clear selected-goal, timeline and supporting hierarchy. Numeric amount and smaller currency suffix preserved. At narrow desktop, headings scale down consistently with the existing page.
- Spacing/layout: one horizontal contribution timeline, one concise status/forecast strip, two supporting areas, one collapsed evidence section. This follows the selected hierarchy without reinstating duplicate balance, target, percentage or remaining tiles. Mobile changes to a vertical timeline.
- Colors/tokens: shared theme surface, line, muted, positive and negative roles. Behind-plan dots/meters inherit the same red as the goal card in all five tested themes. A neutral planned point and dashed connector distinguish future from booked amounts.
- Imagery: existing high-quality local goal photographs reused rather than generating another variant; actual uploaded photos populate card and detail together. Notes and links remain saved user content; no fake hotel link from the mock was introduced.
- Copy/data: historical headings represent monthly aggregates, not fictitious booking dates. The amount is explicitly net contributed. The next point is planned. Car shows its 2500 DKK withdrawal, zero August net contribution, 5000 DKK period net and one-month forecast delay. Missing/stale data cannot silently become successful contributions.

## Validation and residual limits

- `node tests/ui/goals-contribution-detail.cjs`: 8 scenarios passed, including stale/incomplete/no-plan/reached and escaping boundaries.
- In-app browser: Demo plan edit navigation, notes save, keyboard disclosure open/close, Holiday and Car, Danish/English, five themes at desktop/mobile and a tablet check.
- Full backend tests were not rerun: financial APIs and synchronization are unchanged. The separate existing browser runner was updated for the new selectors but not invoked; verification used the actual Codex in-app browser.
- Intentional differences from the concept: no invented external reference links, actual stored English Demo notes remain English under Danish UI, native accessible meters, and a compact semantic status marker in place of the large decorative check icon.
- No outstanding P0/P1/P2 finding. Owner visual acceptance remains subjective. No deployment or Azure changes.

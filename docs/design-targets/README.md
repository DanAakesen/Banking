# Banking — target states

## Current target: panoramic Overview

[Approved panoramic design](overview-panoramic.png), selected by Dan on 8 September 2026: “Number 1 is soooo good! … Build this now.” This supersedes the earlier Overview composition below. The original is exec-46d3a4d5-8960-4fe1-8571-1abdf3e04e41.png (first displayed image of the two-image revision). Time-of-day scenery and all five themes are binding additions. DESIGN.md records financial corrections and the specifically authorized Demo refinement. The image is illustrative; actual amounts are supplied by the API.

This directory contains approved visual targets, not implemented screens. Design approval is separate from frontend execution and Azure/deployment approval.

## Approved light Overview

- Target: [overview-light.png](overview-light.png).
- Approved by the owner on 7 September 2026: "Yeah that is it."
- **Binding correction:** From/To date inputs appear only after Custom is clicked. Hide them for 1 week, 1 month, 3 months, 6 months and 1 year. The effective date-range label remains visible. The image still shows the old fields; the owner requested this text correction without regenerating the light image.
- Keep sidebar navigation, the bottom-left account selector, profile/language inside Settings, advisor pills opening an overlay, period trends, estimated upcoming payments and conditional goal status.
- All image data is fictional; source images do not supply production amounts, exact chart data or goal thresholds.

## Approved dark Overview

Target: [overview-dark.png](overview-dark.png). The owner selected the first/darkest version, **Graphite**, on 7 September 2026. The variants were displayed in this order:

1. [Graphite candidate](../design-concepts/2026-09-07/07-dark-graphite-candidate.png).
2. [Midnight candidate](../design-concepts/2026-09-07/08-dark-midnight-candidate.png).

The canonical dark target is an unchanged copy of candidate 1, Graphite. Midnight is an unselected exploration, not an approved theme. Candidate files/prompts remain in the exploration archive.

## Binding corrections and theme scope

- **Both images:** replace the separate Live/Demo control with an account selector showing **Dan** for live data and **Demo** for synthetic data. Keep it near Settings in the lower-left sidebar. This is workspace selection under the same owner authentication, not an account-login change.
- **Light image:** From/To inputs appear only after clicking Custom, as described above.
- **Settings:** profile, Danish/English language, and a theme picker with **five preset choices**. Light and Graphite are approved; the other three palettes/names remain to be designed. Do not treat Midnight as implicitly approved. Save the user's theme preference independently of Dan/Demo selection. Custom themes come later.
- Written corrections take precedence over the images. No regeneration is needed to apply these requirements during implementation.

## Subsequent interaction clarifications

Settings is a dedicated page with its own left navigation, central content and Back to Overview. The theme picker stays there. Mobile navigation and form layouts must work at narrow widths. Advisor pills/overlay are disconnected placeholders until AI is explicitly reintroduced. Goals and budgets are created by Dan through the UI; images containing example goals/budgets do not authorize seeding product data.

## Related states and open work

- [Advisor overlay behavior reference](../design-concepts/2026-09-07/05-ledger-v2-advisor-open.png): reuse the open/close behavior with the approved Overview shell; no separate final overlay approval is implied.
- Mobile layouts, other screens (including the automatic-budget review/edit flow), three remaining preset palettes, contrast verification, and new backend functionality remain work to resolve. No frontend or cloud resources are created by recording these targets.
- [DESIGN.md](../../DESIGN.md) is the canonical design contract; [exploration archive](../design-concepts/2026-09-07/README.md) preserves earlier variants.


Latest review checkpoint: [Settings desktop/mobile proposal](../design-concepts/2026-09-07/09-settings-responsive-proposal.png). The dedicated page behavior is owner-confirmed; this specific responsive layout and the proposed Slate/Sand/Forest palettes await review. It is not promoted to an approved image target.


## Local implementation approval

Dan approved proceeding with the responsive/creation layouts, with one period dropdown and no top Demo control. Account switching stays in navigation/More/Settings. These corrections override every earlier image. The reviewed patterns are now implemented; [actual local UI screenshots and evidence](../local-frontend.md) are the current review surface. Iterate on the running UI rather than repeating image approval rounds.

## Accounts — selected 8 September 2026

[Accounts explorer target](accounts-atlas.png): the second of three displayed Accounts concepts was selected with “Build number 2 now”. It is implemented locally; [evidence and responsive behavior](../accounts-atlas.md). Financial truth and existing account names/colours take precedence over generated-image inconsistencies.

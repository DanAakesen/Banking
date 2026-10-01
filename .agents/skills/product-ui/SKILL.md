---
name: product-ui
description: Design, implement, or improve a Banking product interface. Use for substantive frontend and interaction work, not backend-only tasks.
---

# Product UI

## Load the relevant context

1. Read the repository `AGENTS.md` and `docs/agent-context.md` context map.
2. Follow that map to the feature's source, acceptance criteria, and relevant `DESIGN.md` sections. Read only the sections needed for this change; do not load every project document by default.
3. Read `PRODUCT.md` or `docs/architecture.md` only when the task depends on product scope, financial data boundaries, workspace behavior, or system constraints that the feature docs do not settle.

Use the existing project direction and infer routine choices from it. Ask only if an unresolved choice would materially change the result. Do not reopen a settled design decision or ask for approval of routine implementation details.

## Banking interface requirements

- Keep Live and Demo visibly distinct and preserve their data boundaries. Never present synthetic Demo data as a real account, transaction, balance, or market observation.
- Preserve user-authored financial data, identifiers, account/company names, and source meaning. A presentation change must not silently alter records or financial behavior.
- Use the project's existing components, tokens, typography, and interaction patterns when they fit. Put shared visual choices in the existing theme or tokens; document a durable design decision in `DESIGN.md` when appropriate.
- Show an operation's actual state. For example, an accepted order is not a filled order. Follow the feature's existing review and confirmation boundary; do not add a payment or transfer action outside the documented product scope.

## Non-negotiable visual rules

- **One headline per content block.** Do not place an eyebrow or kicker above a headline, or a subtitle or secondary heading below it. Put needed explanation in ordinary body text, without styling or labeling it as another headline.
- **Never color only one edge of a component.** Do not use a colored left, right, top, or bottom border, stripe, or pseudo-element as an accent or state marker. If a border is needed, apply one consistent border color around the whole component. Use the full background, text, icon, or shape to show state.

## Build and verify

- Implement the complete useful workflow, including relevant loading, empty, error, success, selected, and disabled states.
- Support keyboard and touch input, visible focus, meaningful labels, and reduced motion where motion is used.
- Keep sample or generated data clearly identified. Do not present a mockup as working functionality.
- Inspect the changed UI in an available browser at relevant desktop and mobile widths. Exercise the changed controls, long content, navigation, and relevant failure states. Fix concrete issues. Run checks appropriate to the change.
- If browser inspection is unavailable, say what could not be verified and continue with the checks that are available.

Report the changed user workflow and what you verified. Keep the report brief and state any material limitation.

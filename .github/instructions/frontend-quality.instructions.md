---
applyTo: "**/*.html,**/*.css,**/*.scss,**/*.tsx,**/*.jsx,**/*.vue,**/*.svelte"
---

# Frontend quality

Use the same deployed Banking API from local and Azure frontends. Follow `docs/shared-production-backend-plan.md` for the frontend-only local HTTPS proxy, authentication, shared Demo behavior and advisor routing. Local UI edits stay local; API writes affect the selected production workspace. Never mask a missing production endpoint with a local business API or synthetic fallback. Treat the plan as a target until its implementation is verified.

Build the actual workflow with clear hierarchy, useful feedback, and intentional responsive behavior. Let the brief and information architecture determine navigation, density, palette, typography, and layout.

Respect the design system. Cards, tables, sidebars, system fonts, and standard patterns are valid when they fit. Avoid decoration and interactions without value. There is no minimum number of novel patterns, motion effects, or visual iterations.

Provide meaningful labels, keyboard and touch access, focus management, sufficient contrast, and reduced-motion behavior where relevant. Design the loading, empty, error, selected, and success states that actually apply.

Verify real controls and content in the browser at relevant desktop and mobile sizes. Check overflow, long values, navigation, and changed workflows. Fix observed issues and disclose unverified behavior.

Use real screenshots and verified or generated assets when imagery helps. Label prototypes and sample data; do not invent customer evidence or imply that a mock is a running product.

Use one headline per content block. Do not pair a main headline with an eyebrow or kicker above it, a subtitle or secondary heading below it, or both. Put necessary explanation in ordinary body text.

Never color only one edge of a component. Do not use a colored left, right, top, or bottom border, stripe, or pseudo-element as an accent or state marker. If a border is needed, apply one consistent border color around the whole component. Use the full background, text, icon, or shape to show state.

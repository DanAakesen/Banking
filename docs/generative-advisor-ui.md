# Generative advisor UI

Implementation update, 12 September 2026: Dan approved and requested the prototype. A standalone local synthetic-only canvas is implemented in [prototypes/advisor](../prototypes/advisor/README.md), including HTML/CSS/JavaScript, a safe Markdown subset, content/state revisions, all five themes and an expandable phone canvas. It now accepts actual prompts through OpenAI Agents API in a hosted sandbox, with synthetic-only inputs and saved generated revisions. Offline examples remain separately labelled. See [real Chrome E2E evidence](advisor-e2e.md). See the README for verified boundaries, local launch, test evidence and limitations. No Azure deployment or Live-data processing was performed.

Confirmed requirement from Dan, 12 September 2026: generative UI is the advisor's primary design principle. The agent authors the presentation, including HTML, CSS, JavaScript and Markdown, rather than being restricted to a fixed catalog of cards. JavaScript is the working interpretation of "ja" in the request. This records the design requirement; it does not authorize implementation or deployment.

## Experience

- The agent chooses the layout and interaction: calculators, custom charts, comparisons, timelines, reports or combinations. Shared components are optional building blocks, not a limit on expression.
- Text and voice share a conversation and its artifacts. A follow-up can revise a visualization or create another.
- Keep the compact advisor entry and overlay. Rich output can expand into a larger canvas or full-screen phone view. Review the layout with Dan before building.
- Supply the five themes, language, currency/date conventions and accessibility guidance as a design kit. Generated content must adapt to available space and theme changes. No decorative colored left borders.
- Preserve completed artifacts and revisions in the authorized workspace so they survive mobile reconnection. Include data freshness, assumptions and provenance, with explicit loading/error states and readable fallbacks.

Example: "What happens if I save another 2,000 DKK each month?" can produce a generated slider, baseline/scenario chart, revised goal timeline and explanation together. This is an example, not a permanent template.

## Proposed rendering architecture

1. A stable Banking shell handles identity, conversations, voice and artifact placement. The agent authors the content inside it.
2. An extensible artifact envelope identifies the format, artifact/revision ID, content or private reference, and a readable fallback. It governs delivery, not layout.
3. Render Markdown with sanitized HTML/URLs. Render generated HTML/CSS/JavaScript in an isolated browser sandbox, never by injecting executable output into Banking's authenticated document. Support static images/SVG and add other renderers deliberately. Unknown formats receive a safe fallback rather than automatic execution.
4. A narrow host-controlled bridge supports resize, theme updates, scenario inputs and authorized read-only analysis requests. Reauthorize requests server-side for the current user/workspace; generated code cannot choose its own permissions.

The proposed executable renderer uses a separate cookie-free origin, iframe sandboxing and a restrictive Content Security Policy. It must have no Banking cookies, parent DOM access, credentials or direct banking/database API access. External loads, navigation, popups, forms and downloads need explicit controls; an iframe alone does not establish network isolation. Treat generated content and embedded transaction descriptions as untrusted. Browser isolation is separate from any provider-hosted agent execution sandbox.

Browser primitive references: [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox) and [CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox). These describe capabilities, not evidence that our renderer is implemented or secure.

Canonical financial facts come from Banking's read-only tools. The agent may generate new analysis/calculations in its authorized execution sandbox, showing inputs and assumptions and validating consequential results. Generated content cannot overwrite bank data, move money or place trades.

## First increment

Build the artifact renderer and interaction contract with synthetic Demo data before connecting a real advisor. Prove a custom interactive HTML/JS artifact, a Markdown explanation and a persisted revision on phone and across themes. Demonstrate new layouts without adding a dedicated application component for each output.

Verify rejection of access to the Banking shell, credentials, other workspaces, unauthorized tools and external data transmission. Exercise malformed/oversized content, unsupported formats and runaway scripts. Document resource-limit and browser-isolation limitations; sandboxing does not imply hard CPU/memory isolation. Do not execute partial streamed scripts before a complete validated artifact is ready.

Open decisions: canvas/overlay interaction, supported dependencies, artifact retention, AI provider/data-processing permission, spending limits and paid AI access in public Demo. No new Azure resources or deployment are included in this clarification.

# Shared AI effects

Implemented locally, 16 September 2026. Not deployed.

Dan selected Libraries.dev Border Beam with Pulse Inner and Colorful for the Overview AI composer, plus Thinking Orbs for voice state. The pinned MIT source is in `prototypes/advisor/vendor/libraries-dev/`; attribution, licenses and regeneration commands are retained there. The static bundle uses the library's pure canvas/CSS engines without introducing React.

| Activity | Orb | Visible label |
|---|---|---|
| Listening | Breathing | Listening |
| Speaking | Composing | Speaking |
| Preparing a response or running an analysis | Solving | Working |
| A voice delegate request is pending | Searching | Using tools |

Searching describes application tool work, not necessarily web search. The current delegate endpoint combines routing and tool execution, so this state covers that complete request. Speaking takes precedence when a spoken progress update overlaps tool work. Connecting and stopping use a static orb and explicit labels. Idle hides the orb. The existing voice transport's transcript-based speaking signal remains in use; this does not add audio-synchronization guarantees.

Dan extended the scope to all pages on 16 September 2026. The adapter is enabled by the trusted Banking parent context on every page, including Markets, while preserving the shared advisor instance. Effects show wherever that composer is open; this does not force a chat panel onto pages where it is closed. The standalone prototype and generated artifact frames are excluded. No Markets files or host mini-companion presentation were changed. Shared voice callbacks carry an additive `toolActive` flag; completion, failure and session cleanup clear it, and stale results cannot revive it. The original `overview-effects` filenames remain to avoid unnecessary asset churn.

The composer retains the existing textarea, Send and red Stop control. Orb and label sit below the text during activity to fit narrow screens. Light/Sand use the light palette, other themes use dark. Canvas and pulse drivers pause offscreen, when the document is hidden, and with reduced motion. Status remains available as text.

## Local engineering evidence

- Browser follow-up: the actual shared composer remains visible and its beam stays active across all 17 top-level pages: Overview, Accounts, Review, Budgets, Goals, Advisor, Investments, Pension, Markets, Loans, Analysis, Memory, Settings, Connections, Activity, Categories and Transfers. Each page heading and the composer were checked after navigation.
- Initial synthetic browser fixture: Breathing, Composing, Solving and Searching states; light/dark; 390px viewport; reduced-motion emulation; stopping/idle cleanup. The original Overview-only gate was superseded by the all-pages follow-up; state mapping and renderer are unchanged.
- All 31 targeted tests pass: route gating, state precedence, delegate success/failure, late results after close, existing voice lifecycle, chat scrolling and server behavior. Browser modules pass syntax checks; both new static assets return HTTP 200. No microphone or paid provider session was opened for this change.
- Owner production acceptance remains pending in `production-test-plan.md`, cases AI-FX-01 and VOICE-08.

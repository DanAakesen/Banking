# Local generative advisor prototype

Latest UI: the approved floating conversation pane is implemented with the microphone icon beside Send, chats overlay, and expanded modal. Typed and API-voice messages share browser-persisted conversations. See [conversation UI](../../docs/advisor-conversation-ui.md) and [QA](../../design-qa.md). The local preview is http://127.0.0.1:5450/. No Azure deployment.


Local synthetic-only prototype, authorized by Dan on 12 September 2026. It now accepts real prompts through OpenAI's Agents API using `gpt-6-astra` and an OpenAI-hosted sandbox. The separate offline examples remain labelled fixtures. No Banking API, bank sync, production authentication or Azure deployment is involved.

## Run

From the repository root, run `scripts/Start-AdvisorPrototype.ps1` (Node.js required), then open http://127.0.0.1:5450/. The process must remain running. It listens only on loopback. Do not start Banking.Api to run this prototype; Azure remains the sole Live sync worker.

The shell runs on port 5450; the artifact renderer runs on port 5451. This is a separate local experience for validating generative rendering before integration with Banking's advisor overlay.

## Try it

Ask a Demo question using the advisor form. The agent receives only the explicit synthetic fixture, runs its own calculations and writes a complete HTML/JavaScript or Markdown artifact. Completed output is downloaded, validated, saved and rendered through the existing isolated canvas. No application component is written for each generated layout.

Select **Refine the selected analysis** to send a follow-up using that saved version, including its interactive state. Each prompt uses a fresh hosted session with the previous artifact supplied as a file; this prototype does not retain an open provider conversation or all previous messages. Completed artifacts are downloaded before the hosted session is deleted. Original versions remain available locally.

1. Open an example. Change its slider, then Save revision.
2. Refresh or restart the server: the saved state and selected revision return.
3. Choose an earlier version to compare. Unsaved changes trigger a centered Keep/Discard/Save dialog during in-app navigation.
4. Use Bring your own artifact to paste self-contained HTML/CSS/JavaScript or Markdown, a title and a readable summary.
5. Use Edit artifact to replace a layout as a new revision. Earlier versions remain available. No new host component is required.
6. Settings changes Graphite, Light, Slate, Sand or Forest in both shell and artifact. Expand opens a larger canvas, including on phones; Escape collapses it.

## Voice (local Demo)

Select **Start voice**, allow Chrome's microphone permission, and speak Danish or English. Speech is streamed to OpenAI's `gpt-live-1` API over WebRTC; browser speech recognition and browser text-to-speech are not used. **Mute** stops sending microphone audio; **End** closes the provider session and releases the microphone. Use the audio playback control if Chrome blocks autoplay. Typed questions remain available.

Try “What if I save another 4,000 kroner?”, “Make that 2,500 instead”, and “Save this scenario”. The trusted backend calculates the numbers and the shell updates a compatible existing visual. New savings artifacts use `state.extraMonthly`; the two previously tested artifacts retain `extraContribution` / `extra`. Arbitrary HTML without a compatible control stays unchanged, with a separate verified numerical result and an explicit explanation.

“Create a new visual…” uses the existing hosted agent in the background; “Cancel that analysis” aborts it and prevents late results being saved. Ending voice alone does not cancel a separately running analysis. Tool names and completion are visible under **Conversation and tools**. No Live data, bank changes, trading or payments are available.

The process allows 12 voice connections, each UI-limited to five minutes and 30 delegated tasks. Reconnecting creates a new provider conversation. The selected saved artifact/state survives reload; unsaved conversation captions do not. These local safeguards are not production quota controls.

Developer-only audio test: start the process with `BANKING_VOICE_TEST=1`, open `/?voiceTest=1`, and use **Play test recording**. This reads the explicit synthetic `artifacts/advisor-prototype/voice-input.wav` and feeds it through the same WebRTC track, with continuous silence between clips. Only this mode records provider output to `voice-output.webm` for verification. It never captures the microphone. Turn the environment flag off for normal use. Audio fixtures are not served when it is off.

Run `node --test prototypes/advisor/server.test.mjs prototypes/advisor/agent.test.mjs prototypes/advisor/voice.test.mjs`. See [voice acceptance evidence](../../docs/advisor-voice-e2e.md).

## Artifact contract (details)

The content envelope has `title`, `format` (`html` or `markdown`), `content`, `fallback` and optional JSON `state`. The server supplies the artifact ID, revision number and creation timestamp. This envelope constrains transport, not layout. HTML can be a body fragment or a complete document; embedded styles, scripts and SVG are supported.

After `banking:ready`, an HTML artifact can read `window.banking.context` (the explicitly synthetic fixture), read `banking.state`, and call `banking.updateState(jsonObject)`. The shell marks the analysis dirty; Save revision persists that state together with content. Theme changes update `data-theme` and dispatch `banking:theme`. The injected design kit exposes Banking's existing theme variables and optional shared styles; layouts can author their own CSS. Theme compliance and accessibility are authoring responsibilities, not guaranteed for arbitrary pasted code.

`banking.request('read_demo_context')` is the sole iframe bridge tool. Other iframe tool requests are rejected; the voice tool router described above is separate and belongs to the trusted shell/backend. There is no general fetch proxy or Live data endpoint. Resize, state, ready/error messages and the narrowly allowed iframe tool use a MessageChannel transferred to the current frame, with source/origin checks on initialization. Ordinary parent-window messages cannot grant tool access.

Markdown deliberately supports headings, paragraphs, bullets, bold, inline/fenced code and quotes. Raw HTML is escaped; Markdown links, images and tables are not yet rich renderers. Unsupported formats and oversized input fail visibly. Self-contained HTML remains the flexible path for richer layouts.

## Storage and boundaries

- Data is saved outside the repo in `%LOCALAPPDATA%\Banking\AdvisorPrototype`, partitioned by a random HttpOnly, SameSite=Strict cookie. The cookie is scoped to `/api`, so ordinary `/artifact/...` requests do not carry it. The cookie lasts 30 days; clearing it loses the browser's access to its saved prototype workspace. This is not production identity or cross-device login.
- State persists on this PC and in this browser workspace. A remotely viewed Codex tab can reconnect to the same workspace; opening the loopback URL directly in a phone browser does not reach the PC. No remote publishing or tunnel was created.
- The renderer uses a separate **origin by port** plus `sandbox="allow-scripts"`, without same-origin privilege. Response CSP blocks fetch, external scripts/images, nested frames, forms, workers and other resources; the host's frame policy restricts frame destinations. The renderer issues no cookies and has no bank credentials. Render URLs are opaque, expire after 10 minutes and are recreated from persisted artifacts.
- This local two-port setup is not a separately registered site or a proven CPU/memory isolation boundary. The Codex browser blocked a second loopback IP, so the prototype uses two ports on 127.0.0.1. Evaluate a dedicated cookie-free renderer site and browser process isolation before any Live data or public deployment.
- A Stop preview action, readiness timeout, message-rate guard and readable summary support recovery. These are not hard execution quotas; a synchronous infinite loop or memory exhaustion can still hang a shared browser process. No deliberate infinite-loop test was run on Dan's active browser.
- Inputs are capped at 100,000 content characters, 8,000 serialized state characters, 12 analyses and 30 revisions per workspace. Render caches also have limits. Disk retention/cleanup, encrypted real-data artifact storage, robust multi-tab conflict handling and production abuse controls remain future work.
- This HTTP service stores synthetic content only. Do not paste personal bank data or secrets. No claim of production security follows from prototype tests.

## Verification — 12 September 2026

`node --test prototypes/advisor/server.test.mjs`: 10 passing tests, covering input validation, escaped Markdown, reconciled synthetic amounts, workspace isolation, cross-origin rejection, arbitrary content revisions, renderer policy headers, and persistence/theme recovery across restart. Both sample script blocks and host JavaScript pass syntax checks.

Codex browser verification: both interactive examples, keyboard slider input, saved-state recovery after refresh, original-layout restoration after a complete HTML/JS replacement, Markdown, centered unsaved-change dialog, all five themes, desktop, 820px tablet and 390px phone. No horizontal overflow in the inspected phone Markdown/tablet artifact states. Full-screen phone controls were verified reachable after correcting the iframe height override.

The disposable `browser-fixture.mjs` runs the same server at ports 5770/5771 with temporary storage and a local test receiver at 5772. Import `browser-probe.html` through the UI. Observed: parent DOM, cookies, storage, top navigation, popups, network and unauthorized tools blocked; synthetic read tool succeeded. External image/script/nested-frame and self-navigation attempts produced **zero receiver hits**. A plain forged parent message did not dirty the host. The message-rate guard stopped a 120-update burst. These checks are evidence for the tested Chromium/Codex configuration, not a complete browser security audit.

## Next decision

Additional browser check: an imported artifact that throws a script error shows a visible error state and readable fallback. Desktop preview: [screenshot](../../artifacts/advisor-prototype/desktop.jpg). The local prototype is left running at the URL above; disposable browser QA processes were stopped.

Review the actual generated experience with Dan before integration into the deployed app. Voice, Danish localization, real-data authorization, cross-device storage, public Demo cost controls and Azure deployment remain separate next steps.

## Local AI configuration and limits

The server loads `OPENAI_API_KEY` from the repository's ignored `.env` file, or its environment. The key was created in Dan's existing Aakesen / Default project following his explicit authorization and Chrome login. The file is restricted to its Windows owner, SYSTEM and Administrators. Do not print it or copy it into the renderer, logs, documentation or provider sandbox.

Raw HTTP uses the documented Agents API contract and `OpenAI-Beta: agents=v1`. The npm registry TLS handshake failed in this environment; no SDK was installed and no alternative model/provider was silently substituted. References: [quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [hosted files](https://developers.openai.com/api/docs/guides/agents-api/environments/files), [events](https://developers.openai.com/api/docs/guides/agents-api/sessions/events).

- One paid run at a time, up to ten prompts per local workspace, 4,000 characters per prompt and ten minutes per run. This is a bounded local prototype, not a public paid service.
- Hosted sandbox outbound network is disabled. It receives only the synthetic fixture and, for a follow-up, the selected artifact. No keys, Live records or repository files are uploaded.
- Duplicate request identities return the existing run. Streams reconcile the existing turn after disconnect rather than blindly replaying paid input. Only a completed root turn with the expected output file counts as success.
- Browser refresh reconnects to a pending run. A server process interruption preserves session identifiers and blocks another prompt pending operator recovery; automatic process-restart recovery is not implemented.
- Provider/setup failures remain visible. No sample response substitutes for a failed AI call. Cleanup outcomes are recorded, with bounded retries on provider deletion conflicts.
- A readable original summary is retained for fallback. It describes the initial analysis; subsequent interactive settings may differ.

Automated checks: `node --test prototypes/advisor/server.test.mjs prototypes/advisor/agent.test.mjs`. The agent tests use a fake transport; real Chrome/provider evidence is recorded separately in [E2E evidence](../../docs/advisor-e2e.md).

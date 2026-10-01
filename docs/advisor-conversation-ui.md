# Advisor conversation pane

12 September 2026. Implemented in the separate local synthetic Demo prototype, not the Azure app.

## Approved direction

Dan selected the third image from the latest refinement set: `design-targets/advisor-conversation.png`. Two corrections take precedence over the image: voice is an icon inside the composer beside Send; the top-right Close action becomes a sidebar icon for chat history. Expand opens a large modal with chats alongside the current conversation. Detailed voice animation is deferred.

## Behavior

- A floating, theme-aware conversation pane with chat bubbles, conversation starters, generated HTML/JS or Markdown, and an always-reachable text/voice composer.
- New chat creates an empty conversation. Chats opens a searchable overlay; expanded desktop mode places it beside the active conversation. Phone layouts use an overlay. Expand/collapse retains the mounted iframe and active WebRTC session.
- Typed and spoken messages appear in the same conversation. Long generated summaries are collapsed after an excerpt. Previous visual versions can be reopened from their message or the saved-analysis library.
- Drafts, message history, and selected artifact references persist in this browser's local storage. Artifacts/revisions retain the existing server-side Demo workspace storage. This is not cross-device history or production account storage.
- Typed follow-ups carry up to 16 bounded prior messages plus the selected artifact/state to the existing provider flow. Bank access and executable-renderer boundaries are unchanged. A new chat has separate context.
- Switching conversations during a running analysis is blocked with an explanation; active voice must be ended before switching. Expand and history inspection remain available. This prototype supports one active session, not multiple concurrent voice sessions.
- Theme selection is available from Appearance inside chat history, including on phones. Existing five Banking themes remain available.

## Scope limits

No deployment or Live-data AI activation. Voice animation, Danish shell localization, cross-device history, and integration into the main app remain separate work. Generated content varies with the model; the approved shell does not hardcode its chart layout. Old saved analyses remain accessible without inventing historical conversations for them.

Verification and screenshots are recorded in the root `design-qa.md`.

## Actual UI/provider verification

Chrome submitted a starter and a typed follow-up through the composer. Both completed via the Agents API and saved generated HTML. The follow-up rendered May 2029, 12 months sooner, and 10,000 DKK available for 2,000 DKK extra monthly. Refresh restored messages and version 2; switching chats restored an independent draft. A generated slider sent state to the host, survived expand/collapse, and triggered the centered unsaved-change dialog; the test edit was discarded.

The microphone icon started an actual GPT-Live WebRTC session using the existing synthetic audio test harness. Speech appeared as chat bubbles, `read_demo_context` ran, expansion preserved the session, and provider-confirmed close restored the start control. This test caught missing baseline date facts when no saved scenario was selected: voice initially inferred an incorrect date. The backend now supplies a calculated baseline alongside an explicit no-selection distinction. Retesting produced the correct Danish reply: 12,000 DKK available, May 2030, 44 deposits. A regression assertion covers those baseline values. Audio evidence: `artifacts/advisor-prototype/conversation-voice-output.webm`. The test used recorded synthetic speech, not a physical microphone; no new independent transcription of that recording was performed. The normal host was restored with test audio endpoints disabled.


Advisor shell refinement (12 September 2026): title is AI Bank Advisor. Remove the header Demo pill and connected footer label. New chat lives in the Chats drawer; header keeps Expand and Chats. Center the empty welcome in the conversation area without a subtitle. Anchor starters immediately above the composer. Voice uses a waveform with a subtle glowing spot, respecting reduced motion; Send uses a paper-plane icon. Configuration failures remain visible. Verified in the in-app browser at desktop and 390px width, including New chat from the drawer. Local synthetic prototype only.

Advisor follow-up (12 September 2026): replace the separate voice dot with a moving highlight masked to the waveform bars. The chats overlay uses a soft edge fade without a border or shadow; its top row contains search and an icon-only New chat action. Remove drawer Appearance and example exploration. Preserve host theme tokens and reduced-motion support. Verified drawer/New chat at desktop and 390px; waveform animation is running on the masked icon.

Welcome animation (12 September 2026): ten phrases cycle in shuffled order without adjacent repeats, type from a fixed left edge, pause, then type the next phrase without an ellipsis. Runs only for an empty conversation; pauses in hidden tabs and becomes static for reduced motion. Assistive technology receives a stable heading rather than per-character announcements. Desktop typing, ellipsis and phrase changes verified in the browser.

Welcome correction (12 September 2026): hide the entire intro as soon as messages exist, including restored chats. Keep the prompt only in its user bubble; the chat title remains in history. Remove ellipsis transitions between welcome phrases.

Advisor progress refinement (12 September 2026): place transient analysis/connection status in an assistant-style bubble within the conversation, not above the starters. Hide the bubble when complete; it is app status, not a persisted model response. Remove the decorative chat icon beside the main title.

Conversation cleanup (12 September 2026): remove artifact format/version metadata, revision footer, default summary section, starter buttons and composer footnote. Retain message input with accessible label, voice and Send, plus artifact title/Expand. Readable fallback appears only on rendering failure; unsaved-change protection and explicit voice saves remain. Verified the loaded conversation in a new preview tab, preserving the owner's unsaved scenario in the original tab.

Generative presentation split (12 September 2026, confirmed by Dan): explanations and recommendations belong in the AI message above the visual. Generated UI should focus on charts, key figures, comparisons and interactive controls, with short labels. Avoid repeated introductory headlines/paragraphs and source-fixture footers. Keep material assumptions in collapsed details. Updated the agent instructions and opened revision 2 of the current summer-house analysis with the duplicate introduction and fixture footer removed; original revision is preserved.

New chat clarification (12 September 2026): restore conversation starters above the composer for empty chats only. New chat opens without confirmation, preserves the previous conversation/draft, and saves a dirty analysis revision before switching. A failed save keeps the current conversation open. Existing confirmation remains for other actions that discard edits. Verified immediate New chat and restored starters in the original browser tab.

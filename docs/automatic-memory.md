# Automatic conversation memory

Confirmed 13 September 2026: implement memory first; process after conversations end. Spoken requests to end voice are implemented but must not be exercised in this development run. OpenTerminal is parked until its data sources are practically verified, with TradingView or another source as possible alternatives.

## Conversation boundaries

- Text: process after 10 minutes without chat activity. New chat or switching chats submits the previous segment immediately; it does not delete or lock the conversation.
- Voice: the existing end/cleanup lifecycle submits the segment. Active voice and background analysis send periodic activity updates so ordinary processing waits. A vanished browser eventually expires its activity lease.
- Page close/reload: best-effort authenticated keepalive submission; already queued inputs are persisted server-side and do not rely on browser timers.
- Only messages written since the advisor loaded are submitted. Old chat history is not bulk harvested. Continuing a chat submits only previously unprocessed user messages. Drafts, assistant text and generated artifacts are excluded.
- The queue scans every 15 seconds. Each segment contains at most 40 user messages / 24,000 JSON characters; unusually large recent segments retain the newest messages.

## Memory behavior

- Use the existing OpenAI Responses client and model with strict structured output; no sandbox or new provider is needed for extraction.
- At most three durable memories per segment. An explicit memory must retain an exact user quote and is marked AI-origin / confirmed. Interpretations remain AI-origin / needs review and are excluded from trusted advisor context until confirmed.
- Keep source chat title, message ID and quote, plus meaningful links only to existing memories. Do not overwrite existing memories automatically. Conflicts should be proposed for review. Current balances, market quotes, hypothetical figures and credentials are excluded by extraction instructions.
- Deleting a memory records suppression fingerprints for its content and supporting evidence. Identical content or the same evidence is not silently restored.
- The Memory page provides an automatic-memory switch, queued count, last completion, separate usage count and explicit retry for failed processing. Disable clears pending input and discards any in-flight result; an already submitted provider call may still complete and count toward usage.
- Separate limit: 12 automatic-memory requests per UTC day across the local service. These are request counts, not a monetary cap. Existing interactive quotas remain separate.
- Failed/uncertain provider attempts are not automatically repeated. Pending work survives a restart; interrupted in-flight work becomes a visible retry item. Successful and cancelled jobs discard queued text; saved memories retain their supporting quote. De-duplication uses message/content fingerprints.

## Spoken voice close

The Live instructions delegate a direct goodbye or request to close the call. A voice-only `end_voice_session` tool returns an `end-voice` action; the trusted UI calls its existing end routine, stops microphone tracks and closes the provider session. The handler runs before selected-artifact checks, so switching an analysis cannot prevent closure. Quoted farewells, hypothetical examples, negations and cancelling an analysis must not close voice. No spoken-close execution test was run, as requested.

## Validation

Engineering evidence is recorded here; user acceptance remains in the production-only test plan.

- 49 advisor regression tests passed, including nine automatic-memory tests: timing, continuation, exact evidence, AI interpretation review, deleted-memory suppression, disable/in-flight cancellation, late-request ordering, failures/manual retry, restart persistence and Demo/Live isolation. The voice-specific suite and spoken-close execution were intentionally not run.
- Real Chrome Demo: a savings preference sent as ordinary text was not saved by the immediate remember tool. Starting New chat queued it; the real OpenAI extraction completed at 15:32 Copenhagen and created “Separate emergency and holiday savings” with the exact user quote, AI origin and confirmed explicit-statement status. A prior duplicate segment completed without creating another memory. No Live data was used.
- The initial browser attempt exposed an existing router issue where an ordinary preference invoked immediate remember despite no explicit request. The router now exposes that tool only for explicit remember wording, covered by a regression test. Ordinary acknowledged preferences follow the end-of-conversation flow.
- Browser checked pause/re-enable, queued and complete status, source details, persistence after reload and the 390 × 844 mobile layout (document width 376, no horizontal overflow). No browser errors observed. Temporary viewport override reset.
- JavaScript syntax checks passed. The local advisor was restarted with the final implementation. Bank sync and Azure were unchanged.

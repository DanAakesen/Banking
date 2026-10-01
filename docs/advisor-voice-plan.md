# Hands-free advisor — local Demo implementation

## Earlier inspection (superseded by the implementation below)

12 September 2026. Dan requested voice testing and an explanation of tool calls. Inspected the current local prototype in Chrome and the local/main-app source. **Voice is not implemented**, so no microphone-to-spoken-response E2E could run. The prior successful tests cover text prompts, generated artifacts, interaction and persistence only. No voice session was started and no microphone recording was taken.

## Tool boundaries at the initial inspection (historical)

- The Agents API provides a hosted execution environment. The prototype supplies synthetic `demo.json` and optionally the selected saved artifact/state; it retrieves the completed `analysis.json` file. The three verified runs created real artifacts. Individual command/tool transcripts were not retained, so do not claim an audited count of Python or shell calls.
- No custom Banking tools or MCP connection are registered with the agent. An external required-action request currently fails visibly. Account, transaction, budget and goal APIs are not exposed to the agent.
- The generated iframe can request `read_demo_context` through the controlled MessageChannel. This browser helper returns the same synthetic fixture; it is not model-side function calling or Live access. Generated HTML has no microphone permission or bank credentials.

## Approved increment — synthetic only (implemented below)

Use GPT-Live 1 over WebRTC for speech and application-managed client delegation to the existing Agents API workflow. Keep the voice session in Banking's trusted shell; artifacts remain microphone-free. The permanent provider key stays server-side. Model entitlement for GPT-Live is not yet verified.

Proposed flow: microphone → voice session → delegated task → authorized Banking backend/tool → concise factual result to voice + artifact/state update to the UI. The voice model handles natural conversation while backend work continues. Keep transcripts, selected artifact/version, scenario inputs, language, period and workspace in one conversation. A delegation event contains metadata, not the user's utterance; construct work from the transcript and current application state.

Prioritize these narrow tools:

| Tool group | Intended behavior |
| --- | --- |
| Read financial context | Get verified cashflow, category totals, budgets and account-linked goal progress; return period, currency, data timestamp and missing-data flags |
| Calculate scenario | Trusted calculations for changed contributions or spending; return baseline, changed inputs and reconciled results |
| Present and refine | Generate an analysis, select one, expand it or apply validated scenario inputs to an artifact that supports them |
| Save and cancel | Save a scenario revision when requested; cancel background work; distinguish “stop speaking” from “cancel this analysis” |

Tools run through the backend: validate tool name and arguments, derive user/workspace from authentication, execute allowed operations, return structured results matched to the call, and only announce success after confirmation. No payments, trades or bank-data edits. UI controls must be an allowlist, never arbitrary script execution in the authenticated shell. Expose the same read-only financial services via MCP later if needed; MCP is not a prerequisite for in-app voice.

Use a fast path for reading facts, calculating scenarios and changing existing controls. Create new rich layouts in the background: observed initial prototype generations took **101–155 seconds**, which is unsuitable for every spoken turn. Keep the voice conversation responsive, acknowledge work briefly and present the verified result when ready. The discovered 12,500-versus-12,000 label error makes trusted calculation tools necessary before Live use; HTML envelope validation alone does not verify financial claims.

After one Start voice action and microphone permission, support natural Danish/English conversation, interruptions, short spoken summaries, “make it 4,000,” “compare with before,” “save this,” and “stop.” Show listening/speaking/working states, mute/end controls and text fallback. Spoken confirmations can authorize requested scenario persistence without requiring mouse clicks. Read-only queries and hypothetical changes need no repeated confirmation. Microphone capture ends with the voice session. Phone background/locked-screen behavior remains a separate device test, not a promised always-listening mode.

## E2E acceptance to run after implementation

1. Start in Chrome with synthetic data; send spoken audio and verify both the transcript and audible answer.
2. Ask a financial question requiring a real backend tool; reconcile the result and verify no Live data crosses the boundary.
3. Change the scenario by voice and verify both the spoken value and visible chart/state.
4. Interrupt speech, correct a number and confirm the correction is used; cancel an analysis without replaying or saving stale work.
5. Save by voice, reconnect and verify the same revision and context; test denied mic, tool failure and disconnect.
6. Verify on a real phone separately, including speaker feedback, Danish recognition, browser backgrounding and screen locking. Injected test audio does not establish real microphone/acoustic quality.

No implementation or deployment was performed during this inspection. Next work is the local voice-plus-tools increment, then its actual audio E2E test.

## Official references checked

- [GPT-Live model](https://developers.openai.com/api/docs/models/gpt-live-1)
- [Browser voice connection](https://developers.openai.com/api/docs/guides/live)
- [Client delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)


## Implementation authorized and built — 12 September 2026

Dan approved the local synthetic Demo increment. The shell now uses GPT-Live 1 WebRTC (OpenAI API audio, not browser recognition or speech synthesis), with gpt-5.6-terra Responses function routing for client delegations. The dedicated Banking key remains server-side. Both model IDs are accessible with that key, and real GPT-Live sessions have connected in Chrome.

Implemented tools: read_demo_context, calculate_scenario, save_scenario, generate_analysis, cancel_analysis and clarify. Calculations run deterministically on the server. Existing savings visuals receive bounded state changes; unsupported controls are reported honestly. Saving occurs only on request. Rich layouts still come from the Agents API hosted sandbox. Cancellation propagates to that job and prevents late artifacts being published.

The parent shell owns captions, microphone, audio playback, mute/end and tool feedback. Generated HTML retains its separate origin, opaque sandbox, blocked network and disabled microphone. Voice tasks derive workspace identity from the existing HttpOnly Demo cookie. Calls are deduplicated, inputs validated, stale selected-version results rejected. Conversation limits are a five-minute browser session, 30 tasks per call and 12 calls per local process. These are prototype safeguards, not a production billing cap.

Voice audio and transcript fragments are not written to ordinary server logs. Captions stay in browser memory; the explicit developer audio test mode records synthetic provider output in ignored artifacts solely for E2E verification. No Azure deployment or Live bank data was authorized in this increment. See advisor-voice-e2e.md for final acceptance evidence and limits.

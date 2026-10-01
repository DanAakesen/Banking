# Advisor voice — local Chrome acceptance

12 September 2026. Scope: the separately hosted synthetic Demo prototype at `http://127.0.0.1:5450/`. No Azure deployment, Banking.Api restart, Live bank queries or real-data AI processing.

## Verified with actual providers

Chrome used a real RTCPeerConnection, OpenAI `gpt-live-1`, the WebRTC audio track, transcript/delegation events, backend Responses function routing (`gpt-5.6-terra`) and application tools. The provider key stayed on the server. Input was explicitly synthetic recorded speech, injected through a developer test audio source rather than a physical microphone. Responses were real API audio, not browser TTS.

| Spoken operation | Observed result |
| --- | --- |
| Extra 4,000 DKK per month | `calculate_scenario`; chart state changed; 9,000 total monthly contribution, 8,000 left, October 2028, 25 deposits, 19 months earlier |
| Correction to 2,500 DKK | Second calculator call; chart returned to 2,500 extra, 7,500 total, 9,500 left, March 2029, 30 deposits, 14 months earlier |
| Save this scenario | `save_scenario`; actual local persistence produced version 6; dirty state cleared |
| Reload Chrome | Version 6 and its 2,500 DKK state restored |
| Danish question about the saved scenario | `read_demo_context`; restored state was recalculated on the backend; Danish API speech stated 9,500 kroner per month and March 2029, 14 months earlier |
| Create a new visual comparison | `generate_analysis`; a real Agents API hosted run started while voice continued |
| Cancel that background analysis | `cancel_analysis`; the run became cancelled, no new artifact/version appeared, existing version 6 survived, provider sandbox cleanup returned true |
| Generate a comparison and let it finish | A second voice-triggered Agents run completed, saved/opened version 7 automatically, cleaned up its sandbox, and triggered spoken completion. The rendered chart showed +2,000 DKK: May 2029 / 32 deposits / 10,000 DKK available, versus saved +2,500 DKK: March 2029 / 30 deposits / 9,500 DKK available. Voice correctly explained two months later and 500 DKK more available |
| End voice | `session.closed` confirmed; provider audio detached, microphone/test input tracks stopped, Start voice became available again |

The cancelled hosted session was `sess_03a1b04227913acb006aa572b4430481918ffb3df1f273a720`. Its local run journal records `cancelled` and `cleanupDone: true`. The three earlier text-prompt sessions also retain successful cleanup.

The final voice-generated comparison used `sess_0f8336cee50d264a006aa57545caa08191838fa1bec7d96ef5`, completed in 127 seconds, saved version 7 and recorded successful sandbox cleanup. Its completion was verified in the rendered chart and voice captions. That longer session's optional recording upload failed; the test-only upload ceiling was increased from 4 MB to 8 MB afterward. The independently transcribed Danish recording below was already captured successfully and retained separately.

## Actual audio evidence

Ignored local evidence files in `artifacts/advisor-prototype/`:

- `voice-english-output.webm` and `voice-english-output-transcript.json`: API speech includes October 2028 / 19 months sooner, the correction to March 2029 and save completion. The next test utterance interrupted the corrected available-amount sentence; do not treat that truncated sentence as full-value audio verification.
- `voice-danish-output.webm` and `voice-danish-output-transcript.json`: the final captured provider output was independently transcribed with the audio transcription API. It contains the complete Danish answer: **9,500 kroner per month**, **March 2029**, **14 months earlier**, with the no-interest assumption. This is audio-track evidence, not merely a successful commentary append or text caption.
- `voice-danish-input.wav`: explicit synthetic input used for the Danish test.

A test-harness issue was found and fixed: a Web Audio destination with no active source between clips stopped advancing the incoming audio clock. Backend results then failed to turn into speech until more audio arrived. A continuous zero-valued source now maintains the stream between clips, like a quiet microphone. Retesting observed `session.commentary.appended`, complete spoken answers, and graceful close. The application also surfaces unacknowledged speech delivery without replaying the tool.

## Automated and browser checks

`node --test prototypes/advisor/server.test.mjs prototypes/advisor/agent.test.mjs prototypes/advisor/voice.test.mjs`

19 tests cover the existing renderer/persistence/agent boundaries and new scenario reconciliation, invalid amount rejection, provider failure without automatic retry, unsupported tool rejection, session/workspace isolation, simultaneous connection reservation, delegation deduplication and cancellation discarding late results.

The microphone-denial UI was exercised in Chrome with a temporary document-only `getUserMedia` rejection. It displayed a friendly message and re-enabled Start voice. Navigation removed the stub; native behavior was verified restored and the origin's actual microphone permission remained `prompt`. This is a browser UI failure-path test, not a physical permission-dialog acceptance test.

Desktop inspection covered the normal voice controls and five existing themes. At a 900px desktop viewport, no page overflow was observed and inactive Mute/End controls were hidden; the browser viewport was restored afterward. Later screenshot captures timed out, so final generated-chart checks used the rendered iframe text and actual DOM state rather than claiming a final image capture. The test UI is hidden without its explicit query parameter; its audio endpoints are also disabled unless the server is started with `BANKING_VOICE_TEST=1`. Normal startup has no synthetic audio recorder.

## Remaining acceptance and prototype limits

- Physical microphone, speaker echo/noise, actual Danish recognition from Dan, and phone/background/lock-screen behavior still require device testing. No claim of an acoustic or mobile E2E pass.
- The main Azure app still has its previous advisor UI. This increment is a local prototype, ready for review before integration/deployment.
- Rich chart generation passed both the earlier text-prompt E2E and the final voice-started generation through saved artifact publication, automatic display and spoken completion. It is still slower than the calculator path; it runs in the background.
- Voice transcripts stay in browser memory; saved artifacts/state persist. A full conversation is not restored after reload. Supported existing savings controls update without a new model-generated chart; arbitrary artifact control schemas remain future work.
- Five minutes is a browser session limit, not a server-enforced production spend cap. Public Demo abuse controls, account authorization and production billing limits must precede publishing this voice endpoint.
- The model interprets the spoken request and chooses an allowlisted tool; server validation and workspace isolation constrain its effects. Financial calculations are deterministic; generated prose and visuals still need review.

## Protocol references used

- [GPT-Live browser WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Client delegation and result appends](https://developers.openai.com/api/docs/guides/live-delegation)

Browser SDP is exchanged by the trusted backend through `POST /v1/live/sessions`. The browser waits for `session.started`; it does not send another `session.start`. Delegation IDs are echoed unchanged. Financial/audio processing is restricted to the explicitly synthetic fixture in this prototype.

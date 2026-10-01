# Advisor prototype E2E — 12 September 2026

Scope: actual prompts through Chrome into the local prototype at http://127.0.0.1:5450/. Synthetic fixture only, not Banking Live or the Azure deployment. Dan explicitly approved creating the OpenAI key and requested Chrome after the remote setup widget failed.

## Confirmed first prompt

Prompt: "What if I save an extra 2,000 DKK per month toward the summer house?" with an interactive comparison and slider requested.

The Agents API created an OpenAI-hosted environment with outbound network disabled. The agent wrote `/workspace/outputs/analysis.json`; the app downloaded the artifact for the completed root turn, validated it and rendered its HTML/JS. It was not an offline sample.

Session: `sess_09a6ec7f51239dcf006aa564e26ba8819194c08ccaf5359dc7`. Turn: `turn_09a6ec7f51239dcf006aa564eb1ae481918ba7188d236d0907`. Hosted session deletion succeeded after download.

Observed in Chrome:

| Scenario | Monthly goal deposit | Deposits remaining | Goal date | Months gained | Monthly available |
| --- | ---: | ---: | --- | ---: | ---: |
| Original | 5,000 DKK | 44 | May 2030 | 0 | 12,000 DKK |
| Extra 2,000 | 7,000 DKK | 32 | May 2029 | 12 | 10,000 DKK |
| Slider changed to extra 2,500 | 7,500 DKK | 30 | March 2029 | 14 | 9,500 DKK |

Independent reconciliation: 400,000 target minus 180,000 balance = 220,000 remaining. Deposit count is ceiling(220,000 / monthly contribution), starting October 2026. Monthly available is 54,000 income minus 32,700 expenses minus 9,300 existing savings minus **only the extra** goal contribution. No returns, withdrawals or changes in other cashflow. Final deposits are capped: 3,000 DKK for the 2,000-extra scenario; 2,500 DKK for the 2,500-extra scenario.

Changed the generated slider with keyboard input, saved version 2, restarted the local server and refreshed Chrome. The 2,500 DKK setting and 9,500 DKK remaining were restored. A provenance issue in manually saved generated revisions was identified and corrected; older versions remain intact. The original-summary label now explicitly distinguishes it from changed interactive settings.

## Follow-up verification

A second Chrome prompt retained the saved 2,500 DKK setting and added a visual comparison with the original and an extra 4,000 DKK scenario. The generated version 3 retained the slider and graph, but three static labels incorrectly said **12,500 DKK** for baseline available-to-spend. That disagreed with both the fixture and the scenario calculations. The E2E check caught this; it was not marked as passed.

A third prompt, entered through the same advisor UI, explained the discrepancy and requested correction of all static labels and the actual slider maximum. Generated version 4 fixed the baseline card, maximum label and cashflow equation to **12,000 DKK**. Chrome verified:

| Comparison | Available/month | Deposits | Goal date | Months gained |
| --- | ---: | ---: | --- | ---: |
| Original | 12,000 DKK | 44 | May 2030 | 0 |
| Saved +2,500 DKK | 9,500 DKK | 30 | March 2029 | 14 |
| +4,000 DKK | 8,000 DKK | 25 | October 2028 | 19 |

The slider's End key selects 12,000 DKK extra, not 12,500: 17,000 monthly goal deposit, 13 deposits, October 2027, 31 months gained, zero available. Returned to the saved 2,500 setting and saved version 5; generated provenance was retained. Revisions 1–4 remain available, including the explicitly identified incorrect version 3.

Second session/turn: `sess_07d4f3b90d4ffbaf006aa565f976688191be4824dca520c1ee` / `turn_07d4f3b90d4ffbaf006aa56606b0bc8191bb4496e562faa4e5`.

Correction session/turn: `sess_0e849e1df4812b98006aa56698148c8191a43f25230fb4185d` / `turn_0e849e1df4812b98006aa566a29b44819199dd35aabb5b007a`.

All three hosted session deletions succeeded after their completed artifacts were downloaded. End-to-end run durations from saved timestamps were 155, 123 and 101 seconds respectively; these are observed prototype runs, not a latency guarantee.

Inspected the generated comparison in Light and Graphite. The actual desktop DOM had a page width equal to viewport width (1,836 CSS pixels), with no horizontal page overflow. [Chrome screenshot](../artifacts/advisor-prototype/real-ai-chrome.jpg). This task used Chrome desktop; no new phone test is claimed. Chrome was left open on the final saved analysis.

## Boundaries

All **13 automated tests pass**, including existing renderer isolation/persistence and new agent/API tests. Automated transport tests are separate from these live browser checks. No voice, real bank data, Azure deployment or main-app advisor integration was included. Provider cost was not returned in the observed completion event; no exact cost is claimed.

The completed E2E proves prompt, hosted execution, generated UI, interaction, persistence and refinement. It does **not** prove arbitrary generated financial claims are correct: the second response demonstrates why canonical calculation checks and clear provenance are necessary before Live integration. Current envelope validation checks shape/size, not financial semantics.

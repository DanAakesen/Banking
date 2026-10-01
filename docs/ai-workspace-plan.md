# AI workspace — plan and implementation

Confirmed 13 September 2026: plan and generate one image per page, then complete both locally without another approval pause. Deployment remains deferred until Dan requests it.

## Analysis

Dedicated left navigation entry. Searchable saved-analysis cards lead to a large isolated generative visual and a connected-dot history of dated runs. Suggestions use current saved data and explain their relevance; clicking starts an analysis only deliberately.

Every refresh reruns the saved question against freshly read Banking data, using a rolling window of the original duration and currency. Save the new data timestamp, period and financial summary with the new revision. Keep previous generated results and input snapshots immutable. A version selector and previous/current summary make repeat analysis useful over time; unavailable legacy inputs remain unknown. User-created scenarios remain assumptions, never writes to financial records. Failed refresh leaves the last successful version available and visibly reports failure. Reuse existing bounded hosted execution, cancellation, usage caps and isolated renderer.

Existing conversation artifacts are included when encountered and all new saved artifacts enter a persistent authenticated local library. Single-owner local Demo and Live libraries remain separate; production visitor scoping requires its later deployment design. No unrestricted filesystem discovery of unidentified old session files.

## Memory

Dedicated navigation entry beside Analysis. Graph is the primary desktop canvas, with search, origin filters, zoom/fit, draggable nodes and a selected-record inspector. List view provides equivalent keyboard/mobile access. Only stored explicit relationships produce graph edges; labels explain each connection. Node positions persist. Creation/edit use centered dialogs. Delete removes dangling relationships. AI/user provenance cannot be spoofed by form input and remains visible after user edits; suggested AI memories require review before being used as confirmed context.

Persist title, text, origin, review status, source description, created/updated timestamps, revision, relationships and layout position. AI-created suggestions are visibly distinguished from confirmed user priorities. Existing remembered priorities migrate lazily without losing text or IDs. Source and confirmation are different attributes. Demo/Live remain isolated, and all endpoints authenticate the Banking workspace.

## Visual targets

- [Analysis concept](design-targets/analysis-workspace.png)
- [Memory concept](design-targets/memory-workspace.png)

Use existing graphite/light/theme tokens, compact nav/body text, restrained borders and no colored left-edge selection strips. Images show illustrative records, not implemented data. Actual visuals must use saved records and computed values, not copy image numbers. Mobile stacks the inspector below the graph and keeps full CRUD available.

## Validation and delivery

Test memory CRUD, provenance, graph links, deletion cleanup, conflicts, workspace authorization and suggestion review. Test analysis current-data refresh, immutable versions, failure retention, idempotency and workspace isolation. Browser-test both pages, graph drag/search/filter/edit/delete, refresh/history and real provider output in Demo, plus phone/theme states. Update NEXT-01–04 in the production-only acceptance script and roadmap after verification.

## Implemented locally — 13 September 2026

- `#/memory` and `#/analysis` are separate entries under AI workspace, including the mobile More menu. Shared theme variables and centered creation/edit dialogs are retained.
- Memory supports title/text editing, labelled relationships, graph drag/pan/zoom/fit, persistent positions, keyboard movement, search, origin/review filters and an equivalent list. Phone defaults to the readable list; Graph remains available. The graph draws stored relationships only. Full delete removes incoming edges as well as the node.
- User-created records and AI-created suggestions preserve their origins after editing. Suggestion generation is deliberate, deduplicated and subject to existing usage limits. Confirmation is separate from origin; unreviewed suggestions stay out of trusted advisor context. Confirmed memories can inform suggested analysis cards. Background autonomous capture is not enabled.
- Analysis cards open the actual isolated HTML/JavaScript or Markdown artifact. Each refresh preserves the question, rolling period, currency and selected current state; it records a new version and an immutable data snapshot. Historical iframe requests receive historical data, never silently replaced live context. Period actuals are labelled separately from planned values inside an artifact.
- The local library survives app/provider-process restarts and Banking re-login, with Demo/Live separation. Existing artifacts are archived when encountered through their authenticated workspace. Old unidentifiable session files are not bulk-imported; no claim is made that every historical standalone browser workspace has been migrated.
- Existing local prototype limits remain: 12 analyses per current advisor workspace, 30 revisions per analysis, 10 prompts per advisor session, plus daily usage caps. Production persistence/visitor scoping and limits must be completed in the final deployment work; the local single-owner JSON store is not the production storage design.

### Evidence

- Backend: 89 tests passed; x64 build passed without warnings. Advisor Node suite: 52 tests passed. New coverage includes memory provenance/conflicts/edge cleanup, confirmed-context inclusion, inference exclusion, suggestion deduplication, archive isolation, fresh inputs, immutable history and failed refresh retention.
- Fixed a reproduced Windows `EPERM` atomic-file-rename race: retry only the bounded disk commit, never the paid provider prompt. Shutdown now waits for outstanding jobs/storage work. Recovery rechecks persisted status before treating a run as interrupted.
- Browser Demo: created two user memories and a real AI-generated suggestion; edited its title and relationship; confirmed it while retaining AI origin. Verified filter/list, custom delete confirmation and deletion of a disposable test memory. Drag position persisted across reload (807.1112572456044, 368.55184876175116); Light/Graphite both readable.
- Browser Demo: created **Saved budget at a glance** through the new page using the real hosted agent. Version 1 saved at 13:22 Copenhagen; refreshed version 2 saved at 13:28. Annual setting was carried into version 2; reopening version 1 restored Monthly. Both survived page reload and advisor-process restart. The source records did not change, so recorded period deltas were correctly zero. Automated tests separately prove changed inputs produce different saved snapshots.
- Browser phone check at 390×844: document scroll width 376; generated artifact body/client width both 302, with readable stacked controls and no internal horizontal overflow. Desktop default viewport and Graphite restored afterward.
- User production acceptance is **Not run**. NEXT-01–04 in the production-only script were updated. No Azure deployment or bank synchronization was performed.

### Provider test exception

The first UI request returned OpenAI `409 conflict_error` on session creation (request `req_17d96495a4da409aaff917de2524e94a`). Read-only checks found an idle Banking sandbox with no turns or items: `sess_0d7da4c593aefd7d006aa68635f0508191999ffb5384b43961`. Automatic approval review blocked the attempted cleanup/diagnostic command without a detailed reason; that sandbox was left intact. A later deliberate UI request and its refresh completed successfully. No automatic prompt replay or credentials change was added. Temporary diagnostic logging was removed. The rejected cleanup remains outstanding, separate from the completed page functionality.


## Memory graph refinement — 13 September 2026

- Replaced large text-filled circles with compact points and bounded labels underneath. Full titles/text remain available in the inspector and accessible names. Origin colors and review marks remain.
- Labels are 12 CSS pixels independent of SVG zoom, at most 150px wide and two lines. Colliding labels recede; selected/focused/hovered labels are revealed. Zoom strengthens label visibility; wheel zoom anchors to the pointer. Dragging and keyboard position persistence remain.
- Once-per-page center-out entrance lasts at most 1.1 seconds; interaction interrupts it and reduced-motion skips it. Animation changes displayed positions only, not saved node coordinates. No artificial relationships were added.
- Chrome Demo verification: five nodes; label widths 117–132px at default and after two zoom-ins (viewBox width 1000 → 640), with 12px font retained. Selected the long emergency/holiday memory and confirmed full inspector text. Search-empty state, keyboard move/restore and pointer drag/restore passed.
- Browser frame sampling observed 30 distinct entrance positions, beginning at the center and finishing at the saved position. Reduced-motion sampling found the graph with no entrance animation. Phone 390×844: list and graph worked, document scrollWidth 376, no horizontal overflow. Viewport and media emulation were restored. JavaScript syntax check passed.
- This is local evidence, not production acceptance. The production-only NEXT-01 checklist is updated; no deployment or bank sync.

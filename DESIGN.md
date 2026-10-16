Latest increment (12 September 2026): the approved advisor pane is integrated into local Demo Overview. Run `scripts/Start-OverviewAdvisor.ps1`; bank sync is disabled. Advisor uses a separate synthetic dataset, not Live data. No Azure deployment. See [local integration](docs/local-overview-advisor.md).

# Banking — product experience

17 September 2026: manual order entry starts beside the selected chart instrument (Buy, Sell, Orders), using a centered theme-aware ticket. Confirm the Saxo listing, choose account/whole shares/limit, review provider costs and explicitly place a SIM order. Keep SIM visible, distinguish accepted from filled, show missing quote access and retain the chart behind the modal. The first local increment supports day limit orders in shares; no AI order tool or LIVE order access.

Confirmed 17 September 2026: use one headline per introductory/hero heading group. Remove decorative eyebrows and subtitle copy across pages; retain data labels, freshness, assumptions and functional help. Applied to Markets, Overview, Goals, Loans, Investments, Pension, Memory and the welcome screen.

Markets controls, 17 September 2026 (supersedes the boxed hero version): place Saxo at the right end of the Markets tab row, outside the tablist semantics. Remove buying power. Use a compact environment selector and a styled status/action button: neutral disconnected, accent checking, green connected and amber failure/retry. Labels accompany color. Mobile wraps controls below the tabs. Implementation: `src/Banking.Api/wwwroot/markets.css` and `markets-ui.js`.

Local advisor prototype, 12 September 2026: voice controls live in the trusted advisor panel, above the text composer. Start voice becomes Mute/End while connected; captions and tool activity are expandable. Five theme variables are shared. A compact verified-scenario strip distinguishes server calculations from generated visuals. Generated iframes retain no microphone access. This prototype has not replaced the main app's advisor placeholder. See [voice acceptance](docs/advisor-voice-e2e.md).

12 September 2026 prototype implementation: the approved generative direction is now reviewable in the standalone [advisor canvas](prototypes/advisor/README.md). A compact right rail opens arbitrary artifacts into a larger canvas; phones support expanded viewing. Settings retains five shared themes, creation/editing uses centered dialogs, and revisions preserve both content and interaction state. This is a synthetic prototype for owner feedback, not the final advisor placement or a deployed AI feature.

12 September 2026: the advisor uses **generative UI**, with agent-authored HTML/CSS/JavaScript, Markdown and rich interactive artifacts rather than a fixed card catalog. Preserve the compact advisor entry with an expandable canvas, phone usability and all five themes. Executable artifacts are isolated from Banking's authenticated shell. This is a confirmed direction awaiting collaborative layout review and implementation; existing approved page layouts remain in place. See [generative advisor UI](docs/generative-advisor-ui.md).

10 September 2026: Overview's retention-percent and goal hero pills are replaced by Available to spend and Total savings, each opening an input/balance breakdown. User account names and savings marking live in Edit accounts. Debt → Loans is a blank navigation placeholder. All creation entry points use centered, scrollable modals over the current page; budget entries use a child modal and are saved with the budget. Preserve the existing photographic hero and theme tokens. These written corrections supersede the corresponding older targets. See [behavior and QA](docs/account-preferences-and-creation-modals.md).

Latest Budget target: approved option 1, `docs/design-targets/budget-studio.png`. Implemented in `budget-ui.js` and `budget.css`: shared panoramic hero height, four actual/budget comparisons, entry editor and category rail. Tablet insights move above the full-width editor. See `docs/budget-studio.md`; API values replace illustrative target figures.

## Panoramic Overview — approved 8 September 2026

Dan selected the first image from the two revised Overview concepts and explicitly requested implementation. The approved target is [overview-panoramic.png](docs/design-targets/overview-panoramic.png). Written financial semantics and the following corrections take precedence over illustrative image values.

- Photographic welcome with fading overlay pills, a full-width cash/account allocation ribbon, paired period comparisons, a proportional money-flow diagram, compact right-side advisor, spending mix, goal journey and a seven-day payment agenda. The transaction ledger remains on Accounts. The existing active-budget/creation shortcut remains below the dashboard.
- Morning (05:00–11:59), afternoon (12:00–17:59) and evening (18:00–04:59) follow Europe/Copenhagen, including daylight saving. Each has its own photograph, greeting and supporting message. Recheck every 30 seconds and when the tab becomes visible. Dan is named in Live; Demo receives a neutral greeting. Theme and time-of-day selection are independent.
- All five themes remain supported: Light, Graphite, Slate, Sand and Forest. Photography uses a contrast overlay; panels, charts, text and controls use theme tokens. Danish/English remain supported. Phone layouts show an equivalent labelled cash-flow summary instead of shrinking the desktop diagram into unreadable text.
- Financial pulse compares selected dates with the preceding equal-length period. The initial selection is one month; it is a rolling period, not a calendar month. Values and coverage come from the API. The flow conserves amounts: income plus any drawdown equals spending plus retained income. A deficit is explicitly drawn from balance, never mislabelled as income. Spending includes all categories, grouping the remainder as Other categories. Confirmed internal transfers are excluded.
- Advisor preview contains deterministic data insights and Review links, with an honest disconnected overlay. No model call, generated advice or transmission of financial data occurs. Accounts and spending rows open the corresponding account/category filter. Missing, incomplete and stale data remain visible; goal progress/status comes from the goal API.
- Dan also authorized Demo refinement to support this design. An explicit local script matched 66 known synthetic transfer pairs, classified 135 entries and added one editable fictional Family holiday goal with an account-linked baseline. Four coffee transactions remain for Review. Existing bank amounts, manual budgets and Live records were not changed. This is a specific exception to the earlier no-demo-goal-seeding instruction, not authorization for automatic resets or recurring seeding. A rerun made no changes.

Implementation: `wwwroot/overview.js`, `overview.css` and three local optimized WebP assets. The public static-file allowlist lists these exact paths; private APIs remain protected and CSP remains unchanged. No cloud resources or deployment.


Status: the owner approved the light Overview target on 7 September 2026, with Custom-only date fields. The first/darkest variant, Graphite, is also approved. Settings will offer five preset themes; three additional palettes remain to be designed. The local frontend is now implemented and browser-tested; Dan's acceptance remains. Development and browser verification remain local first. See [target states](docs/design-targets/README.md), [product](PRODUCT.md) and [phase plan](docs/project-plan.md).

## Overnight visual refinement — locally implemented

Dan authorized a quality pass followed by a substantial visual component upgrade. The implementation preserves the agreed navigation, account switching, Settings, budget semantics and disconnected advisor. It adds tonal surfaces, more consistent typography/controls, a cash-flow area/bar chart with keyboard and pointer inspection, selectable category rings, goal progress rings and a monthly budget waterfall. Tokens remain theme-aware. Values and chart geometry come from the local API or the unsaved budget draft; no synthetic series enter Live and no bank data leaves the app.

The new cash-flow view shows net transaction movement, not historical balances. Income/Spending modes show period totals, while Net saved shows cumulative net from the selected period's start. Long periods group daily points into at most 60 displayed buckets without dropping transactions. A data table and range input provide accessible inspection. Three factual highlights report spending per calendar day, days with spending, and net/income when income is positive. Missing or incomplete coverage remains explicit.

Reference research and decisions: [overnight report](docs/overnight-quality-ui.md). SVG components live in charts.js and shared visual refinements in visuals.css, loaded after styles.css. No external chart library, hosted renderer or framework migration was introduced. CSS motion respects reduced-motion preferences; mobile chart geometry adjusts to available width. The owner will review subjective visual quality in the morning.

## Local frontend implementation — approved corrections

Accounts/currency correction, 8 September 2026: keep insights beside transactions when both fit; on narrower desktop/tablet widths (above 650px), place insights above the ledger. Preserve the current phone order. Monetary displays use the locale-formatted number followed by the currency code at a smaller size, including charts, goals, budgets, transaction details and balances. Plain-text equivalents serve accessible chart labels; never place HTML markup in an ARIA attribute.

Consistency correction, 8 September 2026: use `sectionAction` / `.text-action` for View all and equivalent section links. Links and dialog buttons share typography, arrow SVG, focus treatment and spacing; place collection actions in the section header. Do not add screen-specific variations. Back links use `.back-link`, and primary navigation actions use button styling.

Accounts uses one content-width layout rule: ledger and a 340px insights rail only when the content region has at least 1200px; otherwise insights use columns of at least 280px, above the ledger on tablet/narrow desktop and below it on phones. Cards must fit their contents, including values and ring legends. The shared shell and transaction cards switch to mobile at 900px. Category controls have enough room for readable labels and retain equal-width option panels; option text must never collapse into a vertical stack of letters. Conflicting earlier Accounts layout rules were removed. Validate intermediate widths and internal card/option overflow, not only page scroll width. Evidence: [consistency pass](docs/ui-consistency.md).

Budget refinement, 8 September 2026: use one Income/Expense/Savings dropdown per entry; map Savings to the existing Expense + Savings storage model. Place name editing and currency in the top plan bar; saved plans offer Rename in place of the picker while editing. Remove the duplicate name section. All dropdown option panels must equal their trigger width; wrap long option labels within that width, including searchable account and budget menus. Native picker sizing uses its implicit anchor ([MDN reference](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select)); platform-native pickers in browsers without customizable-select support remain platform controlled.

Demo transactions, accounts and transaction-generated budget entries use natural names without a repeated Demo prefix. The account identity still clearly identifies the Demo workspace. Existing synthetic descriptions are cleaned locally without changing amounts, IDs, manual categories or manual budget names; source fingerprints remain stable across resync.

Header refinement, 8 September 2026: raise the desktop Banking brand and page headings by 16px; move only the brand left by removing its extra inset. Group Period and Currency into one compact toolbar with inline labels, with Last sync as a quiet secondary line underneath. Custom dates expand within the toolbar only when selected. Reuse this header treatment on Overview and Accounts and let it fill the available width on phones. Keep the selected range inside the first Overview section.

Navigation icons use 17px sizing and a 9px gap to the label, including the account popup, so their scale matches the compact text and row spacing.

Overview/menu correction, 8 September 2026: the account popup uses the same compact 34px rows and zero item gap as primary navigation. Overview has no Available/Booked toggle or balance-type/account-count subtitle. It keeps the existing available-balance basis, with missing balances left unknown. The selected date range sits at the top right inside the first balance section, rather than below the Overview heading; it scopes transaction metrics, not the current balance. Last sync and period controls retain their positions in the page header.

Budget concept follow-up: Dan accepted the revised visual direction and requested Income/Expense on every entry plus monthly totals for income, expenses, savings and available to spend (Rådighedsbeløb). He confirmed Expense + Savings marker for savings entries. Replace the concept's top summary with these four figures; label ordinary expenses as excluding savings, and calculate available to spend as income − ordinary expenses − planned savings. Add Type to the editor and Savings only for Expense. The stored image predates these written corrections; no additional image approval round is required. These corrections are now implemented locally.

Budget correction, 7 September 2026: Dan found the category-card page unclear and specified named budgets containing recurring entries, a manual-first empty state, merge/new transaction generation and active-plan selection. Replace the card wall with a clear entry editor, plan selector and useful planning totals. [Budget redesign](docs/budget-redesign.md) separates confirmed behavior from proposed layout/model details. Dan approved the revised concept and subsequently said 'Build it'. The editor, searchable plan picker, four monthly figures, breakdown rail and reviewed merge/new workflow are now implemented. The concept remains a visual reference; actual browser captures are in local-frontend.md.

Review approval, 7 September 2026: Dan said, "The image looks good. Proceed with build." The [Review concept](docs/design-concepts/2026-09-07/13-review-inbox-proposal.png) is now implemented locally: queue on the left, selected transaction/pair and actions on the right, searchable account filter, type counts, newest/oldest sorting and recent changes with Undo. Counts and ordering come from stored data rather than the illustrative image. On mobile the panes stack and selecting a row moves focus to its details. Review replaces Activity in navigation; Accounts remains the ledger. Legacy Activity deep links remain supported. No new image approval or cloud approval is implied.

Dan approved proceeding with the reviewed layouts: "The periods should be 1 dropdown, and the demo up top should not be there otherwise ok for now. We can iterate on them when they are done. Proceed." This is local frontend implementation approval, not Azure/deployment approval.

The interface now uses one period dropdown with Custom-only date inputs. There is no account selector in the mobile page header; The current Dan/Demo identity appears in desktop navigation, the mobile More panel, and Settings navigation; switching uses Sign out and the welcome screen. The approved shell, Settings, mobile creation flows and five theme directions are implemented with native JavaScript modules, HTML and shared CSS tokens served by the existing .NET app. Light, Graphite, Slate, Sand and Forest work in Settings; language and theme persist locally across workspaces.

Implemented screens: Overview, accounts, activity/search/manual classification, categories/rules, internal-transfer matching, budgets with preview/review/create/edit, goals with detail/create/edit, connection/import status, dedicated Settings, and disconnected advisor overlay. The future investment/pension pages honestly show that connections are unavailable. No automatic goal/budget creation.

Actual browser screenshots and checks are in [local-frontend.md](docs/local-frontend.md). Chrome checks passed at 360px, 390px and desktop, including all five theme text-contrast checks, bilingual preference persistence, owner edits in disposable data, and late-response isolation. Subjective refinement and Dan's own creation acceptance remain. The earlier mockups are visual references; these written corrections take precedence.

Owner desktop review: Overview accepted with two corrections: remove the Overview “How this was calculated” disclosure and place Last sync at the top right above the period controls. Keep budget-preview calculation details. Review actual desktop screenshots one page at a time; Accounts is next.

## Accounts redesign — approved and implemented locally

Dan approved the Accounts/insights concept with a searchable account selector in place of fixed account tiles, so the layout works with four, ten or more accounts. Keep account and category colours. No further generated concept was requested.

Accounts combines a paginated transaction ledger (dedicated Account column, manual categories, text/category filters) and a right-hand insights rail: money in/out, category spending and upcoming seven-day estimates. The searchable single-account dropdown includes All accounts and a scrollable list. Account and currency selection scope both ledger and insights; the period scopes historical transactions and cash flow. Search/category narrow the ledger only. Upcoming estimates always look ahead seven days. Available balance is current, not historical. Activity remains available for the broader transaction tools.

Colours identify accounts and categories consistently throughout the current workspace; labels remain the primary identifiers, and the ten-colour palette can repeat for larger collections. Classification edits refresh the insights. Charts use full-period server aggregates, never the visible page. Only confirmed matched transfers are excluded; pending items do not enter cash flow. Missing balances, incomplete history, undated exclusions and estimates are explicit. Responsive cards replace table columns on narrow screens. Theme and language settings apply.

## Latest agreed interaction requirements

Latest execution checkpoint: Dan asked to proceed to the next of the four agreed steps. [Frontend review and handoff](docs/frontend-review.md) records exact status, mobile navigation, goal/budget creation flows and written corrections to the generated proposals. Dan subsequently approved the layouts with the single-dropdown/no-top-Demo corrections; they are now implemented locally. Settings follows the reviewed direction.

- Settings is a separate page with its own settings navigation on the left and content in the middle; a Back to Overview action returns to the front page. Profile, Language, and Appearance are proposed sections. All five preset theme choices belong in Appearance; custom themes come later.
- Mobile support is mandatory. Proposed narrow-screen pattern: a compact settings section selector above the content and a visible Back to Overview action, with no squeezed desktop sidebar or horizontal form overflow. Review the mobile presentation with Dan.
- Advisor pills/overlay are placeholders only for now: show Not connected and do not simulate a working chat or fabricated personalized advice. No AI service or data sharing is enabled.
- Goals and budgets are created by Dan through the UI, in both workspaces. Show useful empty states and Create goal / Create budget actions. Budget suggestions are requested previews until explicitly saved; never auto-create records or seed new demo budgets. Existing demo budgets are historical fixtures and must not be deleted silently.
- Dan agreed to the local build sequence and remote screenshot review. Proceed with backend additions and approved UI scope; review remaining mobile/other-screen layouts before their implementation. No cloud/deployment approval is implied.

## Collaborative design before frontend implementation

Complete and verify the MVP backend locally first. Then work with Dan on how to present the available information and actions. The screen list below is discussion material, not an approved layout or permission to implement it.

Use the backend's actual data contracts and representative synthetic data to discuss user journeys, information priorities, navigation, mobile layouts, charts, and error/empty states. Prepare reviewable wireframes or visual mockups together with Dan. Record the selected design, any changes, and Dan's explicit approval here before building frontend screens, components, styling, or a dashboard.

Light and Graphite Overview are approved design targets. The owner has now agreed to continue the local build; implement the approved direction after backend verification and use focused visual checkpoints for remaining layouts. Other screens, responsive/mobile layouts, and behavior still need appropriate design work. API documentation, automated tests, and technical request clients remain available for backend verification.

Frontend design approval is separate from the later approval for Azure resources and deployment.

The implemented API contracts and synthetic examples are listed in [local-backend.md](docs/local-backend.md). Design approval does not establish implementation of new goals, advisor, trend or recurring-payment capabilities.

## User and core tasks

### Owner feedback — 7 September 2026

The owner selected the first visual direction and approved its v3 light Overview with the additional period-control correction below. The image plus these written corrections form the target; written corrections take precedence where the image differs.

- Retain the light first concept and its left navigation. Reduce the header to essential page/period context.
- Show the current account in the lower-left utility row: **Dan** for live data and **Demo** for synthetic data. The row opens Settings, Connections and Sign out; switch accounts through the welcome screen after signing out. This replaces the separate Live/Demo toggle shown in both target images. Profile settings and Danish/English language selection are inside Settings, not on Overview. Project documentation/code remain English; the product interface supports both languages.
- Keep the advisor accessible on the right without a permanent wide sidebar. Small contextual suggestion pills open an overlay chat. Opening/closing must preserve the underlying page and selected context. Desktop images show the closed and open states; mobile interaction remains to be designed.
- Overview should show expected upcoming payments, comparable income/spending/net-saving trends, and progress toward goals. Expected payments are estimates from recurring transactions, not confirmed bank-scheduled instructions. Display estimation and data coverage clearly.
- The personal advisor uses connected data and owner-defined goals, explains assumptions and sources, and remains read-only. Investments/pension are future connections; missing values must remain unknown rather than zero.
- Period presets: 1 week, 1 month, 3 months, 6 months and 1 year, plus Custom. **From/To input controls appear only after clicking Custom**, and disappear when selecting a preset. The effective range can remain readable beneath the Overview title. The existing light image shows the fields under a preset; this is explicitly superseded by the owner's correction, with no replacement light image requested. Proposed comparison default: preceding equal-length interval, clearly labeled. Presets/partial-period semantics need consistent calculation; zero comparison baselines must not produce invented percentages.
- Add Goals at a glance on Overview, showing progress and status against each owner's plan. Proposed states are green On track, amber At risk, red Behind plan, always accompanied by labels/icons. A completion percentage alone does not determine status: compare pace/projected completion with the target plan/deadline. Exact thresholds remain a product decision. Missing plans/data require a neutral unknown state. The filled bar shows target completion; status text explains ahead/below plan.
- Goal setup includes name, description, target amount/currency, optional deadline, and a measurement selector: one account or all-account total in the current workspace. A goal detail view groups progress/source information with editable notes and optional labeled links to the thing being saved for. This proposed details layout still needs collaborative screen design. Goal names, descriptions, notes, and links provide context to the read-only advisor; links do not imply automatic fetching or permission to act on external sites.
- Show the measured balance, dedicated source account label, and freshness alongside goal progress. The basis is booked balance. Missing balances stay unknown; mixed currencies require explicit conversion rules. Each account supports at most one goal. All-account and shared-account goals are disallowed; account balances are not added across goals. Without a defined pace/baseline, show completion progress and a neutral plan status rather than inventing On track or Behind plan.

Approved light Overview: [canonical target](docs/design-targets/overview-light.png), derived from revision v3. It supersedes the closed-chat v2 image for utility placement, period selection and goal status, subject to Custom-only inputs. The v2 open-chat image demonstrates overlay behavior; its surrounding Overview must inherit the approved refinements. The owner selected the first/darkest candidate, Graphite: [approved dark target](docs/design-targets/overview-dark.png). The Dan/Demo account-selector correction applies to both images; written requirements override older controls in the images.

Revised image targets: [Overview with advisor pills](docs/design-concepts/2026-09-07/04-ledger-v2-overview.png) and [Open advisor overlay](docs/design-concepts/2026-09-07/05-ledger-v2-advisor-open.png). Both use fictional figures. Charts are visual mockups, not authoritative calculations; production charts must reconcile with their numbers. The initial image includes a redundant brand subtitle to remove, as demonstrated in the overlay state.

These additions led to the planning backend and frontend now described in local-frontend.md. Separate persisted suggestion revision provenance and actual advisor integration remain later work. The owner has subsequently agreed to local implementation and visual checkpoints; actual AI integration and all cloud/deployment work remain deferred.

Dan should be able to quickly see available/booked balances, income, spending, and budget status, inspect a transaction, and correct its category. Mobile is the primary layout priority. Bank setup and consent must be understandable without exposing technical details.

## Proposed screens

| Screen | Content and actions |
|---|---|
| Overview | Balances by currency, income/spending/net for the selected period, budget status, and last synchronization |
| Accounts | Bank, account, balance type, connection status, and the available history period |
| Transactions | Search and filters; clear reservation/booking state; category change with an option to create a rule |
| Budgets | Named plan selector and active badge; manual entry editor with amount/frequency; monthly-equivalent and annual planning totals; reviewed transaction suggestions with merge/new-plan choice |
| Settings | Profile, Danish/English language, and five preset themes; custom themes later |
| Goals | Balance-linked progress; create/edit name, description, target and optional deadline; select one account or all accounts; details with notes and reference links |
| Connections | Add bank, import progress, errors, consent expiry, and reconnection |

## States and trust

- The account row at the bottom of the left sidebar clearly displays Dan or Demo. Demo is publicly accessible; Dan requires owner authentication. Their data stays isolated. Switching clears previous views/caches and advisor context and suppresses late responses. The isolated product-demo backend and browser switching are implemented and tested, including late-response rejection.
- Budget creation starts manually when no plan exists. From transactions is an alternative with source period, coverage and calculation basis; existing plans trigger a merge/new-plan choice. Dan reviews proposed entries and explicitly accepts updates to existing values. Later synchronization or regenerated suggestions must not silently overwrite saved/manual entries. Insufficient history is an explicit state. The revised workflow must also work on isolated Demo data; see budget-redesign.md for the implemented workflow and remaining extensions.

- Show loading, empty dataset, partial import, synchronization failure, and expired consent as distinct states.
- Show the timestamp and covered period. Show preserved history during an error with clear freshness status; never invent replacement figures.
- Mark synthetic development data as demo data. Never silently switch between demo and real data.
- Distinguish zero, unknown, and not loaded. Do not show a combined balance across currencies without an explicit exchange rate.
- Preserve manual categories during the next sync; internal transfers must be explainable and correctable.
- Provide no payment or bank transfer buttons. Bank access approval opens the bank's flow in the regular browser.

## Visual direction

The approved light target uses a warm-white canvas, ink typography, cobalt interaction accents, thin dividers, restrained outlined icons and flat content groups. Preserve its layout and hierarchy in dark mode; theme changes must not change data or behavior. Graphite, the first/darkest variant, is the approved dark target. Keep goal-state colors semantic and accompanied by text/icons in every theme. Settings contains a picker with five preset choices: Light and Graphite are approved; Slate, Sand and Forest are the implemented additional themes. Midnight remains an unselected exploration. Save theme choice as a user preference independent of Dan/Demo selection; custom themes are a later extension. Theme tokens and browser checks are implemented; owner visual acceptance remains.

## Local verification

Test mobile and desktop, keyboard navigation, focus, contrast in all five themes, reduced motion, category changes, automatic-budget review/manual-edit preservation, Dan/Demo switching and language/theme preference persistence, period presets/Custom, and import/error states. Numbers and chart geometry must agree for the same filters. The owner approved the image targets and mobile workflows with written corrections; the running implementation now has browser evidence in docs/local-frontend.md. This does not complete owner acceptance or approve deployment.

## Welcome and local sign-in — 8 September 2026

The approved entry flow has two clear actions: Try Demo (no login, synthetic data) and Sign in as Dan (private owner workspace). A quiet two-column welcome layout reuses the existing Graphite/theme tokens and stacks on phones. There are no financial figures on the public shell. Owner password setup/sign-in use labelled fields, matching-password validation, disabled pending controls, and recoverable errors. Guest Settings identifies Demo and offers Sign in as Dan on the Profile page. Owner Settings offers first-time password setup. Both languages are supported. See docs/local-access.md for the server boundary.


## Account menu and dropdown lists — 8 September 2026

Dan requested the full bottom account row as the utility-menu trigger. The row now opens Settings, Connections and Sign out only. Switching between Dan and Demo goes through Sign out and the welcome screen. Settings and Connections are removed from the primary sidebar and mobile More navigation; mobile More has the same account-row menu. The standalone Settings page retains its own section navigation. Sign out revokes the session and returns to the root welcome screen with Try Demo and Sign in as Dan.

All native selects share themed control, option, hover/focus, selection and disabled styles. Supporting Chromium browsers use CSS `appearance: base-select` and `::picker(select)` for the opened option list, retaining native select/form/keyboard semantics. Other engines retain native pickers with theme colour fallbacks; platform picker chrome may differ. The custom searchable account and budget lists use the same surface/border/radius treatment. No external component dependency was added.

Implementation reference: [MDN customizable select](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select). Opened lists and account menus were visually checked in the local Chrome harness at desktop and 390px, with all five theme variants captured.

Sidebar density refinement: compact 34px primary navigation rows with no row gap and reduced section spacing; the full-width desktop account trigger is one 36px row with avatar, name and a vertically aligned three-dot icon, without a workspace subtitle. Mobile retains a 40px account trigger. The menu contains only Settings, Connections and Sign out; switching Dan/Demo goes through Sign out and the welcome screen. Do not use colored left-edge accents on navigation, cards or selected rows anywhere in the interface. Use surface fills and text/icon color for selection instead.

## Empty budgets and goals — 8 September 2026

Confirmed UX correction: collection pages with no saved records show an explicit No budgets yet / No goals yet state and one prominent Create action. Visiting Budgets no longer creates or opens a draft. Create budget opens /budgets/new with manual defaults; From transactions is a secondary entry. New drafts have Back/Cancel and no redundant New budget button or empty plan picker. Cancellation returns to the empty collection without writing records. Existing plans still open the active/first plan and retain New budget. Goals uses the same visual empty-state treatment and a single creation action.

Overview distinguishes zero budgets (Create budget opens the editor directly) from existing inactive budgets (Choose budget). No goals/budgets are populated as part of this change.

### Overview colour and navigation refinement (8 September 2026)

User-confirmed direction: compact the desktop sidebar and improve light-theme chart colours, goal markers and photograph date readability. The shared sidebar is 176 px; existing row heights and the mobile navigation breakpoint remain. Overview chart pigments use dedicated tokens in `overview.css` so mint, apricot and blue fills do not lighten semantic text colours. Goal start/current markers use the progress colour; the target uses a tinted blue fill. The photograph date has a dark translucent backing across all scenes and themes.

Browser verification: all five themes at 1600, 1024 and 390 px, plus English/Danish Settings navigation at 1024 px; no page overflow, clipped Settings links or script errors. Actual screenshots and results are in `artifacts/ui-review/overview-colour-*` and `sidebar-settings-da.png`.

Overview refinement: use the heading “Cash Flow” (“Pengestrøm” in Danish), without a date subtitle, expandable chart-data table or routine internal-transfer note. Keep financial calculations unchanged, accessible chart labels and conditional missing-history/undated-entry warnings.

### Category-linked budget progress

Confirmed request: align the family Demo budget with categories so progress can be measured. Budget progress cards show actual / full monthly allowance and remaining or over-budget amounts; income cards show received / planned. The view uses the current calendar month with explicit dates, independently of the Overview cash-flow period. Shared category/type entries combine into one card. Overview shows three expense categories and a View budget link; Budgets shows all groups. Category links are edited in a separate expandable Transaction categories section, preserving the budget entry table layout. Unsaved edits replace progress with a save prompt until persisted. Existing themes, currency suffixes and native dropdown sizing apply.

Savings entries remain planned contributions. Goals keep the account-balance basis and are not allocated money by spending-category progress. Missing links and data coverage are explicitly identified; unknown activity is not presented as a zero-cost success.

### One goal per account — confirmed 8 September 2026

The owner corrected shared-balance tracking: each goal needs a dedicated account. Create/Edit now requires a single account and excludes accounts claimed by other goals. The current goal retains its own account when editing. With no free account, the form explains how to connect one. The API serializes assignment checks and rejects concurrent duplicate claims. Legacy shared/all-account goals show unknown progress with a Choose a dedicated account prompt until explicitly reassigned; no Live records are automatically moved. Demo has dedicated Holiday (Savings), Car savings and Summer house savings accounts. See `docs/dedicated-goal-accounts.md`.

### Accounts: approved explorer layout — 8 September 2026

Dan selected the second displayed Accounts concept and explicitly requested implementation. The exact source is [accounts-atlas.png](docs/design-targets/accounts-atlas.png), originally exec-e2764f0c-ebea-4c20-bd58-70c6d49b7273.png. It replaces the table-and-right-insights layout: panoramic cash summary, account balance allocation, income/spending/net-retained metrics, searchable account directory, compact category spending strip, and seven-row transaction pages. Keep the shared narrow navigation, themes, currency suffixes and account/category colours.

The directory sits left of transactions on wide desktop; below 1200px it moves above the ledger, becoming a horizontally scrollable account list on phones. The spending strip remains above transaction rows. Full-period aggregates are independent of transaction search, category filtering and pagination; account, currency and date selections scope them. Account balances remain current available balances; the ring and bar are allocation, not historical growth. Missing/negative balances suppress allocation, stale/incomplete history stays explicit, and the comparison uses the preceding equal-length period. No sample data is stored by this redesign. See [implementation and verification](docs/accounts-atlas.md).

### Hero consolidation — 8 September 2026

Dan requested removing Accounts' subtitle, visible Total cash label, decorative heading and both date lines. The balance retains its accessible label. Accounts and Overview now share hero heights and top alignment: 320px on wide desktop, 360px on narrower desktop (901–1359px), and content-driven height on smaller screens. Overview's existing cash/allocation/account strip is inside the scenic hero with a translucent dark footer. No financial calculations or filtering changed. This supersedes the corresponding labels and separate balance panel in the prior image targets.

Verified locally: 30 page/theme/viewport states across all five themes, plus 44 English/Danish page/width states (360–1600px). No page or hero overflow; matching desktop heights and preserved Overview-account navigation. Screenshots and initial matrix: artifacts/ui-review/hero-refine-* and hero-refinement.json.


### Goals gallery — 9 September 2026

Approved target: [Goals option 1](docs/design-targets/goals-gallery.png), the first displayed image, with the status pill moved to the right of each card title. Implemented in the existing shell: scenic shared-height hero, photo-led cards, familiar dot-line progress, selected-goal contribution reconciliation, monthly timeline and estimated date impact. Whole card bodies select the journey; photo upload/removal, local plan edits and existing notes/links work. All five themes and both languages remain.

API-backed financial semantics and explicit Demo refinements supersede inconsistent illustrative figures in the generated reference. Holiday shows regular contributions; Car shows an August deposit returned to Everyday and a one-month delay. See [implementation and evidence](docs/goals-gallery.md). The source hero height yields to the existing owner-approved 320/360px shared height. Photographs are generated stock-style assets, replaced by each user's uploaded goal photo. No colored left-border indicators.


Goals refinement, 9 September: complete cards (including photos) select and reveal details; the upload control remains independent. Behind-plan tracks/dots use the red semantic token dynamically, amber for AtRisk, neutral for Unknown. Successful contribution labels are removed. Withdrawals, including zero, use expense red until current status Reached. The forecast now emphasizes a single estimated date, timing status, remaining deposits/amount, next deposit and specific shortfall impact, with assumptions collapsed. See docs/goals-gallery.md for the latest accepted behavior and local checks.


### Selected goal detail — 9 September 2026

Dan approved the first image in the latest three-concept set: [Contribution-first detail](docs/design-targets/goals-contribution-detail.png). Replaces the previous three-column reconciliation/forecast panel and later KPI forecast iteration. Preserve the upper cards; the lower panel adds monthly actual-versus-plan contributions, a planned next point, a concise explanation of timing, net period movements, and the goal's own notes/photo/links. Exact transactions and calculation assumptions are collapsed together. Existing theme tokens and status colors apply; on phones the timeline becomes vertical. Use API-backed net contributions and real saved references rather than illustrative dates or invented links in the mock. See docs/goals-gallery.md and design-qa.md for evidence.

### Review focus — 9 September 2026

Approved first Review target: [Review focus](docs/design-targets/review-focus.png). Scenic shared-height hero, account-scoped counts, All/Categories/Transfers filters, compact inbox and adjacent category/transfer editor. Empty state retains the same visual shell. Existing category/rule, bulk, matching, snooze and undo APIs remain the source of behavior. Similar-item selection only includes equal descriptions on the current page. Review shows evidence for candidate internal transfers; it cannot initiate bank transfers.

Dan explicitly authorized preparing persistent Demo review data: six purchases without categories and two balanced candidate internal-transfer pairs. See scripts/Prepare-DemoReview.ps1 and artifacts/ui-review/review-demo-preparation.json. Preparation is an explicit one-time action, never an automatic startup reset; user review choices persist. Amounts, dates, balances, budgets and goal plans are unchanged. See design-qa.md for local verification; prior Goals QA is retained in docs/goals-detail-design-qa.md.

### App-wide consistency — 10 September 2026

Confirmed: Dan rejects colored left-edge selection indicators throughout the application, including dropdown items. Use tonal fill, text emphasis and semantic selected state; retain complete accessible focus outlines. Neutral structural separators and actual chart/timeline geometry are distinct from decorative selection strips.

The local QA pass also aligned Accounts page typography, Overview goal status colors, mobile budget cards, utility list search, empty-state alignment, dialog labels and matched-transfer metadata. Evidence and the owner-login verification limitation are recorded in [UI QA](docs/ui-qa-2026-09-10.md).

Unsaved changes (10 September 2026): use a centered theme-aware confirmation above the current screen, with Keep editing as the focused primary choice and Discard changes as the alternative. Escape keeps editing. Preserve the browser warning only for document unload, which cannot be styled.

Accounts navigator (10 September 2026): keep balances below account names at every breakpoint. Each account has an accessible pencil action opening the existing Edit accounts modal with that account selected; selection and editing are separate controls. The directory contains account cards only. When an account filter is active, a compact All accounts action beside the heading clears it. Widen the desktop directory modestly and remove the spending-increase card below the account list. Preserve the existing account preferences dialog for savings classification.

Accounts balance ring (10 September 2026): replace the account count with the percentage of selected available cash held in accounts explicitly marked as savings, in the selected currency. Keep account-colored segments; hover/focus reveals account name, amount and percentage, and activation filters transactions to the account. Reuse the account directory as the readable alternative for tiny/zero slices. Do not render a part-of-whole ring when balances are missing, negative or total zero. Existing freshness warnings remain visible. Period metrics span the full hero width; smaller screens wrap into fewer columns and currency may wrap separately from the number.

Accounts ring placement refinement: at desktop widths of 1400px and above, place the detail text to the right of the ring, vertically centered, and lower the group slightly. Smaller layouts retain the text below. Verified at 1920/1400/1280/390px with no page overflow and clearance above the period metrics.

Account cards: remove the relative-to-largest-account balance bars. They imply target progress without a target. Keep account name, balance, state warnings and edit action; use the hero chart for balance distribution. Confirmed by Dan on 10 September 2026.

Account carousel refinement (updated 13 September 2026): the account directory is a single horizontal row above the ledger at every breakpoint, with previous/next arrows, native touch scrolling and keyboard navigation. Cards expand equally to fill the available row. Transparent arrows overlay the cards without reserving side gutters. Small theme-aware segments below show the current page and remaining pages, follow scrolling, and disappear when all accounts fit. Arrow navigation uses those same page positions. Preserve name-above-balance and per-account editing. Search resets scrolling, and account selection keeps the selected card visible. Transaction title and Rules & categories share a wrapping heading row; filters occupy a separate row, with search above category/action on narrow ledger containers.

Bank evidence (10 September 2026): a separate account-level booked balance history sits between the directory and ledger, with an explicitly labelled account picker and selected period. Plot only uniquely reconciled daily closing observations; missing/ambiguous days break the line. Date/value inspection and a collapsed value list provide accessible alternatives. Do not imply this is current available cash or goal progress. The existing centered transaction modal contains readable counterpart details; identifiers are masked, technical bank codes and rule creation are collapsed. Review suggestions explain the bank evidence and remain uncommitted until Save/Confirm. Use shared theme tokens, currency suffixes and responsive grids; never introduce colored left-edge borders. See docs/bank-metadata.md.

Advisor prototype follow-up (12 September 2026): the local studio now has a real prompt form and an explicit Refine the selected analysis choice. Offline examples sit in a collapsed section. Agent-authored output uses the existing isolated canvas, theme variables and revision history. An original-summary label distinguishes the generated fallback from later slider settings. This is a local synthetic demonstration; Banking's deployed advisor overlay is unchanged. See docs/advisor-e2e.md.



### Advisor conversation pane — 12 September 2026

Approved target: [latest option 3](docs/design-targets/advisor-conversation.png). Voice is an icon inside the composer beside Send; replace Close with the chats-sidebar icon. Keep Expand as a large modal with chat history beside the active conversation. Detailed voice animation is deferred. The separate local Demo prototype now implements this shell with shared themes, real typed/voice messages, inline isolated generated artifacts, browser-persisted chats/drafts, and searchable history. See [behavior and boundaries](docs/advisor-conversation-ui.md). The scenic background reuses Banking's existing evening asset; generated analysis content stays model-authored. No main-app integration or Azure deployment in this increment.


Advisor shell refinement (12 September 2026): title is AI Bank Advisor. Remove the header Demo pill and connected footer label. New chat lives in the Chats drawer; header keeps Expand and Chats. Center the empty welcome in the conversation area without a subtitle. Anchor starters immediately above the composer. Voice uses a waveform with a subtle glowing spot, respecting reduced motion; Send uses a paper-plane icon. Configuration failures remain visible. Verified in the in-app browser at desktop and 390px width, including New chat from the drawer. Local synthetic prototype only.

## 12 September 2026 — Sculpted Overview loading animation

Confirmed by Dan: implement concept 3 with a person inside a circle and six surrounding financial icons. The loading canvas must blend into the header and navigation, with continuously inward-moving data streams, one line of five rotating phrases that slide in from the left and retreat left, animated ellipsis, and a gradual transparent reveal when ready. Remove the secondary text line. Selected reference: [sculpted concept](docs/design-targets/loading-sculpted.png).

Implemented locally in `loading-ui.js` and `loading.css`: shaded SVG sculptures in stationary, upright glass tiles, 42 moving particles and six data packets, a travelling ring highlight, 4.6-second phrase cycles in English/Danish, and a 1.2-second fade. Theme background matches the surrounding page exactly; there is no enclosing card, border, or backdrop image. Overview keeps its header visible from the initial session/account requests through dashboard and budget completion. Other pages retain their existing loaders. Dan subsequently requested a five-second minimum visible period before the 1.2-second fade and equal icon spacing: six positions at 60-degree intervals on a shared radius. No simulated completion percentages. Reduced motion disables continuous movement and removes the fade delay, retaining the five-second minimum. See [verification](docs/loading-animation.md). No deployment authorized by this increment.

Advisor follow-up (12 September 2026): replace the separate voice dot with a moving highlight masked to the waveform bars. The chats overlay uses a soft edge fade without a border or shadow; its top row contains search and an icon-only New chat action. Remove drawer Appearance and example exploration. Preserve host theme tokens and reduced-motion support. Verified drawer/New chat at desktop and 390px; waveform animation is running on the masked icon.

Temporary loading review setting: Dan requested a 10-second minimum for visual review, superseding the five-second setting for now. The existing completion fade and stationary icon layout remain unchanged.

Loading completion fade is now 2.5 seconds (slower reveal requested by Dan); the temporary 10-second minimum remains.

Loading phrases now use larger type (24–36px desktop, 23px phone) and more space above (72px desktop, 78px phone), as requested by Dan.

## 27 September 2026 — Monogram loader (supersedes all earlier loading screens)

Dan selected the Monogram concept from three prototypes and asked for it to be kept: "Definitely monogram. Looks amazing… it's stunning." He values its coherence with the app's AI orb visuals, which comes from the shared `--accent`/`--ai-accent` tokens and the particle style. Treat this as a strong, settled preference. Change it only on Dan's explicit request.

The loader is one compact particle glyph plus one status line, used for both startup and page changes:
- While loading, the particles never form a letter. They cycle through an orbiting ring, an infinity ribbon and a dense core.
- Only when the page is fully rendered do they assemble into the brand initial ("B"). At startup, the initial then flies onto the sidebar brand icon and plays a landing sequence (pop, shine, ring pulse, then the rest of the name slides in).
- The wordmark is that icon followed by "anking", and screen readers still hear "Banking".
- The initial follows `brandName`, so renaming the app updates it.

Behavior, accessibility and verification: [loading-animation.md](docs/loading-animation.md). Comparison prototype: `prototypes/loading-concepts/`.

Generative presentation split (12 September 2026, confirmed by Dan): explanations and recommendations belong in the AI message above the visual. Generated UI should focus on charts, key figures, comparisons and interactive controls, with short labels. Avoid repeated introductory headlines/paragraphs and source-fixture footers. Keep material assumptions in collapsed details. Updated the agent instructions and opened revision 2 of the current summer-house analysis with the duplicate introduction and fixture footer removed; original revision is preserved.

Persistent voice companion (13 September 2026, approved by Dan): keep one advisor iframe outside route content. Mini mode uses a draggable waveform capsule and a thin full outline from the same error/red token as Stop, without a colored left border. Show replacing assistant-only captions, at most two lines, above or below the capsule as space permits. Use the same measured audio wave and Stop control inside the chat composer. Preserve mouse/touch dragging, keyboard arrows/Home reset, safe-area clamping, reduced motion and app themes. Expanded chat retains the existing messages, history and isolated generative UI. Design references: docs/design/voice-companion/.

13 September follow-up: the voice mini pill disappears as soon as Stop is pressed or the session ends. Restart from Overview; no inactive floating launcher. On desktop, Cash Flow spans two equal columns and AI one, aligned with the three equally sized cards below. Tablet uses equal halves; below 701 px AI comes before Cash Flow. This mobile ordering is interim; AI-13 tracks a dedicated mobile advisor experience.
# AI workspace pages — accepted direction, 13 September 2026

Dan requested one concept per page followed immediately by local implementation. Targets: [Memory](docs/design-targets/memory-workspace.png) and [Analysis](docs/design-targets/analysis-workspace.png). Memory uses a luminous graph with only stored, labelled relationships; blue marks user origin and amber marks AI origin, supplemented by textual labels and review state. A selected-node inspector contains the actual text, sources and CRUD actions. Drag/pan/zoom and a readable list serve different screen sizes. Analysis uses scenic shared styling, compact saved cards, a large isolated generative visual, and a connected-dot dated version history. Refresh reads current data and adds a version; it never overwrites history. Sources and periods remain inspectable without decorative duplicate financial claims. See [implementation](docs/ai-workspace-plan.md).


Memory graph refinement (13 September 2026): Dan supplied Obsidian references for zoomed-out and zoomed-in views. Compact origin-colored points replace oversized circles; 12px screen-sized labels sit below points, wrap to two bounded lines, and reveal full text in the inspector. Zoom increases emphasis rather than text size. Only saved edges appear. One roughly one-second center-out entrance per page visit respects reduced motion, with no replay on selection or filtering. Phone retains list-first access. Implementation: ai-workspace-ui.js and ai-workspace.css. Markets is planning-only with a strict free TradingView constraint; see docs/markets-free-design.md.

Markets (16 September 2026): approved concept 2 with owner corrections. Workspace + Explore; chart/watchlist occupy two thirds and persistent Overview advisor one third on desktop. Shared --banking-hero-height, no market-pulse strip or lower three sections. See docs/markets-phase-1.md. Dark/light themes and currency suffixes stay shared. Holdings means owned positions, not orders.

Shared AI effects (16 September 2026, selected by Dan): Libraries.dev Colorful Pulse Inner beam on the composer; Thinking Orbs map Breathing to listening, Composing to speaking, Solving to working and Searching to application tool requests. Initially scoped to Overview, then extended by Dan to the shared composer on all Banking pages. Effects respect reduced motion. See [implementation and validation](docs/overview-ai-effects.md).

## Global floating advisor — 17 September 2026

Approved target: [selected floating concept](docs/design-targets/advisor-floating-approved.png). This supersedes the page-column and mini-pill layouts above. One authenticated advisor iframe belongs to the application shell across every route. The default composer floats at bottom center; chat bubbles, generated visuals and history have readable individual surfaces without an enclosing panel. Chat and orb positions can be dragged independently, keyboard moved and reset, and are clamped on resize. Expanded chat keeps the same session.

Starting voice minimizes to the existing Thinking Orbs particle engine, with a reflected pool of light underneath. Hover, keyboard focus or tap reveals Stop, Show chat, Expand and caption controls. Latest assistant speech occupies a replacing two-line caption; user speech is not shown there. Ending voice removes the voice orb and returns to chat. Explicitly minimizing an idle chat leaves a small reopen launcher. Reduced motion stops continuous animation. Overview and Markets regain their full content width. Implementation and validation: [floating advisor](docs/floating-advisor.md).

Chat readability refinement: Dan selected the second displayed concept, [individual glass surfaces](docs/design-targets/advisor-glass-selected.png), with AI messages aligned left and user messages right. Neutral shaded surfaces, fine silver edges and soft depth replace accent-tinted fills, while the outer space stays transparent. Minimum widths keep short messages readable (110px AI, 80px user, constrained to the available width). The centered drag control uses the existing Tabler icon family, six-dot `grip-vertical`, at 24px. Do not copy the concept image's decorative page content or change existing Banking data.

Latest owner refinement: place an 18px Tabler `grid-dots` (3×3 dots) in the toolbar instead of a separate drag row. Remove user message timestamps. Preserve left/right alignment and compact bubble widths. Give advisor surfaces a distinct theme-specific palette: Graphite violet, Slate petrol, Light lavender, Sand clay, Forest sage, each with related user-surface, border and icon colors. The page palette and transparent outer advisor shell remain unchanged.


Current refinement: short user bubbles size to their content with a 40px floor, retaining right alignment. Borders and inset highlights are quiet, with soft shadows. Shared `--ai-*` tokens in the main theme styles drive the advisor, starters, history drawer and minimized launcher. User bubbles use a contrasting secondary hue: Graphite blue, Light pale blue, Slate indigo, Sand sage, Forest blue-grey. The compact-width control lives at the input's left; desktop widths are 600px and 400px, constrained on smaller screens. The 44px minimized launcher uses a theme-colored halo for visibility. Starters use the same advisor surface and accent colors.

AI Glass (17 September 2026): optional Appearance switch, separate from the five color themes and off by default. It applies an optical glass finish to advisor bubbles, composer, starters, toolbar, history and minimized launcher while preserving role colors and a transparent outer shell. Chromium uses the locally vendored MIT Liquid Glass library; other browsers receive its blur fallback. Reduced-transparency preference restores solid surfaces. Native activity disclosure has no permanent chevron: an arrow follows the title on hover/focus, and the full summary expands with click, Enter or Space. Touch devices retain a subtle arrow for discoverability. Toolbar/input separation is 10px.

Owner correction: replace the compact-width toggle with a window-style draggable left composer edge. The right edge stays anchored; dragging left widens continuously and dragging right narrows to 400px. The horizontal resize cursor and a quiet hover/focus line identify the edge. Persist the chosen width independently of the toolbar's move grip. Small phone screens fit the available viewport. This supersedes the earlier compact-button design.

Owner position refinement: chat and minimized/voice companion share one persisted bottom-right anchor. Opening chat grows left/up from the minimized location; closing shrinks to the same corner. Viewport clamping keeps larger presentations visible without overwriting the stored location. This supersedes independent chat/orb position storage.


17 September orb simplification: use the existing animated voice orb for minimized text chat too (84px launcher, 112px voice canvas), retaining the reflected-light effect and shared position. Add a solid theme-colored shaded core so page content does not show through its center. Voice status is always visible; hover/tap reveals centered circular actions. Remove all advisor expansion/maximize presentation, controls and message protocol. Normal chat remains draggable and continuously resizable.


17 September chat material selection: Dan selected option 2 in `docs/design-targets/chat-materials-2026-09-17/option-2.png`, with less bulbous curves/highlights and narrower bubbles. The standard finish now has quiet bevel lighting, soft elevation and opaque theme-colored writing surfaces. Optional AI Glass refracts actual parent-page content in a narrow rim, with a more opaque inset behind text; chat text itself is never displaced. Both roles cap at 78% of available conversation width (short replies retain content sizing), AI left/user right. The existing Glass preference remains independent and off by default.

Owner Glass correction (17 September): supersedes the inset-writing-surface choice above. Glass uses one continuous translucent theme tint, without a solid inner panel. Composer has edge lighting only, no cast shadow below; other optical surfaces use subtle elevation.

17 September minimized text chat: keep the orb compact with an always-visible Ready label. Reuse voice's solving animation and Working status during text requests. Prefer a small unread message badge + Reply ready over automatic reply bubbles; clicking opens the full response and clears the notification. Failures show Check chat. Voice retains its own live status.

17 September workspace drawer redesign: opaque theme-colored overlay aligned to the chat's top/right, ending above the composer so it covers the toolbar. Header includes Close. A compact left navigation switches Chats, Analyses, Memories and Usage; only one view is visible. Chats use single-line title/date rows and a dedicated search field rather than bubbles. No Glass refraction on the drawer. Retain independent list scrolling, Escape/close, focus return and reduced-motion support.

17 September compact-width refinement: lower the continuous chat resize minimum from 400px to 280px. Reuse that one minimum for persisted-width validation, pointer/keyboard clamping, accessibility values and resize-handle visibility. Keep the right edge anchored; narrower viewports still fit within their margins.

17 September 2026: Overview account balances use a responsive grid with no internal scrollbar or height cap; the scenic hero grows when rows wrap. Freshness shows the oldest available balance date, labels Demo snapshots and links real-account users to bank connection/sync details. Markets keeps watchlist/holdings beside the chart on tablet; stacking begins only at the existing 700px mobile breakpoint.

17 September mobile More menu: a bottom-aligned sheet capped at 390px or 52dvh, with a fixed header/account row and independently scrolling navigation. Keep 44px controls, 48px links, safe-area spacing, and a subtle 240ms rise/fade disabled for reduced motion. Applies only to More at the existing 900px mobile navigation breakpoint. Local browser checks passed at 390x844 and 320x568: internal scrolling, account popup, navigation, class cleanup and Escape. Not deployed.

17 September mobile chat boundary: expanded and minimized chat are clamped 12px above the measured bottom navigation (including its safe-area padding) at the 900px mobile navigation breakpoint. Chat height also fits the remaining visible viewport. Desktop positioning is unchanged. Verified at 390x844 and 320x568, including repeated downward movement and minimize/restore; six boundary/status tests pass. Local only.

17 September Saxo account cards: owner approved Account value / Available to trade / Invested / Unbooked activity below Markets tabs. Four equal theme-aware cards on desktop, two columns on narrower non-mobile workspaces, and compact 82%-width native scroll-snap cards below 700px with a visible next-card edge and clickable line indicators. Match the Accounts carousel's subtle borders and restrained colour accents. Each card opens an opaque account-detail drawer. Explicit account currency and SIM/LIVE context stay visible; no placeholder balances or provider sample performance history.


17 September mobile information-first pass: below 700px, use one compact page heading and remove the separate Banking masthead. Overview, Accounts, Review, Budget and Goals use short theme-aware summaries instead of scenic introduction panels; financial figures remain available. Goal images are shallow, creation actions share the heading row, and budget controls use a compact grid. Markets replaces the scenic hero with search, retains the Saxo account carousel and makes the stock selector horizontally scrollable above the chart. Desktop layouts are unchanged. The cross-page phone overrides live at the end of markets.css, which is loaded after the page styles.

Mobile header refinement: prominent 1.8rem page titles; Overview/Accounts period and currency controls occupy their own full-width, borderless row below the title, followed by left-aligned freshness text. Preserve 44px select targets. Verified locally in Chrome at 390px.

### Language consistency (18 September 2026)

Interface copy, dates and accessibility labels follow the shared Danish/English setting, including the floating advisor and its drawer. Known synthetic Demo record text stays Danish independently of this preference; preserve actual names, saved conversations and user-authored text. Use explicit translations at render boundaries, not a page-wide text replacement over financial or conversational content.


18 September initial loading: owner selected the third generated line-flow design, with travelling pulses on every line and progressing startup stages. This supersedes shell-visible loading. loading-ui.js/loading.css now display 32 staggered SVG line pulses in a full-screen theme-aware composition; shell and advisor are hidden while the app is inert. Progress advances with completed request groups and reaches 100 only after rendering/validation. No fake elapsed-time percentage. The short completion/fade transition is the only timed hold. First successful workspace load per document session only; navigation does not replay it. Reduced motion disables pulses/transitions. Errors cancel loading and expose Retry.

## Compact scenic summaries — 18 September 2026

Owner correction: retain the photographs on tablet and phone, but let content determine hero height. This supersedes the earlier mobile photo removal. The shared responsive overrides at the end of markets.css cover Overview, Accounts, Review, Budget, Goals and Markets. Tablet summaries group metrics into rows; mobile removes decorative headings and keeps the image behind useful content. Account balance legends wrap and grow naturally on desktop/tablet, rather than using a nested scroll area. On phone the account directory remains the complete interactive list.

Local browser checks at 1440, 1024, 768, 390 and 320 px found no document-width overflow or internal hero overflow on those six routes. Tablet Budget was refined from 446 px to 188 px; final DOM geometry confirmed no width overflow. Tablet Accounts and phone Markets were visually inspected. A final tablet Budget screenshot timed out, so that last refinement was geometry-checked rather than screenshot-reviewed. No deployment.

## Unified page header anatomy — 18 September 2026

Owner rejected independent hero compaction as inconsistent. The shared header() now marks Overview, Accounts, Review, Budgets, Goals and Markets with scenic-page-head and the current scene. One photo title/action band replaces duplicate decorative headings; financial counts, balances and search belong in compact theme-colored summaries below it. The six pages share typography, photo crop, contrast overlay, border radius, padding and responsive control wrapping. This supersedes the preceding compact-scenic-summary treatment. Desktop follows the same anatomy. Page-specific behavior and controls remain intact.

Verification: app.js syntax check passed. Local Chrome visual review of tablet Goals/Review and mobile Markets; all six routes have the shared header with no document-width overflow at 390, 768 and 1440 px. No deployment.

### Sidebar rail and header actions — 18 September 2026
Shared scenic titles increased to 2.15rem (1.85rem phone). Header controls align right. Primary creation actions move to a quiet action row above goal cards or budget controls. The sidebar's top-right panel button toggles a persisted 64px icon rail above 900px, retaining accessible link names and hover titles. Mobile retains bottom navigation. Overview's oldest available account last-success timestamp is shown at the top of the account popup instead of its header. Local Chrome verified collapse, navigation persistence, expand, account popup timestamp, Goals action relocation and mobile Budget layout without width overflow; app.js syntax passed. No deployment.

## 360 financial overview — 18 September 2026

Replaces the old two-pill/cash-balance overview section with the approved connected-wealth direction. Seven everyday metrics sit above an interactive cash/investments/pension allocation chart and asset details. Cash subdivides into account arcs. Keyboard/pointer selection highlights details; metric actions reuse existing detail dialogs and routes.

Breakpoints use the overview content container (including sidebar effects): mobile up to 700px, tablet above 700px and below 1100px, desktop from 1100px. Tablet/phone use a metric carousel; phone shows only the selected asset panel. Narrow desktop labels stack their icon above the label from 1100–1240px. Text may wrap; financial amounts are never ellipsized.

Actual bank balances, account insights, recurring estimates, budget month-to-date progress and dated wealth statements supply the figures. Daily income/spending sparklines use recorded booked transactions. Missing investment/pension values remain unknown and mark the total partial. Savings are already in cash; no SIM balance is added. Statement return/contribution breakdowns and wealth history are not fabricated where the data model has no such history. Negative balances suppress the allocation chart while retaining numeric details.

Local validation: allocation tests (3) and JavaScript syntax checks passed. Actual Demo totals reconciled: 447,847 DKK cash + 510,000 DKK pension = 957,847 DKK recorded assets; absent investment values are marked unknown. Browser inspected desktop, tablet and mobile; tested 320–1600px plus both content-width boundaries. Long Danish metric labels were corrected at narrow desktop sizes. No HTML text or document-width overflow in final checks; SVG labels also fit their chart bounds. Verified mobile asset selection, last-card carousel navigation, keyboard chart selection and available-to-spend dialog. Production checklist updated. No deployment.

### 360 visual fidelity and Demo development — 18 September 2026
Owner requested stronger colors and actual visual content matching the approved concept. Account tracks are now substantial colored bars; the allocation uses layered blue/teal/purple fills and selected account highlighting. Six Demo metric cards have distinct calendar-based trend series ending at their displayed value. Available money and cash rise at month-end payday and decline afterward; savings and income rise in payday steps; spending accumulates and budget remaining decreases. Upcoming expenses uses a payment count and next due date instead of a sparkline. Per the owner's correction, the 360 section has no Demo/illustrative badges or captions; workspace isolation and internal source metadata remain intact. Investments show a six-month area chart; pension shows contributions and returns with reconciled stacked bars. These simulated visual series are supplied by the workspace-scoped wealth overview endpoint only for Demo, never Live. They are not historical provider observations.

Owner explicitly approved additional Demo data: a 125,000 DKK fictional non-cash investment statement is seeded only when no investment statement exists. It is separate from Saxo holdings/orders and available through the existing wealth/AI data layer. Existing pension and other data remain intact. The local Demo total is 1,082,847 DKK: 447,847 cash + 125,000 investments + 510,000 pension. Demo pension components are 324,000 + 186,000 DKK. No new Saxo holdings or orders.

Validation: build passed with no warnings; five wealth tests and three JS allocation tests passed. Verified seven Demo sparklines, populated panels, desktop render and mobile selection/overflow checks, including a narrow 291px effective viewport. No deployment.

Latest refinement validation: four overview JS tests passed, including payday timing, savings steps, cumulative spending, remaining budget and final-value reconciliation. Browser verified six sparklines, upcoming payment count/date, no Demo/illustrative section text and no mobile content overflow. Local only.

Period correction: investment history and percentage performance follow the selected date window (interpolated boundaries within available history only). Pension now shows contributions and returns during that window; headline statement balances remain latest recorded values. Demo pension calendar fixtures are isolated from Live, with monthly deposits of 1% of accumulated contributions and annual growth of 4.5% of the balance. These supersede the lifetime pension bar in the prior visual refinement.

## Budget overview — approved hybrid A, 18 September 2026
The owner approved `docs/design-targets/budget-overview-approved.png`, with equal-width lower panels. Overview now uses four metric cards, cumulative actual spending plus an explicitly estimated daily-run-rate forecast, and saturated category tiles comparing actual spending with monthly planned amounts. Month selection refreshes this budget section independently. Cash flow history must reconcile with budget actuals before charting; missing or insufficient history cannot produce a projection. Savings uses actual linked transfers, not the mock image amount.
Content container boundaries: above 950px four cards and a two-plus-three category mosaic; 651–950px swipeable cards and equal lower panels with two-column tiles; up to 650px the lower panels stack and cards swipe. Existing empty budget creation/selection remains available. No deployment.

Local verification: nine budget/360 calculation tests passed; JavaScript syntax passed. Browser month switching from September to August updated totals (37,396 DKK August expenses, 3,576 DKK rounded remaining). Checked 1600px desktop, 900px tablet and 390/320px phone viewports; equal tablet panel widths and no budget text or document horizontal overflow. Month selection and mobile layout were inspected in the local browser. Completed months use a month-total caption rather than a future estimate.

Budget visual refinement (18 September): reduced top-card padding, icon and mini-chart heights; removed fixed minimum card heights across breakpoints. Category fills retain more saturation through their gradients with a rose final tile, matching the owner's reference. Tokens remain scoped to .budget-visual in visuals.css.

## UI refinement pass — 25 September 2026

Dan approved an 18-item UI pass (review in the VS Code browser, Demo workspace, all five themes). Local only; not deployed. Investments, Pension, Advisor and Loans pages were out of scope; Analysis and Memory were not changed.

- **360 → Budget section:** Light and Sand use theme surfaces for the four cards and both lower panels (the approved saturated category tiles are unchanged); the month picker follows the theme's colour scheme. The spending forecast ends the actual line at the oldest account sync, shades the gap as "No data", starts the estimate from the last data day and labels "Data to …". The chart re-renders to fill its panel height instead of letterboxing. Category tiles and Spending mix use a glyph chosen from the category name (Danish or English), not list position.
- **Budgets:** summaries use whole kroner; decimals remain only in entry details. Differences read "62 DKK left" / "1,696 DKK over" and "75 DKK below plan" instead of signed numbers. Plan-status pills use theme colours in Light/Sand. The category list shows eight rows with "Show all categories (N)" instead of an inner scroll area. Entry amounts are text fields formatted with the app language's decimal separator; drafts still send dot-decimal values.
- **Accounts:** a single booked-balance observation shows a plain note instead of a lone dot; balance amounts use the account-card precision.
- **Review:** the bank merchant category is shown as supporting evidence: "Suggested: Transport · Bank category: Fuel".
- **Goals and 360 goal section:** goals without a photo get a stable per-goal colour and a name-based glyph; Demo photos match both English and Danish names (Bil/Car, Sommerhus/Summer house). Stale balances state their age, e.g. "Balance is 14 days old. Status updates after the next sync."
- **Floating chat:** an explicit idle minimize/open choice is remembered per browser (`banking.floating-presentation.v1`) with the existing position; voice minimizing stays temporary. The orb status label sits on its own theme surface.
- **Markets:** without an active Saxo session, the account summary explains the state and offers Connect Saxo SIM (or Retry after errors); Buy/Sell/Orders are disabled with "Connect Saxo SIM to trade". The TradingView attribution is Banking's own link because the library logo's injected inline style is blocked by the CSP.
- **Tablet (701–900px):** pages with the shared scenic header no longer show the separate Banking masthead; other pages keep it.
- **Settings → Appearance:** previews show each theme's background, surfaces, accent and chat colours.
- **Demo freshness:** `scripts/Start-OverviewAdvisor.ps1` no longer disables the local worker. With Enable Banking off only the Demo workspace is configured, so the worker refreshes the fictional product-demo data; Live is never reached. Takes effect on the next host start.

Verification: 18 Node unit tests (budget forecast, category/goal helpers, 360) and 6 floating-chat tests pass; JavaScript syntax checks pass. Browser checks in Demo at 800, 1040 and 1280 CSS px in Light, Sand and Graphite: no console or CSP errors and no horizontal overflow on 360, Accounts, Review, Budgets, Goals, Markets and Settings. Not verified: Dan's own workspace, Danish, real phone widths, and the Demo sync itself (requires a host restart).

## Frontend rule compliance — 26 September 2026

Two owner rules in `.github/instructions/frontend-quality.instructions.md` now apply everywhere: one clear, single-line title per page or section (no stacked tagline/subtitle headings), and no single-side borders.

- **Borders:** 127 single-side declarations were removed from the app CSS and 15 from the advisor/analysis-kit CSS. Lists and tables use tonal zebra striping (`--row-alt`) with rounded rows; panels separate by spacing or full outlines. Selected tabs (Review, Markets) use a tinted pill instead of an underline. The sidebar uses a tonal background; the mobile bottom navigation uses a soft upward shadow. Future dashed lines use gradients rather than one-sided borders. A runtime audit across 360, Accounts, Review, Budgets, Goals, Markets, Loans, Analysis, Memory and Settings found none remaining.
- **Titles:** the shared `header()` no longer accepts a subtitle. Removed taglines: Goals ("The things you are working toward."), Loans ("Make room for the next chapter."), Review ("A clearer picture starts here." and its sentence), the Analysis banner, the welcome slogan ("A clearer view of your everyday finances."), Settings/Appearance and budget-flow subtitles, and section subtitles such as "Bank-reported booked balances". Slogan empty-state titles became plain labels (e.g. "No saved analyses yet", "No stock selected"). The welcome/sign-in panel title is the page `h1`.
## Landing and sign-in redesign — 27 September 2026

Dan asked for a complete redesign of the first page (Try Demo / Sign in as Dan) that "fits the app" and is beautiful. Built directly in `auth-ui.js` with styles in the `Landing & sign-in` block at the end of `markets.css`. Behaviour is unchanged: same two entry options, `/api/browser/demo`, `/api/browser/sign-in` and `/api/browser/password`, one-time owner setup, error codes and messages.

- **Stage:** full-screen Copenhagen time-of-day scenery (the app's own morning/afternoon/evening images), with a slow drift and a soft accent/AI-colour aurora. Greeting and clock follow Copenhagen time and refresh while the page is open.
- **Hierarchy:** one large serif `h1` per view ("Welcome to Banking", "Sign in as Dan", "Set your local password") with a word-by-word entrance, plus Accounts/Budgets/Goals/Advisor chips. There are no taglines or subtitles.
- **Entry card:** a frosted, theme-tinted card. On desktop it sits bottom-aligned beside the title; on phones it is anchored at the bottom for thumb reach. It contains two large choice rows with icons (compass for Demo, lock for Dan). The row's tone follows the theme (AI accent for Demo, accent for Dan) and lifts on hover.
- **Sign-in:** a field with a lock icon, a show/hide password toggle (keeps focus), a Caps Lock warning, "Signing in…"/"Saving…" button states, error text in a full-outline alert, and Back that returns focus to the Dan option. The sign-in form is excluded from the app's unsaved-changes guard.
- **Accessibility and preferences:** all five themes are supported; light themes use a more opaque card (Sand title 10.4:1, body text 5.6:1). Reduced motion stops the drift, aurora, pulses and entrances; reduced transparency makes the card solid. There are no single-side borders.

Verification: in Chrome at 1152×720 and 390×844, and in Graphite and Sand: no overflow, single `h1`, no single-side borders, no console errors. Try Demo opens 360 in the Demo workspace. A wrong password shows the error and the form recovers. Show/hide, Caps Lock and Back were checked. Not verified: a successful owner sign-in (it needs Dan's password) and the first-time password setup.
### Landing v2 — 27 September 2026
Owner feedback on v1: content sat in the bottom half, and the enclosing card around the options was unwanted. v2 keeps the scenery and centres one column (title, topic chips, options) vertically. There is no enclosing card. "Sign in as Dan" is the primary filled capsule and "Try Demo" a secondary glass capsule, side by side (stacked on phones). The subtitles are short enough not to truncate, and a highlight sweeps across on hover. The footer line "Your real accounts stay behind sign-in." was removed. The sign-in view is a centred glass field with Sign in below it and Back beneath that. Behaviour is unchanged.
## Composed scenic headers — 27 September 2026

Owner correction: the overlapping-section approach was rejected. The header photo is now a deliberately composed stage, with page-specific data placed into it as glass components. This supersedes the "tall scenic headers with overlaid summaries" approach from earlier the same day.

Anatomy, shared by all seven pages:
- Title top-left.
- Page controls top-right, as glass pills.
- One headline figure bottom-left, placed directly on the photo.
- Up to three glass cards bottom-right; the 360 row can scroll.
- A soft top and bottom shade keeps text readable without darkening the whole image.
- Content below the photo starts normally, with no overlap.

What goes on the photo, per page:

| Page | Headline | Glass components |
|---|---|---|
| 360 | Available to spend (opens its breakdown) | Remaining metric cards with sparklines, in a scrollable row with a glass arrow on desktop |
| Accounts | Total cash, with the allocation bar and % of income retained | Income, Spending, Net saved |
| Review | Items to review, with the category/transfer mix bar | Two filter chips: Need a category, Possible transfers |
| Budgets | Available to spend, with a variance tag and budget | Income, Expenses, Savings, each with a meter against budget; unsaved drafts show planned amounts |
| Goals | Saved across goal accounts | Goal count, Monthly savings plan, Closest-to-target goal with a progress ring |
| Markets | Selected instrument's Saxo LIVE price, with the change against the previous close and the provider delay (trading desk, 28 September 2026) | Day range, Quote time, Your position; controls: instrument search, Saxo environment and connection, with the read time |
| Investments | Saxo SIM account value, with the cash/invested bar when it reconciles, and the simulation note | Booked cash (with Available to trade), Invested (with holding count), Unrealised trade P&L (with % of purchase value when known); status and refresh in the control pill, with the read time beneath it |
| Pension | Recorded statement value in the selected currency; unknown when none recorded | Recorded product count and oldest statement date; one Add statement value action and manual-update status, using the shared Accounts control group |

Implementation:
- `composeScene` in app.js builds the stage from each page's own rendered summary and hides that summary (`.scene-sourced`). Page actions, live updates and filters therefore keep working.
- Budgets re-composes when its summary changes.
- Markets search lookups resolve outside its workspace root.
- The glass is always light-on-dark because the photo is theme-independent.
- Reduced transparency uses solid dark surfaces.
- Styles are in the "Composed scenic headers" block at the end of markets.css.

12 October 2026: Pension follows this same composition, photo and dimensions. It reuses the existing JSON preview and versioned statement form. Imported rows can update an existing product after review; the form shows its previous date/value. File support/errors, optional projections and current automatic-integration status are explicit. Product cards precede the secondary wealth summary on narrow screens. Single-action glass groups use one grid column, avoiding Accounts' two-field column allocation when only a button is present. Evidence: [presentation readiness](docs/presentation-readiness.md).

Sizes: the photo is 360 px on desktop and about 320 px on tablet. On phone it is content-sized, about 190–380 px, with the controls under the title and the cards swipeable.

Local browser checks at 1440, 1024 and 390 px covered all six routes in Graphite, plus Sand on 360 and Accounts; none showed horizontal overflow. Interaction checks covered the Review chip filter, the 360 headline dialog, Markets search results, a live Budgets draft update and the card-row arrow logic. No deployment.

## Investments workspace — approved 27 September 2026

Dan selected concept 3 (`docs/design-targets/investments-03-workspace.png`) with portfolio ownership as the primary task. This supersedes the manual statement screen for Investments only; Pension remains unchanged.

- Uses the shared composed scenic header (see "Composed scenic headers"): the account value is the headline figure, Cash, Invested and Unrealised trade P&L are glass cards, and the Saxo SIM connection state, refresh action and read time sit in the header controls. This supersedes the original short header and separate metric strip (owner correction, 27 September 2026). The stage recomposes after each 30-second refresh and keeps the card-row scroll position.
- Holdings is the default tab; Orders has its own count; Activity shows broker events from the bounded seven-day feed. Pending orders never become holdings or add to account value.
- Desktop uses a list and selected-item inspector. At content widths up to 1080px, rows reflow into two-line cards. At up to 760px the summary becomes two columns. At up to 600px summary cards swipe horizontally and tapping a row opens the detail view with a Back action. Bottom supporting panels split 50/50 on desktop and stack on phones.
- Selected state uses a complete outline and fill. Order lifecycle markers are categorical, never a probability or time-to-fill estimate. Partial fills show the reported filled quantity and remaining execution state.
- Read refresh every 30 seconds while visible, manual refresh, abort/dispose on navigation. Selection, keyboard focus and summary scroll position survive refresh. This is polling, not a broker streaming subscription.
- Currency, reliability, coverage and observation time are preserved. Unknown figures stay unknown. Allocation is shown only when cash plus invested value reconciles with the reported account value; no historical return chart is invented.
- Current frontend uses the deployed preview and orders reads, with bounded instrument metadata reads for missing order currency. Additive backend fields become visible after their separately authorized release. Research links use verified exact listing mappings and do not add watchlist records or submit orders.
- Consistency pass (27 September 2026): section titles use the shared Georgia style, panels use `--radius`, and the selected tab is the shared tinted pill. The tab bar's bottom border was removed, and rows use `--row-alt` striping. Order-state colours use `--ai-accent`. Empty and idle titles are plain labels ("No holdings yet", "Nothing selected"). The allocation bar applies its widths through CSSOM because the CSP blocked inline styles and left the bar empty. The rules are now in `.github/instructions/ui-consistency.instructions.md`. Browser checks at 1440, 1024 and 390 px in Graphite, plus Sand at 1440 px, found no console errors, horizontal overflow or one-sided borders. Tab arrow keys, the phone detail view with Back, and a manual refresh also worked. Not deployed.

## Goal journey detail, chart and edit modal — 27 September 2026

Dan asked for a much better selected-goal detail, better cards, and editing in a modal instead of a separate screen. He then rejected the month-card "Contribution by contribution" timeline in favour of a chart. This supersedes the 9 September contribution-first panel and its no-repeated-tiles detail layout. The upper cards and hero are kept.

- **Cards:** lift on hover; a selected card has an accent ring; progress fills animate. Remaining and Monthly savings sit in tonal tiles. A container query stacks the two tiles in narrow cards.
- **Journey hero:** the goal photo (or tone gradient) with a dark reading gradient. It shows an animated progress ring with 25/50/75/100% milestone dots (lit when passed) and a count-up percentage. Beside it: title, status, Edit plan, balance of target, account and period chips, and glass facts for Estimated arrival (with an On time or After deadline pill), Your target (deadline) and Next planned deposit.
- **Path to your goal (chart):**
  - The dashed plan baseline starts at the plan start and follows the starting balance plus each monthly contribution (the backend DueCount rule).
  - The solid line is the booked balance, rebuilt backwards from the current balance using the goal account's booked transactions since the plan start (existing `/api/transactions` filters; no backend change). It is blue while on plan, red with a shaded gap while behind, and green while ahead. Deviations shorter than 6 days (for example, a deposit booked a few days late) are not shown, except the current one.
  - A dotted projection from today uses planned deposits. It ends at the estimated arrival, which matches the API forecast; the plan's own arrival is marked as well.
  - The chart also shows the target line, the deadline and today, plus deposit and withdrawal markers.
  - Views: "To goal" (full horizon, smooth plan and projection lines) and "So far" (plan start to shortly after today, exact steps).
  - Hover shows date, balance or projection, plan, difference and that day's transactions. The arrow keys, Home and End move between meaningful dates and are announced.
  - No line is drawn without a fresh balance or complete history; a note explains why.
  - A compact month strip below keeps each month's net contribution, plan, withdrawal or missing chip, and the next planned deposit.
- **Below the chart:** Period movements as deposit and withdrawal bars with net; the purpose panel with the photo (and Remove photo), notes and link chips; and collapsible evidence with zebra rows.
- **Edit modal:** Edit plan, Edit notes and links, and direct `#/goals/{id}/edit` URLs open a centred modal over the page. Edit notes focuses Notes. Sectioned fields cover Goal, Target, Account, Savings pace (optional) and Notes and links (optional). A live preview shows name, description, target, monthly amount, deadline, the month the plan reaches the target, and the monthly amount needed for the deadline, with an on-time or late message. The preview is a plan-only estimate. Delete goal lives in the modal. Saving closes the modal and refreshes in place. Unsaved changes use the existing discard dialog.
- **Motion:** staggered entrance, ring and line drawing, pulsing arrival beacon and slow photo drift. All motion is removed under reduced motion.

Verification (local host on 5444 against the shared Demo) covered all three chart states; see the Demo plan change below.

Follow-up (27 September 2026):
- **In-place goal switching:** selecting another goal card (or going back or forward between goal URLs) swaps only the detail section. It updates the card selection and URL with `history.pushState`, and informs the advisor of the selected goal. The page, hero and scroll position stay; the outgoing detail dims while the next one loads. Load errors appear in the page error line and leave the previous detail in place.
- **Demo goal plans (Dan's request):** transactions are unchanged; only the three shared Demo goal plans were edited through the API, starting from each account's actual booked balance.
  - Family holiday: from 1 Jan 2025, 43,600 DKK plus 1,800 DKK per month. It stays on plan.
  - Car: from 1 Jul 2025, 45,000 DKK plus 3,000 DKK per month, deadline Jun 2030. The actual 2,500 DKK transfer and the 12 Aug return leave it 10,000 DKK behind, arriving Oct 2030 (+4 months).
  - Summer house: from 1 Jan 2025, 60,000 DKK plus 4,500 DKK per month, deadline Feb 2046. The actual 5,000 DKK transfer puts it 10,500 DKK ahead.
  - Previous values: all three plans started 1 Jul 2026, with starting balances of 76,000, 75,000 and 150,000 DKK, the same monthly amounts as the actual transfers, and deadlines Apr 2029, Jun 2031 and Dec 2043.
  - Event-shaped deviations (a skipped month, a bonus deposit) would need a `ProductDemoProvider` change, a deployment and a full Demo resync, because sync only reads the last 30 days and never removes rows. That is not authorized.
- The "So far" axis uses tighter padding and four-monthly labels for ranges up to about 2.5 years. Checked in Chrome at about 1000 px and a phone emulation, in Graphite and Light. A no-change save was verified; no Demo values changed. Node tests cover the plan preview, the chart model and detail rendering. Not verified: real phones, Danish copy review, Dan's workspace and deployment.

## 360: separate Saxo SIM snapshot (28 September 2026)
The 360 page reads the deployed SIM-only portfolio endpoint without blocking bank data. A separate theme-aware panel shows verified account value, cash, invested amount, holdings and open orders in the broker base currency, with independent read timestamps and a refresh action. Cash/invested allocation is shown only when the amounts reconcile; missing cash, mixed currencies, partial reliability and missing values cannot become zero or a fabricated allocation. SIM is explicitly excluded from the personal wealth doughnut, totals, dated statements and period-based performance. Working orders never become holdings. Authentication/provider failures remain local to this panel with a Markets connection link. No portfolio performance history is synthesized.

## Investments sign-in — 28 September 2026 (presentation replaced on 29 September 2026)
Sign-in is offered once per connection, in the header (see "Saxo sign-in control — 29 September 2026"); the 28 September expired-session banner with its second sign-in button and Retry is gone. Pending sign-in disables duplicate clicks and pauses polling; failures leave the page usable. Successful login returns to Investments on the same Azure or localhost:5444 frontend. The existing broker callback stays registered at Azure. The backend stores an exact approved return destination with its short-lived, single-use OAuth state; arbitrary origins/routes are rejected. Markets retains its existing default return route. Existing read timestamps and previously loaded values remain explicit when a session expires.


## Saxo sign-in control — 29 September 2026
Owner feedback on an expired Saxo SIM session: Investments said "sign in" in three places (a header button, a full-width banner and a second banner button), and nothing showed at a glance that the connection was signed out. Investments and Markets now share one pattern.

- **One control per connection, in the header.** The glass controls hold a `.saxo-auth` pill for each Saxo connection: the trading environment (SIM or LIVE) and, only while it is signed out, LIVE market data. The connected pill is unchanged (green dot, "Saxo SIM · Connected"; on Markets the existing "Connected" button). Nothing else on either page offers a sign-in button.
- **Signed-out state.** The pill gets a full light-coral border (`#ffb0a8`) on a dark red fill with a thin dark outer ring, a red dot and a text label: "Saxo SIM · Not signed in" (`SAXO_ACCESS_REQUIRED`) or "Saxo SIM · Session expired" (`SAXO_SIGN_IN_REQUIRED`, `SAXO_MARKET_SIGN_IN_REQUIRED`), plus a white "Sign in" button whose accessible name is "Sign in to Saxo SIM". The label does not depend on colour. The pill is a labelled group, its label is a polite live region and the button has a visible focus ring. Markets drops the name from the trading pill's visible text because the environment selector sits beside it ("Not signed in"); the group name still carries it. The tint is fixed rather than `--bad` because the glass is light-on-dark in every theme; the values live with the glass controls in the "Composed scenic headers" block of `markets.css`, as `.saxo-auth`.
- **Read time.** Investments keeps the small line under the controls, shortened: "Last attempt 29/09/2026, 08:54 · Refresh paused". With earlier data it reads "Read …".
- **Removed.** The full-width banner for a signed-out or expired session, with its sign-in and Retry buttons (refresh is the icon in the header). The chart-area "Sign in for market data" and Retry buttons for that state. On Markets: the account-panel and order-ticket "Sign in / Connect Saxo SIM" panels with buttons, the holdings-list connect button, the watchlist-notice and chart-status sign-in buttons.
- **Kept.** Every other notice: data-access denied (with Saxo's code), price history unavailable or rejected, quote unavailable, listing mismatch, rate limit, read disabled, transient failure and stale data keep their message and Retry. A failed or cancelled sign-in attempt is a notice without buttons. Nothing about who may see or use a sign-in changed.
- **In-content states.** Panels without data say what is missing in one short line, without an action: "Not signed in" or "Session expired" with "Holdings are unavailable.", "Working orders are unavailable.", "Order entry is unavailable.", "Saxo SIM account details are unavailable."; chart areas say "Saxo LIVE market data is not signed in."
- **Owner and Demo.** LIVE market data is one shared LIVE feed. Dan gets the pill with its button; Demo sees the same state without any button, because the owner-only LIVE sign-in is never offered to Demo. Under the LIVE trading environment both connections use one LIVE sign-in, so a single pill is shown.
- **Layout.** The group wraps when two pills are needed, keeps its rounded corners, and the title keeps at least 220 px (`.page-head:has(.saxo-auth)`); at 390 px the pills stack under the title.
- **Not touched.** The 360 SIM panel and its Markets link, the sign-in handlers and URLs, and all backend behaviour.

Verification (29 September 2026, localhost:5444): `tests/ui/saxo-signed-out.browser.cjs` drives the pages at 1440, 1024 and 390 px in Graphite and Light. It reads the real Demo API for the connected states and answers from clearly synthetic fixtures for signed-out and expired sessions, owner-only LIVE, Danish, and failures that must keep their notice. It checks one h1, no overflow, no console or CSP errors, no one-sided borders, the number and place of sign-in actions, Tab reachability with a visible focus ring, and contrast measured from pixels. `tests/ui/saxo-signed-out.test.mjs` covers the same rules without a browser.

## Filled Saxo positions and settlement — 28 September 2026
Investments preserves confirmed quantity, acquisition price and opening charges even when current position valuation is unreliable. Current price, market value and P&L display an em dash when the broker marks the valuation unavailable or approximate; account-level values remain independent. Known charge components are shown individually in their supplied currency, without treating missing components as zero. Settlement date is distinct from execution date.
Confirmed FinalFill events with a complete filled quantity use Filled and confirm execution; placement acknowledgements and unconfirmed events do not. Partial confirmations retain partial wording.
Investments and the separate 360 SIM panel use the same accounting bridge: booked cash + signed unbooked transactions = cash after settlement; cash after settlement + invested amount must reconcile to account value before allocation is drawn. This derived cash figure is explicitly not buying power. Mixed currencies, unreliable accounts, absent components and unexplained differences suppress allocation. The scenic cash metric is labelled Booked cash; shared header structure is unchanged. No order action or personal-wealth contribution changes.


### Saxo environment controls — 28 September 2026
Investments uses the shared scenic header and Accounts control anatomy. Dan can select SIM or LIVE (read only), sign in on the current page and disconnect. Demo shows SIM only. Changing environment clears previous data before the new read and ignores obsolete responses. The 360 Saxo panel carries its own environment label/switch and remains separate from recorded wealth, preventing SIM leakage or LIVE double-counting. Missing valuations stay unknown; unfamiliar instruments retain provider labels and have no trade affordance. Quantities preserve nonzero fractional values and prices use instrument precision. App-side local implementation; production activation evidence is tracked in docs/saxo-live-operations.md.

## Saxo market-data provenance — 28 September 2026
The selected-instrument Markets chart uses Saxo LIVE regardless of the trading environment; source, provider delay, quote-update time and retrieval time sit below the period controls and wrap on narrow screens. Missing quotes remain dashes while independently authorized historical bars remain usable. Transient refresh failure is explicitly stale; sign-in/entitlement failure clears prior data. Market-data authorization preserves the selected trading environment. Details and release status: [Saxo market data](docs/saxo-market-data.md).

## Markets trading desk — approved 28 September 2026
Dan chose concept 1 of three Markets concepts for the Markets page. Target: `docs/design-targets/markets-trading-desk.png` (phone: `markets-trading-desk-phone.png`). The interactive, sample-data prototype is `prototypes/markets-concepts/index.html#c=1`; its prices are illustrative and never app data. This supersedes, for Markets only, the 16 September Workspace/Explore tab layout and the 17 September row of four Saxo account cards below the tabs.

- **Header (shared anatomy):** the controls are the instrument search pill (`/` opens it), the Saxo trading environment and the connection state, with the read time beneath. The headline figure is the selected instrument's Saxo LIVE price with its change against the previous close. The glass cards are Day range, Quote (update time and provider delay) and Your position.
- **Desk:** a Watchlist/Holdings list on the left, with price, day change and an intraday sparkline per row. The chart sits in the centre, with periods, candles/line/area, MA 50/200, a crosshair OHLC legend, the average-cost and working-order limit lines, and key figures. The order ticket sits on the right, inline rather than in a modal. The bottom dock holds Positions, Working orders and Activity, with the Saxo account beside it.
- **Data rules:** Saxo data only, with no Yahoo fallback. Unknown values show `—`. An accepted order is not a filled order. The concept's level-2 market depth ladder stays a target until a Saxo depth feed exists; the implementation must not invent depth or bid/ask sizes.

Implementation (28 September 2026, local, not deployed): `markets-ui.js` (rewritten), the "Markets trading desk" block in `markets.css` (before the composed scenic header block), and `sceneBuilders.markets` in `app.js`.
- The page renders a hidden `.td-summary`, and the scene builder composes the header from it and watches it for changes. Before a selection the headline is `—` with "Saxo LIVE market data"; with an empty watchlist, the first Saxo holding is selected.
- Market data for the chart, watchlist rows (the 1D range gives price, previous close and sparkline) and key figures (1D, plus 1Y for the 52-week range and 1-year change) comes only from `/api/markets/chart`. Any source other than `Saxo LIVE` is treated as "release not deployed". Row quotes are bounded to 20 rows, three at a time, and stop at the first access/sign-in/owner/deployment error; everything refreshes once a minute while visible (polling, not streaming). "No reported delay" is shown instead of claiming real-time.
- Search is a modal dialog: `/` or the header pill opens it, arrow keys move, Enter opens the chart without adding it, and "+ Watch" adds it. Holdings show change since purchase from Saxo P&L; lots are merged per net position. Unreliable valuations stay `—`.
- The inline ticket keeps the existing safety flow: explicit Saxo SIM listing confirmation (the listing matching the chart is marked, never auto-picked), SIM ticket with bid/ask when Saxo grants it, Limit/Day, precheck review, and "Place SIM order". An interrupted response offers only "Check status". The receipt shows the categorical steps Placed → Working → Filled. LIVE shows read-only; Demo is SIM only.
- The dock's working orders show the distance to the last price only for a same-currency Saxo quote. Activity merges Saxo audit events with Banking receipts. The Saxo account panel replaces the four 17 September cards and keeps the account-details dialog.
- The TradingView heatmap and fundamentals sit below the desk and load only when scrolled into view.
- Layout (container query on `.markets-workspace`): three columns above 1180 px; list and chart above ticket and account at 901–1180 px; chart, then list, then ticket and account side by side at 641–900 px; one column at 640 px and below, with Buy/Sell shortcuts beside the instrument from 900 px down.

Verification: localhost:5444 in the shared Demo, with real Saxo SIM account, positions, activity, SIM instrument search and SIM ticket quote. The deployed API still returns Yahoo market data, and the page correctly shows the deployment-needed state instead of prices. Layout and interaction were checked with clearly synthetic browser fixtures for market data, search, precheck and placement, so no order or precheck reached Saxo. Checked at 1440, 1024, 768 and 390 px in Graphite and at 1440 px in Sand: no console errors, no horizontal overflow, one `h1`, and no one-sided borders. Also checked: `/` search with arrow keys and Enter, period, chart type and MA toggles, arrow-key tabs, holding selection, listing, form, review and receipt, dock tabs, lazy Explore frames, and Sell. Not verified: real Saxo LIVE market data (it needs the market-data API release), Dan's workspace, Danish copy review and real phones.

### Markets partial market data — 28 September 2026 (local, not deployed)
- **Price history and quote are independent:**
  - The header, quote card, rows and ticket keep a valid quote when history is denied or unavailable. A note in the chart area and the status line explain what is missing.
  - The chart keeps valid history when the quote is denied. The Quote card then shows "Access denied by Saxo", "Unavailable", "Not signed in" / "Session expired" or "Previously retrieved".
- **Messages:** they state what failed, with Saxo's code, for example "Saxo denied access to price history for this listing. (history: NoAccess)". A 400-class rejection reads "Saxo rejected the price-history request. (history: InvalidModelState)", not "temporarily unavailable". They never tell users to check subscriptions.
- **Watchlist:** a per-listing denial no longer stops the other rows. A list notice appears only when every row was denied or a sign-in/owner/disabled condition applies.
- **SIM positions:** with an unreliable broker valuation, a position shows the Saxo LIVE research price for the exact listing, tagged `LIVE`. The tag's title shows quote time and delay. Value and P&L become `est.` tags in the instrument currency; weights stay "—" unless one currency and one source apply. A footnote explains the labels.
- Styles: `.td-chart-note` and `.td-tag` in the Markets trading desk block. Contract and evidence: [Saxo market data](docs/saxo-market-data.md).
- **Short ranges (29 September 2026, local, not deployed):**
  - Markets and Investments add a 1H period before 1D; its Danish label is "1T".
  - On 1H and 1D, the selected chart refreshes every 20 seconds while visible, and the source line shows "Updated hh:mm:ss · refreshes every 20 s while visible".
  - One muted line under the chart, "Saxo sent no data for some N-minute intervals (n missing).", appears when Saxo sent no samples for some intervals. There is no other layout change.
  - Below 420 px, the nine period buttons use tighter padding so they stay on one row.
  - The delay label rule is unchanged: zero delay is "No reported delay", never "Real-time".
## Investments portfolio canvas — selected 28 September 2026
Dan chose concept 2 for the Investments page. Target: `docs/design-targets/investments-portfolio-canvas.png`, with the trade drawer in `investments-portfolio-canvas-ticket.png`. Prototype: `prototypes/markets-concepts/index.html#c=2` (sample data only). **Implemented locally on 28 September 2026 (not deployed).** It replaces the 27 September list-and-inspector workspace for Investments only; Pension is unchanged. Code: `createInvestmentWorkspace` and its exported helpers in `wealth-ui.js`, styles in the canvas block of `wealth.css`.

- **Header:** unchanged anatomy and controls (SIM/LIVE selector for Dan, connection, sign in, disconnect, refresh, read time). Glass cards: Booked cash with Saxo's *Available to trade*, Invested with the holding count, and Unrealised trade P&L with its percentage of purchase value when every position is reliably valued. No "Today" card: positions carry no previous close.
- **Holdings map:** squarified tiles (keyboard buttons) for holdings grouped by Saxo net position, so repeated buys of one instrument form one tile. Sizing uses one basis for all tiles: current market value in base currency; otherwise purchase value (with a note); otherwise equal sizes. Colour is the change since purchase (P&L against purchase value). A *Today* option appears only when Saxo LIVE market data supplies a previous close. Unknown values show `—` on a neutral tile. The selected tile has a full outline. In narrow containers the tiles stack as full-width rows with a size bar.
- **Allocation ring:** cash (after settlement) plus holdings by asset type or currency, only when the account bridge reconciles and holding values add up to the invested amount. A single asset type or currency uses the account's invested amount. Otherwise a sentence says why the split is hidden. The settlement bridge stays below.
- **Working orders:** Placed → Working / Partially filled → Filled as categorical steps, with filled quantity for partial fills, limit price and currency, and the distance to the last paired Saxo LIVE quote when known. Recent broker activity (7 days) sits in a disclosure below.
- **Focus panel:** selected holding with TradingView area chart (Saxo LIVE history only), average-open-price line kept in view, buy markers at each lot's open time, source/delay/time and the TradingView link. Stats: quantity, open price, current price, market value, P&L, weight; purchase details and charges below. Buy more / Sell open the drawer for SIM stocks; LIVE shows a read-only note; other asset types have no trade action.
- **Watchlist:** `/api/research` cards in a scroll-snap row linking to `#/markets/{symbol}`; price, day change and sparkline only from Saxo LIVE, otherwise `—`.
- **Trade drawer:** native modal `<dialog>` from the right, SIM only. It reuses the Markets SIM flow and safety rules: exact held UIC (listing confirmation only when a UIC is missing), ticket read, Limit + Day, precheck review, explicit Place SIM order, receipt where Accepted is not Filled, expired/cost-changed review refresh, and interrupted responses that only read the stored receipt. Escape and the close button are blocked while a submission is in flight.
- **Market data budget:** history for the selected holding plus at most 12 one-day reads (holdings first, at most 10; concurrency 3), no more than once a minute while visible, aborted on navigation. One probe runs first. Sign-in, owner-only, read-disabled, rate-limit or non-Saxo-source answers, or a denial for every held listing, stop automatic reads until Retry or a manual refresh; per-listing denials and transient failures do not.
- **Saxo LIVE quotes for SIM holdings (28 September 2026, evening):** Saxo SIM has no stock prices (all holdings report `priceType None` / `ApproximatedPrice`), so current prices come from the shared Saxo LIVE research feed via `/api/markets/chart?symbol=<exact Saxo symbol>&range=1d`. A quote is used for a holding only when the returned listing symbol (case-insensitive), asset type (when both are known) and verified currency match the position and `quoteStatus` is `available` with a positive price; SIM UICs are never assumed valid in LIVE. Broker-reported values (reliability `Ok`) always stay broker values. Otherwise the focus panel and tiles show the LIVE price (with quote time and delay) and *estimated* market value (quantity × price) and P&L (quantity × (price − open price), before charges) in the instrument currency only, labelled "Est." / LIVE. With no verified FX source, estimates enter base-currency tile sizing and weights only when the instrument currency is the account currency; header totals, invested amount, cash and allocation always stay broker figures. Today's change comes only from the paired quote's price and previous close.
- **Market-data states:** history and quote are independent parts (`historyStatus`, `quoteStatus`; builds without them are inferred from bars and price). The chart area and facts distinguish sign-in required, history unavailable (quote and facts stay usable), history request rejected by Saxo (400-class, with Saxo's code and no Retry), current quote unavailable (chart stays), access denied with Saxo's evidence (provider code such as `NoAccess` and HTTP status from `diagnostics`, else the Banking code) and transient failures, plus listing mismatch. Delays show as reported: unknown is "delay not reported", 0 is "no reported delay", never "real-time". Only a transient failure may keep earlier bars, marked stale and never as a usable quote. After Dan enabled OpenAPI market data on 28 September 2026, the deployed API returns LIVE quotes (15-minute delay), and holdings show `LIVE`/`est.` values. Since the 29 September release (`2026.09.29-saxo-history-request`), price history also returns on every range, and both pages render the charts.
- Verification (local host 5444 against the deployed API): real Demo SIM data at 1440/1024/390 px (4 holdings with approximated valuations → purchase-value sizing, reconciled cash/stocks split, currency split explained, no working orders, empty watchlist), and clearly marked synthetic `page.route()` fixtures for the valued canvas, Today colouring, chart and markers, drawer ticket/review/receipt, expired and interrupted submissions, signed-out and unavailable states, Graphite, Sand and Light, and Danish copy. No console/CSP errors, horizontal overflow or one-sided borders. LIVE-quote follow-up: synthetic new-contract fixtures (paired USD and EUR quotes, history denied + quote available, quote denied + history available, both denied with diagnostics, currency mismatch, all denied, sign-in, old contract) and the real denied state at 1440/1024/390 px, Graphite, Sand and Light. Not verified: LIVE environment in a browser (Dan's session; covered by a unit test), real Saxo LIVE prices (provider currently denies access), real order placement.

## Saxo response metadata — 1 October 2026 (cloud implementation, not deployed)

Markets and Investments keep existing headers, panels, charts and watchlist layouts. Each chart/sparkline uses its own reported chart delay; each Saxo price uses its own price delay. “Chart · N min delayed” / “Price · N min delayed”, “No reported delay” and “Delay unknown” have English/Danish equivalents. Retrieved date/time is separately labelled per part. Retained failed parts say “Update failed · showing previous data”; a fresh price never makes retained history look refreshed. Metadata wraps in rows/cards at mobile widths and is readable text rather than a tooltip-only delay indicator. LIVE research and private portfolio/trading boundaries are unchanged. Details: [Saxo market data](docs/saxo-market-data.md#per-response-delay-labels--1-october-2026).

## Employee shares: cumulative money timeline — 16 October 2026

The employee-share section keeps three compact DKK figures, a DKK/USD switch and a cumulative stepped money line over actual remaining source dates. 6M/1Y/2Y/All/custom windows and keyboard/touch drag handles show an inclusive **vesting in this period** amount separately from cumulative vesting through the window end; source events are never moved to invented period boundaries. A viewport-bounded anchored popover reveals exact date, incremental/cumulative money and secondary shares on hover, tap or keyboard focus. Keep source forms, tables, originals, review/history and audit details in one Reports modal with deliberate tabs, rather than nested main-screen accordions. An empty manual-investment list is a compact Add investment action. Match Accounts tokens/full borders, preserve current-price/FX freshness and unknowns, and perform no requests for chart interactions. No backend/schema/data changes accompany this refinement. See [synthetic renders and validation](docs/employee-stock-dashboard.md). Source-only pending Main review/release; the underlying automatic market valuation and retained workflow are already deployed.

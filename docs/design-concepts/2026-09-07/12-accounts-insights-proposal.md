# Accounts and insights proposal

Status: approved for local implementation, with a searchable account dropdown replacing fixed account tiles. Generated with built-in Image Gen on 7 September 2026; not an implemented screenshot. All amounts and transactions are fictional.

The user requested a combined transaction view across accounts, an account filter, an explicit Account column and meaningful visual financial insights. Retain Graphite and the existing sidebar. Account filters should scope the transaction list and relevant insights. Upcoming commitments use the next seven days rather than the historical period. Activity navigation overlap remains an open design decision.

Image: [Accounts and insights](12-accounts-insights-proposal.png).

## Generation prompt

Create ONE high-fidelity desktop banking web app design concept, 1440 x 1080 pixels, full app canvas, no browser or device frame. Use case: ui-mockup. Reference image is the actual existing Banking app and grounds its Graphite design language, typography, navigation and colors. Redesign the Accounts main content substantially; preserve the left nav and understated professional style.

User goal: see all accounts and their transactions together, filter to a selected account, and immediately understand personal cash flow through useful visuals. Make the dominant center-left an excellent readable transaction ledger and the right a compact visual insights rail. No wall of account technical details. No import metadata, consent IDs, history-from dates, or admin prose. This is an unimplemented proposal with wholly fictional demo data.

Visual system: Graphite near-black #101315, white #eef0f2, muted slate text, restrained blue #87adff interactive accents, subtle #2b3339 dividers, refined sans UI 14–16px body, serif Banking wordmark matching reference. No gradients, glow, purple, glass, giant rounded cards, emoji, robot graphics or AI hype. Professional modern wealth/banking software. Use clean lines, alignment and negative space. Right insights can use barely raised dark surfaces and fine borders. Keep readable, not cramped.

Left sidebar ~215px wide: Banking wordmark; Overview, Accounts selected, Activity, Budgets, Goals, Advisor; small Wealth label, Investments and Pension with Not connected; Connections and Settings near bottom, Demo account selector at bottom only. No Demo control at top. Preserve actual reference navigation even though transaction functionality overlaps Activity; this concept does not decide removing that destination.

Main header: Accounts with subtitle 'Your accounts, together'. Small 'Last sync: 7 Sept 2026, 14:57' top right. A single period dropdown '1 month' top right; date input fields hidden, no custom date fields. Anchor date today 7 September 2026; show selected period 9 Aug – 7 Sept 2026.

Under heading, slim horizontal account-selection strip, four selectables: 'All accounts' selected, balance DKK 561,559; 'Everyday' DKK 428,677; 'Bills' DKK 51,482; 'Savings' DKK 81,400. Discreet colored account dots are repeated in the table Account column. These are filters, not bank connect buttons. No financial data from Dan.

Below strip, 2-column layout: primary ledger ~730px width and insights rail ~320px. Ledger title 'Transactions' and subtle count 'All 3 accounts'; search field 'Search transactions', small Category dropdown, filter icon. Real table with columns Date | Description | Account | Category | Amount. Account is a dedicated explicit column, never only subtext. Show 9–10 clean realistic rows:
7 Sept | Salary | Everyday | Income | +40,800.00
5 Sept | Utilities | Bills | Utilities | −850.00
5 Sept | Transport pass | Everyday | Transport | −495.00
4 Sept | Groceries | Everyday | Groceries | −431.00
3 Sept | Housing | Bills | Housing | −7,400.00
2 Sept | To savings | Everyday | Internal transfer | −3,000.00
2 Sept | From everyday | Savings | Internal transfer | +3,000.00
1 Sept | Home insurance | Bills | Insurance | −620.00
31 Aug | Groceries | Everyday | Groceries | −382.00
30 Aug | Café | Everyday | Dining | −128.00
Use DKK in column header or above table, not repeated in every number. Amounts right-aligned; only actual external income softly green, internal transfer pair muted rather than green/red implying income/spending. Table is a visible subset of selected-period transactions, totals aren't sum of only shown rows. Restrained pagination footer. No create/payment/transfer buttons.

Right rail heading 'Insights' with small 'All accounts · Selected period'. Stack exactly three purposeful analytical modules:
1 'Money in & out' with two proportional horizontal bars: Income DKK 40,800 in muted green; Spending DKK 24,480 in soft blue. Text 'Net saved  DKK 16,320' green and small '40% of income retained'. Income minus spending reconciles exactly. Tiny neutral footnote 'Internal transfers excluded'. Not AI advice.
2 'Spending breakdown' horizontal ranked bar chart with value labels: Housing DKK 12,240 (50%), Groceries DKK 4,896 (20%), Transport DKK 2,448 (10%), Other DKK 4,896 (20%). Four bar lengths proportional 100%,40%,20%,40%; summed spending 24,480. No pie and no decorative arbitrary sparkline.
3 'Next 7 days' compact summary 'DKK 1,028 expected', subtitle '3 recurring payments', rows Streaming 129; Insurance 620; Internet 279. Small 'Estimated from past transactions'. Sum exactly 1,028.
These insights and table are designed to follow selected account and period; explain through visible scoped heading, not long prose. No financial health score or unsupported predictions.
A small unobtrusive bottom-right Advisor · Not connected pill may be included only if space without overlapping any content.

Create one coherent polished next-generation but restrained financial workspace with high legibility. Do not show alternate versions, mockup annotations, explanatory text outside the app, or mobile views.

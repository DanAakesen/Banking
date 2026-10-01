# Review inbox proposal

Status: approved by Dan ("The image looks good. Proceed with build") and implemented locally on 7 September 2026. Generated using built-in Image Gen. Fictional demo data only; this file remains a concept, not an implemented screenshot. See ../../local-frontend.md for browser verification.

Dan agreed to explore replacing Activity with Review: an exception inbox for categorisation and internal-transfer matching. Accounts remains the main transaction explorer. Review includes category/transfer filters, an account filter, master/detail selection, Apply/Confirm, Skip for now, bulk categorisation, and recent changes with Undo. Deeper bank reconciliation, duplicate detection and refund matching remain later scope. A clear queue does not establish that bank balances are reconciled.

Image: [Review concept](13-review-inbox-proposal.png).

Visual-generation discrepancies to resolve during implementation: the sample row dates are not in the indicated newest-first order, and account text is repeated in several list rows. These are not functional requirements.

## Generation prompt

Use case: ui-mockup. Create ONE polished high-fidelity DESKTOP WEB APP screenshot concept for Banking's new Review page. Canvas 1440 x 1080 pixels, one page, no browser frame, device frame, side-by-side options or mobile screen. Current date anchor 7 September 2026. All names, transaction data and counts are fictional demo fixtures. This is a proposed design, not working functionality.

Attach/reference role: the supplied actual Accounts screenshot grounds the established Banking Graphite UI, sidebar, serif Banking wordmark, compact sans-serif UI, near-black #101315 background, subtle gray dividers, white readable text, muted slate labels and restrained blue actions. Preserve that visual language while redesigning the main surface for a review workflow. Main content must fit within 1080px tall and remain comfortable at desktop; readable 14–16px body text, coherent spacing, no decorative charts or giant metrics. Avoid glow, gradients, purple branding, glassmorphism, AI sparkles, excessive rounded cards, emoji, tiny text. Categories/account small colored dots are meaningful matching labels, not decoration. Use simple line icons.

Sidebar about 215px wide: Banking wordmark; Overview, Accounts, Review SELECTED with a subtle 12 count replacing the old Activity destination; Budgets, Goals, Advisor; Wealth heading then Investments / Pension, both Not connected; bottom Connections, Settings, Demo account selector. No top Demo switch, language or profile widget. App is read-only toward banks; Review actions only maintain app categorisation and transfer matches. No payment initiation.

Page purpose: an inbox of exceptions to clear, not a copy of the full transactions ledger, not a requirement to approve every transaction, and not a claim that bank balances are reconciled. MVP only missing categories and candidate internal transfer matches. No duplicate/refund tabs or fraud claims.

Top main heading 'Review'. Below '12 items need attention'. Top-right compact 'All accounts' dropdown (searchable when opened; render closed) with count 3 accounts in muted supporting text if room. No period controls here: queue is all pending review work. Under heading simple filter tabs 'All 12' selected, 'Categories 8', 'Transfers 4'. Make counts reconcile: 8 categorisation cases + 4 transfer-pair cases =12. No giant numerical stat cards.

Below use a well-balanced master-detail split: left inbox around 565px, right action/details region around 535px separated by subtle gap/divider. Left heading 'Needs review' with small 'Newest first' sort control. Show six visible items of the twelve, each a comfortable 82px-ish row, delicate separators. Rows display recognizable description, date, account label with colored dot, right-aligned amount, and the review reason. Selected first item has a subtle blue left marker/tinted background:
1 'Move to savings' — 'Everyday → Savings' — '2 Sept' — 'DKK 3,000.00' — 'Possible internal transfer'; selected.
2 'Groceries' — 'Everyday' — '4 Sept' — '−DKK 431.00' — 'Needs a category'.
3 'Coffee shop' — 'Everyday' — '3 Sept' — '−DKK 58.00' — 'Needs a category'.
4 'Move to bills' — 'Everyday → Bills' — '2 Sept' — 'DKK 10,500.00' — 'Possible internal transfer'.
5 'Bookshop' — 'Everyday' — '1 Sept' — '−DKK 249.00' — 'Needs a category'.
6 'Home supplies' — 'Bills' — '1 Sept' — '−DKK 189.00' — 'Needs a category'.
Only category rows show small unchecked bulk-selection checkboxes. Transfer rows have a discreet paired-arrows icon. Selected row indicates focus independently from bulk checkboxes. Footer '1–6 of 12' and Previous / Next chevrons, restrained. Filters remain under clear common heading, do not wrap excessively.

Right detail panel selected transfer case:
Eyebrow 'TRANSFER REVIEW'
Heading 'Is this a transfer between your accounts?'
One brief support sentence 'These two entries may describe the same movement.'
Show a tidy pair of transaction blocks in ONE grouped surface, connected by a small vertical matching line/arrows. No bank logos required.
First: green account dot 'Everyday', descriptor 'Move to savings', '2 Sept 2026 · Booked', amount '−DKK 3,000.00' in normal white/slate.
Second: purple/amber account dot 'Savings', descriptor 'From everyday', '2 Sept 2026 · Booked', amount '+DKK 3,000.00' in normal white/slate. Account-dot colors must match the inbox and stay consistent. Account color alone never communicates money in/out.
Then clean small matching indicators or text:
'Same amount and currency'
'Same booking date'
'Different accounts'
Treat these as evidence, not certainty or an AI score. No percent confidence.
Then a quiet explanatory line: 'Confirming excludes both entries from income and spending. Your bank transactions stay unchanged.'
Actions: filled restrained cobalt PRIMARY 'Confirm transfer' and secondary 'Skip for now'. Small tertiary text action 'Not a transfer' so an incorrect suggestion can be dismissed. Keep action area clearly tied to selected pair, not whole queue.

Below split, a narrow 'Recent changes' area with one understated line: 'Coffee purchase categorised as Dining' followed by 'Just now' and an 'Undo' text button. Do not create a separate analytics card. Optional small 'View history' link only if it fits neatly.

Do not include advisor floating overlay in this focused task screen. Do not add budgeting/goals content here. No huge 'All reconciled' banner, approval stamp, compliance badges, marketing copy, invented financial-health scores, or claims of AI analysis. This must feel like a calm professional inbox you can clear in a few minutes. Exactly one visually complete coherent image.

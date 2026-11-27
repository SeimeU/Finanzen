# Spec: Personal Wealth Tracker

Status: done

## Problem Statement

My money is spread across several Institutions: Trade Republic, Raiffeisen Bank (Austria) and physical cash, with Accounts of different kinds at each. No single place shows how much I have in total, how it is split between ETFs, cash and locked money, when locked money becomes Available again, or how my Net worth has developed over the years. My historic records only exist as one figure per Account, while from now on I want to track individual Holdings. I also can't see where my money goes each month, because each bank's transaction export is in a different format. I don't want to hand this data to a cloud service: everything has to run on my own Windows machine, offline, with the data in one local file.

## Solution

A local web app that I start with one double-click and use in my browser at `localhost`. It never touches the network. The interface is in German, with German number and date formatting. All data lives in one password-encrypted file, with automatic backups.

Once a month I record a Snapshot (Monatsstand): the Market value of every Holding, starting from last month's values, optionally with the Contribution paid in, plus a Note and any Events for the month. For past months I enter one Account-level value per Account. The app then shows:
- Net worth over time, stacked by Asset class, with Event markers
- breakdowns by Asset class, Liquidity and Institution
- a timeline of when Locked money reaches its Maturity date
- a simple Projection of future Net worth with optimistic and pessimistic bands

Separately, I can drop CSV exports from several banks at once. The app recognizes Trade Republic and Raiffeisen ELBA files, skips duplicates, applies my Categorization rules, detects Transfers and Trades, and shows spending and income by Category and my Savings rate.

## User Stories

### Starting, locking and data safety

1. As the owner, I want to start the app by double-clicking one file on Windows, so that I don't need a terminal to use it.
2. As the owner, I want the app to open my browser on the start screen automatically, so that starting it is one step.
3. As the owner, I want the app never to make a network request, so that my financial data cannot leave my machine.
4. As the owner, I want to set a password the first time I start the app, so that my data file is encrypted from the start.
5. As the owner, I want to be warned clearly when I set the password that forgetting it means permanent data loss, so that I choose and store it carefully.
6. As the owner, I want to enter my password on every start to unlock the data, so that nobody with access to my disk can read it.
7. As the owner, I want a clear message on a wrong password, without the data being touched, so that a typo does no harm.
8. As the owner, I want the app to lock itself after 30 minutes without use, so that an unattended browser tab doesn't expose my finances.
9. As the owner, I want to choose where the data file lives, so that I can put it in a folder I back up or sync.
10. As the owner, I want every save to keep a backup of the previous state and retain the last 30, so that a mistake or bug can't destroy my history.
11. As the owner, I want backups to be encrypted with the same password, so that they aren't a weaker copy of my data.
12. As the owner, I want to restore a backup from inside the app, so that I can undo a bad change.
13. As the owner, I want to change my password, re-encrypting the data file and all backups, so that an old password stops working everywhere.
14. As the owner, I want an "Export unencrypted" action that writes a readable copy, so that I can keep my own safe backup, e.g. on a USB stick.
15. As the owner, I want every change saved immediately, so that I never lose work by closing the browser.

### Institutions, Accounts and Holdings

16. As the owner, I want to create Institutions such as Trade Republic, Raiffeisen and "Cash", so that my Accounts are grouped the way I think of them.
17. As the owner, I want to create Accounts at an Institution with a name and an optional IBAN, so that each real account is represented.
18. As the owner, I want to give each Account a Default classification (Asset class and Liquidity), so that Account-level values are counted correctly in breakdowns.
19. As the owner, I want to add Holdings to an Account, each with an Asset class and a Liquidity, so that a broker depot with several ETFs and cash is represented accurately.
20. As the owner, I want a Locked Holding to carry a Maturity date, so that I can see when that money becomes Available.
21. As the owner, I want to record debts such as a loan or credit-card balance as Accounts with negative value, so that my Net worth is correct.
22. As the owner, I want to record pension contracts as Holdings Locked until my retirement date, so that they count towards my wealth without looking spendable.
23. As the owner, I want to close a Holding as of a month when I sell it completely, so that it drops out of later Snapshots while its history stays.
24. As the owner, I want to add a new Holding starting from a given month, so that new investments appear from the month I bought them.
25. As the owner, I want to close an Account as of a month, e.g. when moving a depot to another broker, so that old Accounts don't clutter the monthly form.
26. As the owner, I want to rename Institutions, Accounts and Holdings and change their classification, so that I can fix mistakes.
27. As the owner, I want a change to a Holding's classification to update every chart, including history, so that breakdowns stay consistent.

### Recording Snapshots

28. As the owner, I want to open the Monatsstand form for any month, so that I can record the current month or fill in past ones.
29. As the owner, I want the form to list every open Holding, grouped by Institution and Account, so that I don't forget anything.
30. As the owner, I want the form to start from last month's values, so that I only change what has changed.
31. As the owner, I want a Holding I don't update to keep its previous value, marked as "not updated", so that skipping something is never read as zero.
32. As the owner, I want to enter an optional Contribution for each investment Holding, so that I can tell saving apart from market gains.
33. As the owner, I want Net worth and the change since last month to update live as I type, so that I spot typos immediately.
34. As the owner, I want saving a month that already has a Snapshot to replace it, so that there is only ever one Snapshot per month.
35. As the owner, I want to enter one Account-level value per Account for historic months, so that I can record history as detailed as my old records are.
36. As the owner, I want an Account to have either an Account-level value or values per Holding in a given month, never both, so that nothing is counted twice.
37. As the owner, I want to switch an Account from Account-level values to values per Holding from a chosen month onward, so that my history and my detailed tracking connect.
38. As the owner, I want to enter many historic months in a row quickly, so that capturing years of history isn't tedious.
39. As the owner, I want to add a free-text Note to any month, so that I remember what happened then.
40. As the owner, I want to add Events with a label and an amount to a month, e.g. "Auto gekauft, −15.000 €", so that dips and jumps are explained on the charts.
41. As the owner, I want to edit or delete Notes and Events, so that I can correct them.
42. As the owner, I want every Market value entered and shown in EUR with German formatting (`1.234,56 €`), so that values read naturally to me.

### Overview and breakdowns

43. As the owner, I want the start screen to show my current Net worth, so that I see the most important figure at once.
44. As the owner, I want to see the change in Net worth versus last month and versus 12 months ago, in EUR and percent, so that I know the trend.
45. As the owner, I want to see the next Maturity date with its amount on the start screen, so that I know when locked money becomes Available.
46. As the owner, I want a chart of Net worth over time as a stacked area by Asset class, so that I see both the total and its composition.
47. As the owner, I want Events shown as markers on that chart, with their label and amount on hover, so that I understand what happened when.
48. As the owner, I want to choose the time range of the chart (e.g. 1 year, 5 years, all), so that I can zoom into a period.
49. As the owner, I want a small chart of my current split between Available and Locked money, so that I know how much I could access today.
50. As the owner, I want a small chart of my current split by Institution, so that I see how concentrated I am at one provider.
51. As the owner, I want to see how much I hold in each Asset class, e.g. ETFs or bank cash, now and over time, so that I can judge my allocation.
52. As the owner, I want a maturity timeline listing all Locked Holdings ordered by Maturity date with amounts, so that I can plan when money becomes Available.
53. As the owner, I want a detail view per Account showing its value history and Holdings, so that I can examine one Account.
54. As the owner, I want to see, per month, how much of the change in Net worth came from Contributions versus market changes, so that I know how much I saved and how much the market added.
55. As the owner, I want to read all Notes and Events in a chronological list, so that I can review my financial history.

### Projection

56. As the owner, I want to set an expected annual return per Asset class, so that the Projection reflects what I hold.
57. As the owner, I want a monthly savings amount that defaults to my average over the last 12 months and that I can override, so that the Projection starts from realistic behaviour.
58. As the owner, I want to choose the Projection horizon, e.g. 5, 10 or 20 years, so that I can look as far ahead as I like.
59. As the owner, I want the Projection shown as a dashed continuation of the Net worth chart, so that it is visibly an estimate.
60. As the owner, I want optimistic and pessimistic bands around the Projection, so that I don't mistake it for a certainty.
61. As the owner, I want Locked Holdings to become Available in the Projection on their Maturity date, so that the projected Available/Locked split is correct.

### CSV import

62. As the owner, I want to drop several CSV files from different banks into the app at once, so that importing a month's data is one action.
63. As the owner, I want the app to recognize Trade Republic transaction exports automatically, so that I don't have to configure anything for them.
64. As the owner, I want the app to recognize Raiffeisen ELBA exports automatically, even without a header row, so that I don't have to configure anything for them.
65. As the owner, I want the ELBA Buchungstext split into counterparty, IBAN, payment reference and purpose, so that I can read Transactions and write Categorization rules against these fields.
66. As the owner, I want to define a generic Import profile for any other bank by mapping columns, separators and date and number formats once, so that I can add banks later.
67. As the owner, I want a confirmation screen listing each dropped file with its detected format, suggested Account, date range and "X new / Y duplicates", so that I can check before anything is stored.
68. As the owner, I want the Account suggested automatically when only one Account matches the file's format, so that the common case needs no input.
69. As the owner, I want to change the Account assigned to a file, and have the app remember that choice by file name, so that ambiguous imports get easier.
70. As the owner, I want Transactions already present (same Account, date, amount and text) skipped silently, so that overlapping exports never double-count.
71. As the owner, I want files the app cannot read rejected with a clear German message and nothing imported from them, so that a bad file can't corrupt my data.
72. As the owner, I want to undo a whole import, so that a wrong Account assignment can be reversed.
73. As the owner, I want imported Transactions never to change any Snapshot, so that my recorded Market values stay exactly as I entered them.

### Categories, rules, Transfers and Trades

74. As the owner, I want a default two-level Category list (e.g. Wohnen → Miete) that I can edit, so that I can start categorizing immediately.
75. As the owner, I want every Category marked as income or expense, so that the Savings rate can be calculated.
76. As the owner, I want to define Categorization rules on counterparty, purpose, reference or amount, so that recurring Transactions are categorized automatically.
77. As the owner, I want rules applied on import and, on request, to already-imported Transactions, so that a new rule also cleans up the past.
78. As the owner, I want a Category I set by hand never to be overwritten by a rule, so that my corrections stick.
79. As the owner, I want an Uncategorized inbox of Transactions no rule matched, so that I can sort them in one place.
80. As the owner, I want to create a rule directly from a Transaction in the inbox, so that categorizing teaches the app.
81. As the owner, I want Transactions whose counterparty IBAN is one of my own Accounts marked as Transfers, so that moving money between my Accounts isn't counted as spending or income.
82. As the owner, I want an equal and opposite amount on two of my Accounts within a few days suggested as a Transfer, so that Transfers without an IBAN are caught too.
83. As the owner, I want to mark or unmark a Transaction as a Transfer by hand, so that I can fix detection mistakes.
84. As the owner, I want Trade Republic buys and sells recognized as Trades and excluded from spending and income, so that investing isn't counted as spending.
85. As the owner, I want interest and dividends counted as income under "Kapitalerträge", so that investment income shows up.
86. As the owner, I want tax rows counted as expenses under "Steuern", so that taxes are visible.
87. As the owner, I want Trade Republic rows of an unknown type sent to the Uncategorized inbox, never dropped, so that nothing goes missing silently.

### Spending analysis

88. As the owner, I want monthly spending by Category, both at the top level and drilled down, so that I see where my money goes.
89. As the owner, I want monthly income versus expenses over time, so that I see whether I live within my means.
90. As the owner, I want my monthly Savings rate, so that I can track how much of my income I keep.
91. As the owner, I want months where some Accounts with income or spending have no imported Transactions flagged as incomplete instead of showing a Savings rate, so that I'm never misled by partial data.
92. As the owner, I want to list, search and filter Transactions by Account, Category, date and text, so that I can find a specific payment.
93. As the owner, I want to compare a Category's spending between months or years, so that I notice when a cost rises.

## Implementation Decisions

- **Platform and architecture** (ADR 0001, ADR 0002):
  - A local web app in TypeScript: a small Node.js server bound to `localhost` only, and a React + Vite frontend.
  - A Windows `start.bat` starts the server and opens the default browser.
  - No runtime code makes network requests, and all assets, including charting and fonts, are bundled locally.
- **Data document:**
  - All state is one versioned JSON document, loaded into memory after unlock and written whole on every change.
  - It holds Institutions, Accounts, Holdings, Snapshots (per month: values per Holding or Account-level values, Contributions, the Note and Events), Transactions, Categories, Categorization rules, Import profiles, Projection assumptions and settings.
  - The document carries a schema version, and the core migrates older versions on load.
- **Domain core module** (the main seam): a pure TypeScript module with no I/O. It takes a document and exposes:
  - **Commands**, each returning the new document or a validation error:
    - create, update and close Institutions, Accounts and Holdings
    - save a Snapshot for a month
    - set the Note and Events for a month
    - preview an import (files and contents in, a per-file result out) and confirm an import
    - undo an import
    - set a Transaction's Category by hand
    - create, update and delete Categorization rules and re-apply them
    - mark or unmark a Transfer
    - update Projection assumptions
  - **Queries:**
    - Net worth series by month with a breakdown by Asset class
    - current breakdowns by Asset class, Liquidity and Institution
    - maturity timeline
    - Contribution versus market change per month
    - Projection series with bands
    - spending and income by Category per month
    - Savings rate per month, including the incomplete flag
    - transaction search
  - The current date is passed in, never read from the clock, so results are deterministic.
- **Snapshot semantics:**
  - Months are identified as year-month, with the reference date being the last day of the month.
  - A Holding without a value in a month carries forward its latest earlier value and is flagged "not updated".
  - A closed Holding contributes nothing from its closing month on.
  - An Account-level value counts towards the Account's Default classification.
  - Within one month, an Account has either an Account-level value or values per Holding, and the core rejects mixing them.
- **Money:** all amounts are EUR held as integer cents, and all calculations run on cents to avoid rounding drift. Formatting to German locale happens only in the UI.
- **Import pipeline**, inside the core: detect format → parse with an Import profile → normalize to Transactions → deduplicate → classify (Trade or Transfer, then Categorization rules) → preview → confirm.
  - Built-in profiles: Trade Republic (comma-separated, ISO dates, decimal point, `type`/`category` columns) and Raiffeisen ELBA (semicolon-separated, no header, UTF-8 with BOM, packed Buchungstext parsed into fields). Generic profiles are user-defined column mappings.
  - Encoding detection tries UTF-8 first and falls back to Windows-1252.
  - The duplicate key is Account, booking date, amount in cents and normalized text.
  - Each Transaction records which import it came from, so a whole import can be undone.
- **Trade Republic mapping:**
  - rows in category TRADING → Trade
  - INTEREST_PAYMENT and DISTRIBUTION → income under "Kapitalerträge"
  - BENEFITS_SAVEBACK → income under "Einkommen → Prämien" (not a Trade, not a Transfer)
  - tax rows → expense under "Steuern"
  - the tax column (Withheld tax) on any row → expense under "Steuern → Kapitalertragsteuer"; the amount column is gross (ADR 0004)
  - incoming and outgoing transfer types → Transfer candidates
  - card and other payments → ordinary Transactions for the rules; a card payment's counterparty is the merchant (`name` column; for ELBA, the Verwendungszweck)
  - any unknown type → Uncategorized
- **Transfer detection:** primary when the counterparty IBAN matches an own Account's IBAN; fallback when equal and opposite amounts on two own Accounts fall within 3 days, offered as a suggestion. Manual marking overrides both.
- **Categorization precedence:** manual Category, then Trade/Transfer classification, then the first matching Categorization rule in user-defined order, then Uncategorized.
- **Savings rate:** (income − expenses) ÷ income per month, excluding Transfers and Trades. A month is complete only if every Account flagged as carrying income or spending has imported Transactions covering the whole month; otherwise it is shown as incomplete.
- **Projection:** month-by-month compounding per Asset class at the user's expected annual return. The monthly savings amount is added to Available cash, defaulting to the 12-month average of Contributions plus growth in cash Holdings. Locked Holdings move to Available on their Maturity date. The optimistic and pessimistic bands use each return ±2 percentage points, and the user can configure the spread.
- **Encrypted file store** (second seam): a module with load(path, password), save(path, password, document), change password, list and restore backups, and export unencrypted.
  - Encryption is AES-256-GCM with a key derived from the password via scrypt, a random salt and a nonce per write.
  - Writes are atomic: write to a temporary file, then rename.
  - The 30 most recent backups are kept, rotating the oldest out.
  - A wrong password is reported as a distinct error and never modifies any file.
- **Session lock:** the server holds the decrypted document only while unlocked, and discards it after 30 minutes without requests or when the user locks the app manually.
- **Server API:** a thin JSON API on `localhost`. Each endpoint maps one-to-one onto a core command or query, followed by a store save for commands. It also has unlock and lock endpoints and a file-upload endpoint for CSV preview.
- **UI:** German-only labels, as listed in the `_UI_` lines of the glossary; German number and date formatting; the start screen, Monatsstand form, maturity timeline, Account detail, Projection settings, import confirmation, Uncategorized inbox, rules editor, spending views and settings (password, backups, data file location, export).
- **Build order:** each stage ships usable on its own. (1) Institutions, Accounts, Holdings, the Monatsstand form, Notes and the Net worth chart, plus the store and lock. (2) Breakdowns and the maturity timeline. (3) Events and the Projection. (4) CSV import, Categories, rules, Transfers, Trades and spending analysis.

## Testing Decisions

- A good test exercises external behaviour only: commands and queries on the core, operations on the store, user flows in the browser. It never asserts on internal data structures or private helpers, so the implementation can be refactored freely.
- **Domain core:** the bulk of the tests. They build documents through commands and assert on query results. They cover:
  - carry-forward and "not updated" flags
  - closing Holdings
  - Account-level values counting under the Default classification
  - rejection of mixed Account-level and per-Holding values in one month
  - replacing a month's Snapshot
  - debt and pension handling
  - Contribution versus market change
  - the maturity timeline
  - the Projection, including maturities and bands
  - import format detection, parsing, deduplication and undo
  - Trade, Transfer and rule precedence
  - Savings rate and incompleteness
- **Import fixtures:** the owner's real exports in the local `samples/` folder (never committed) are used in tests that run only when the folder is present. Committed tests use small synthetic fixtures that copy the verified structure of each format. Several format details are still unverified: for ELBA the decimal format, sign convention and date format; for Trade Republic some type values. They must be confirmed against the samples before stage 4 is considered done.
- **Encrypted file store:** tests run against a temporary directory and cover:
  - save/load round-trip
  - wrong password
  - no plaintext in the file
  - backup rotation at 30
  - restoring a backup
  - password change re-encrypting all backups
  - unencrypted export
  - atomic writes, where an interrupted write leaves the previous file intact
- **Browser (UI) tests:** Playwright end-to-end tests against the running app with a temporary data file. They cover the key flows:
  - first-start password setup and unlocking (including a wrong password)
  - entering a Monatsstand pre-filled from last month and seeing Net worth update
  - entering historic Account-level values
  - adding a Note and an Event and seeing the marker on the chart
  - dropping a Trade Republic and an ELBA file together, confirming and seeing the Transactions
  - categorizing from the Uncategorized inbox by creating a rule
  - auto-lock after inactivity, using a shortened timeout in test configuration
- The server is covered indirectly by the UI tests and has no tests of its own.
- **Prior art:** none, as this is a new codebase. The core tests set the pattern for others: arrange by commands, assert by queries.

## Out of Scope

- Any network access: live prices, exchange rates, bank APIs, cloud sync, updates.
- Currencies other than EUR, and exchange-rate handling.
- Real estate, vehicles and other physical assets.
- Deriving Snapshots or Market values from CSV imports, or reconciling Transactions with Snapshots.
- Tracking share quantities, prices or cost basis per trade; Holdings carry Market values only.
- Tax calculations or reports.
- Multiple users, sharing, or access from other devices.
- Password recovery.
- A native desktop wrapper or mobile app.
- An English interface.
- Import of historic records from spreadsheets; history is entered by hand.

## Further Notes

- The domain vocabulary is defined in `GLOSSARY.md`, including the German UI label for each term. Code, tests and UI must use those terms.
- Before stage 4, the owner will place one real export from Trade Republic and one from Raiffeisen ELBA (a few months, personal data blanked) in `samples/`.
- The research behind the import formats came from open-source importer code, not official bank specifications. Trade Republic's CSV export only appeared around April 2026, so its format may still change. The Import profiles should therefore fail loudly on unexpected columns, never mis-parse silently.
- The project isn't a git repository yet. It should be put under version control before implementation starts.

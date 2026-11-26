# Personal Wealth Tracker

A single, offline place (interface in German) to record what the owner has across all banks, brokers and cash, see how it evolves month by month, and analyse where money goes.

## Structure of wealth

**Institution**:
A bank, broker or other provider that holds **Accounts**. Physical cash is held at the pseudo-institution "Cash".
_Avoid_: Bank (too narrow), provider
_UI_: Institut

**Account**:
One account at an **Institution**, such as a current account, a depot or a fixed-term deposit. It contains one or more **Holdings**. An Account may have an IBAN. A debt such as a loan or credit-card balance is also an Account, with a negative value.
_Avoid_: Money account, portfolio
_UI_: Konto

**Holding**:
One line inside an **Account** with exactly one **Asset class** and one **Liquidity**, such as "MSCI World ETF" in a depot. A simple account such as a current account has exactly one Holding.
_Avoid_: Position, asset, investment
_UI_: Position

**Default classification**:
The **Asset class** and **Liquidity** an **Account** falls under when its value is recorded as one figure, not per **Holding**.
_Avoid_: Account type
_UI_: Standardeinordnung

## Classification

**Asset class**:
What a **Holding** is invested in: Cash, ETF, Stock, Bond, Crypto, Commodity or Other.
_Avoid_: Type, category (reserved for **Transactions**)
_UI_: Anlageklasse

**Liquidity**:
When the money in a **Holding** can be accessed: either Available, or Locked until a **Maturity date**.
_Avoid_: Fixed/variable, flexibility
_UI_: Verfügbarkeit (Verfügbar / Gebunden bis)

**Maturity date**:
The date on which a Locked **Holding** becomes Available.
_Avoid_: Unlock date, end date
_UI_: Fälligkeit

Pensions count as wealth and are Locked until retirement. Real estate and other physical possessions do not count.

## Recording over time

**Snapshot**:
The values of all **Holdings** on the last day of one month. There is at most one Snapshot per month. A Holding left out of a Snapshot keeps its previous value.
_Avoid_: Entry, record, update
_UI_: Monatsstand

**Account-level value**:
A single **Market value** recorded for a whole **Account** in a **Snapshot**, used where values per **Holding** are unknown (typically historic months). In a given month an Account has either an Account-level value or values per Holding, never both.
_Avoid_: Total, lump sum
_UI_: Kontostand gesamt

**Market value**:
What a **Holding** is worth on a **Snapshot**'s date, in EUR.
_Avoid_: Balance, amount
_UI_: Wert

**Contribution**:
The money newly paid into an investment **Holding** during a month, recorded alongside its **Market value** to separate saving from market gains.
_Avoid_: Deposit, investment, cost basis
_UI_: Einzahlung

**Net worth**:
The sum of the **Market values** of all **Holdings** in a **Snapshot**, with debts counting negatively.
_Avoid_: Wealth, total, balance
_UI_: Vermögen

**Note**:
Free text attached to one month describing what happened in it.
_Avoid_: Comment, memo
_UI_: Notiz

**Event**:
A notable happening in a month with a label and an amount, such as "Bought a car, −15,000 EUR", shown as a marker on the wealth chart.
_Avoid_: Milestone, big purchase
_UI_: Ereignis

**Projection**:
An estimate of future **Net worth**, built from an expected annual return per **Asset class**, a monthly savings amount and **Maturity dates**, shown with an optimistic and a pessimistic band.
_Avoid_: Prediction, forecast
_UI_: Prognose

## Cash flow

**Transaction**:
A single movement of money on an **Account**, as listed in a bank's CSV export: date, counterparty, purpose and amount.
_Avoid_: Booking, payment
_UI_: Umsatz

**Category**:
A label saying what a **Transaction** was for, such as Rent or Groceries. A Transaction with no Category is Uncategorized.
_Avoid_: Tag, type
_UI_: Kategorie

**Categorization rule**:
A condition on a **Transaction**'s fields, such as "counterparty contains REWE", that assigns a **Category** on import. A manually assigned Category always wins over a rule.
_Avoid_: Filter, auto-tag
_UI_: Regel

**Transfer**:
A pair of **Transactions** moving money between two of the owner's own **Accounts**. Transfers count as neither spending nor income.
_Avoid_: Internal booking, rebooking
_UI_: Umbuchung

**Trade**:
A **Transaction** that exchanges cash for a **Holding**, or a Holding for cash, inside one **Account**, such as buying an ETF on a broker account. Trades count as neither spending nor income; dividends and interest are income.
_Avoid_: Order, purchase
_UI_: Kauf / Verkauf

**Savings rate**:
Income minus expenses, divided by income, for one month, calculated from **Transactions** excluding **Transfers** and **Trades**. It is only valid for months in which all Accounts carrying income and spending have been imported.
_Avoid_: Savings quota
_UI_: Sparquote

**Import profile**:
The saved description of how to read one **Account**'s CSV export: which column holds the date, amount, counterparty and purpose, plus the file's separators and formats. Built-in Import profiles exist for Trade Republic and Raiffeisen ELBA.
_Avoid_: Bank format, parser, mapping
_UI_: Importprofil

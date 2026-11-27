# 02: Manage Institute, Konten and Positionen

**What to build:** The owner can create, rename and edit Institutions (Institute), Accounts (Konten) and Holdings (Positionen) through the UI, and every change is saved immediately. An Account has a name, an optional IBAN and a Default classification (Standardeinordnung). A Holding has an Asset class (Anlageklasse) and a Liquidity (Verfügbarkeit); a Locked Holding requires a Maturity date (Fälligkeit). Debts are Accounts whose values are negative, and pensions are Holdings Locked until a retirement date.

**Blocked by:** 01: Walking skeleton

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core commands to create and update Institutions, Accounts and Holdings, with validation errors (e.g. Locked without a Maturity date)
- [ ] Asset classes: Cash, ETF, Stock, Bond, Crypto, Commodity, Other
- [ ] An Account can be marked as a debt, and its values then count negatively
- [ ] Changing a Holding's classification is reflected in every query, including history
- [ ] A settings view lists Institutions → Accounts → Holdings and allows editing them
- [ ] Every change is persisted through the store immediately
- [ ] Core tests cover the commands and validation; a Playwright test creates an Institution, an Account and a Holding

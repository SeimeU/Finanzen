# 09: Start screen breakdowns

**What to build:** The start screen becomes the full overview: the Net worth chart is a stacked area by Asset class, with a time-range selector (1 year, 5 years, all) and Event markers. Headline figures show current Net worth and the change versus last month and versus 12 months ago, in EUR and percent. Two small charts show the current split between Available and Locked money and by Institution. The owner can see how much they hold in each Asset class now and over time.

**Blocked by:** 04: Historic Kontostand gesamt

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core queries: breakdown series by Asset class; current breakdowns by Asset class, Liquidity and Institution; change versus 1 and 12 months ago
- [ ] Account-level values appear under the Default classification in every breakdown
- [ ] Stacked area chart with a range selector; Available/Locked and Institution charts
- [ ] Charts render correctly with history entered as Account-level values and recent months per Holding
- [ ] Core tests for each query; Playwright checks the headline figures

import { describe, expect, it } from "vitest";
import { formatChange, formatDate, formatDateTime, formatEur, formatEurInput, formatMonth, formatPercent, parseEur } from "./format";

describe("parseEur (German input → integer cents)", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,5", 123450],
    ["1234", 123400],
    [" 12.000 ", 1200000],
    ["0,07", 7],
    ["-15.000,00", -1500000],
    ["1.234,56 €", 123456],
  ])("%s → %i", (text, cents) => {
    expect(parseEur(text)).toBe(cents);
  });

  it.each(["", "abc", "1,234", "1.23,45", "12,3,4"])("%j is not an amount", (text) => {
    expect(parseEur(text)).toBeNull();
  });
});

describe("formatEurInput (cents → editable German amount)", () => {
  it.each([
    [123456, "1.234,56"],
    [5, "0,05"],
    [-1500000, "-15.000,00"],
  ])("%i → %s", (cents, text) => {
    expect(formatEurInput(cents)).toBe(text);
  });
});

describe("formatMonth", () => {
  it("2026-03 → März 2026", () => {
    expect(formatMonth("2026-03")).toBe("März 2026");
  });
});

describe("formatEur (amounts are integer cents)", () => {
  it.each([
    [123456, "1.234,56 €"],
    [0, "0,00 €"],
    [5, "0,05 €"],
    [100, "1,00 €"],
    [123456789, "1.234.567,89 €"],
    [-1500000, "-15.000,00 €"],
    [-7, "-0,07 €"],
  ])("%i cents → %s", (cents, expected) => {
    expect(formatEur(cents)).toBe(expected);
  });
});

describe("formatDate (ISO calendar date in, German date out)", () => {
  it.each([
    ["2025-03-31", "31.03.2025"],
    ["2024-01-05", "05.01.2024"],
  ])("%s → %s", (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });
});

describe("formatDateTime (UTC instant in, German local date and time out)", () => {
  it.each([
    ["2026-11-26T22:05:09.123Z", "Europe/Vienna", "26.11.2026 23:05:09"],
    ["2026-07-31T22:30:00.000Z", "Europe/Vienna", "01.08.2026 00:30:00"],
    ["2026-01-02T03:04:05.000Z", "UTC", "02.01.2026 03:04:05"],
  ])("%s in %s → %s", (iso, timeZone, expected) => {
    expect(formatDateTime(iso, timeZone)).toBe(expected);
  });
});

describe("formatPercent and formatChange (signed, one decimal)", () => {
  it.each([
    [5, "+5,0 %"],
    [31.25, "+31,3 %"],
    [-2.04, "-2,0 %"],
    [0, "0,0 %"],
  ])("%d → %s", (percent, text) => {
    expect(formatPercent(percent)).toBe(text);
  });

  it("shows the amount with a sign, then the percent", () => {
    expect(formatChange({ amount: 100_000, percent: 5 })).toBe("+1.000,00 € (+5,0 %)");
    expect(formatChange({ amount: -15_050, percent: -1.5 })).toBe("-150,50 € (-1,5 %)");
    expect(formatChange({ amount: 10_000, percent: null })).toBe("+100,00 €");
  });
});

import { describe, expect, it } from "vitest";
import { formatDate, formatEur } from "./format";

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

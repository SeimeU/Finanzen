// German display formatting. Formatting happens only in the UI; the core works in integer cents.

/** 123456 → "1.234,56 €" (plain space before €, hyphen-minus for negatives). */
export function formatEur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  const euros = Math.floor(absolute / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = (absolute % 100).toString().padStart(2, "0");
  return `${sign}${euros},${rest} €`;
}

/** 123456 → "1.234,56": formatEur without the currency, for pre-filling an input. */
export function formatEurInput(cents: number): string {
  return formatEur(cents).slice(0, -2);
}

/**
 * German amount as typed ("1.234,56", "1234,5", "12.000", optional "€") → integer cents,
 * or null if it is not an amount. Dots group thousands, the comma is the decimal separator.
 */
export function parseEur(text: string): number | null {
  const match = text
    .replace(/€/g, "")
    .trim()
    .match(/^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!match) return null;
  const [, sign, euros, rest = ""] = match;
  const cents = Number(euros!.replace(/\./g, "")) * 100 + Number(rest.padEnd(2, "0"));
  return sign ? -cents : cents;
}

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** "2026-03" → "März 2026". */
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/** "2025-03-31" → "31.03.2025". Takes an ISO calendar date, never a Date (no time-zone shifts). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

/** "2026-11-26T22:05:09Z" → "26.11.2026 23:05:09" in the browser's time zone (or `timeZone`). */
export function formatDateTime(isoInstant: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("de-AT", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoInstant));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("day")}.${part("month")}.${part("year")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

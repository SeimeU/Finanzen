// German display formatting. Formatting happens only in the UI; the core works in integer cents.

/** 123456 → "1.234,56 €" (plain space before €, hyphen-minus for negatives). */
export function formatEur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  const euros = Math.floor(absolute / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = (absolute % 100).toString().padStart(2, "0");
  return `${sign}${euros},${rest} €`;
}

/** "2025-03-31" → "31.03.2025". Takes an ISO calendar date, never a Date (no time-zone shifts). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

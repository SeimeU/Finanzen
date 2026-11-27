/** Decodes a CSV file's bytes: UTF-8 first (a BOM is dropped), Windows-1252 if that is not valid UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * RFC 4180 style parsing: fields may be quoted ("" escapes a quote, quoted fields may
 * contain the separator and line breaks), lines end in LF or CRLF. Blank lines are dropped.
 * Returns null when a quote is never closed.
 */
export function parseCsv(text: string, separator: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === separator) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) return null;
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
}

/** "-23.455" → -2346 cents (half away from zero). Decimal point only; null if not a plain number. */
export function decimalToCents(raw: string): number | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const digits = (fraction + "000").slice(0, 3);
  let cents = Number(whole) * 100 + Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) cents += 1;
  return sign === "-" && cents !== 0 ? -cents : cents;
}

export { isIsoDate } from "../dates";

/** The text up to the first line break (the header row, for `detect`). */
export function firstLine(text: string): string {
  const end = text.search(/\r?\n/);
  return end === -1 ? text : text.slice(0, end);
}

/** A header cell as profiles compare it: trimmed, lower case. */
export function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase();
}

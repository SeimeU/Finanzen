/**
 * Ids are a prefix plus a running number ("i1", "imp3", "ip2"), unique among `entries`.
 * Ids with a longer prefix that starts the same (e.g. "imp" for "i") or no number are ignored.
 */
export function nextNumber(entries: { id: string }[], prefix: string): number {
  let max = 0;
  for (const e of entries) {
    if (!e.id.startsWith(prefix)) continue;
    const n = Number(e.id.slice(prefix.length));
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return max + 1;
}

export function nextId(entries: { id: string }[], prefix: string): string {
  return `${prefix}${nextNumber(entries, prefix)}`;
}

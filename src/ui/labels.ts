// German UI labels for domain values (see GLOSSARY.md `_UI_` lines).
import type { AssetClass, Classification, Liquidity } from "../core";
import { formatDate } from "./format";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  cash: "Cash",
  etf: "ETF",
  stock: "Aktie",
  bond: "Anleihe",
  crypto: "Krypto",
  commodity: "Rohstoff",
  other: "Sonstiges",
};

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  available: "Verfügbar",
  locked: "Gebunden bis",
};

/** "ETF, Verfügbar" or "Anleihe, Gebunden bis 31.03.2027". */
export function formatClassification(c: Classification): string {
  const liquidity =
    c.liquidity === "locked" && c.maturityDate
      ? `${LIQUIDITY_LABELS.locked} ${formatDate(c.maturityDate)}`
      : LIQUIDITY_LABELS[c.liquidity];
  return `${ASSET_CLASS_LABELS[c.assetClass]}, ${liquidity}`;
}

// Domain core: pure TypeScript, no I/O, no clock. Import it only through this file.
export { CURRENT_SCHEMA_VERSION, createEmptyDocument, type WealthDocument } from "./document";
export { loadDocument } from "./migrations";
export { type CoreError, type Result } from "./result";
export {
  ASSET_CLASSES,
  LIQUIDITIES,
  type Account,
  type AssetClass,
  type Classification,
  type Holding,
  type Institution,
  type Liquidity,
} from "./document";
export * from "./structure";

// Domain core: pure TypeScript, no I/O, no clock. Import it only through this file.
export { CURRENT_SCHEMA_VERSION, createEmptyDocument, type WealthDocument } from "./document";
export { loadDocument } from "./migrations";
export { type CoreError, type Result } from "./result";
export {
  ASSET_CLASSES,
  LIQUIDITIES,
  type Account,
  type AccountValue,
  type AssetClass,
  type Classification,
  type Holding,
  type Institution,
  type HoldingValue,
  type MonthEvent,
  type Liquidity,
  type Snapshot,
  type YearMonth,
} from "./document";
export * from "./structure";
export * from "./snapshots";
export { accountIsOpen, closeAccount, closeHolding, holdingIsActive, setHoldingStart } from "./closing";
export * from "./notes";
export * from "./accountDetail";
export * from "./overview";
export * from "./maturities";
export { type ImportAccountChoice, type ImportRecord, type Transaction, type TransactionOrigin } from "./document";
export {
  confirmImport,
  listImports,
  previewImport,
  undoImport,
  type FilePreview,
  type ImportedFile,
  type ImportFileInput,
} from "./import/pipeline";
export type { ImportProfile, ParsedTransaction } from "./import/profile";
export { previewImportProfile, saveImportProfile, type ImportProfilePreview } from "./import/generic";
export {
  CATEGORY_KINDS,
  GENERIC_DATE_FORMATS,
  GENERIC_DECIMAL_SEPARATORS,
  GENERIC_SEPARATORS,
  type Category,
  type CategoryKind,
  type GenericColumnMapping,
  type GenericImportProfile,
  type GenericProfileSettings,
} from "./document";
export { searchTransactions, uncategorizedTransactions, type TransactionFilter } from "./transactions";
export {
  setTransactionCategory,
  type CategorySource,
  type ClassifiedTransaction,
  type TransactionClassification,
  type TransferSource,
} from "./classification";
export * from "./transfers";
export * from "./categories";
export { type CategorizationRule, type RuleCondition } from "./document";
export { createRule, deleteRule, listRules, moveRule, reapplyRules, updateRule, type RuleInput } from "./rules";

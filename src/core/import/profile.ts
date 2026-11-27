import type { TransactionOrigin } from "../document";
import type { CoreError } from "../result";

/**
 * One row of a bank export, normalized to the fields a Transaction keeps.
 * Amounts are signed integer cents in EUR (outflows negative).
 */
export type ParsedTransaction = {
  date: string;
  amountCents: number;
  counterpartyName: string;
  counterpartyIban: string | null;
  paymentReference: string;
  purpose: string;
  origin: TransactionOrigin;
};

export type ParseResult =
  | { ok: true; transactions: ParsedTransaction[] }
  | { ok: false; error: CoreError };

/**
 * An Import profile: how to recognize and read one bank's CSV export.
 * The pipeline (./pipeline.ts) tries each profile's `detect` on the decoded text and
 * parses the file with the first one that claims it. A profile that recognizes a file
 * but finds anything unexpected must fail the whole file, never skip rows silently.
 * To add a profile, implement this type and add it to BUILT_IN_PROFILES (./profiles.ts).
 */
export type ImportProfile = {
  id: string;
  /** Shown on the confirmation screen as the detected format. */
  label: string;
  /** Whether an Account at this Institution is a likely target for this profile's files. */
  matchesInstitution: (institutionName: string) => boolean;
  /** A profile saved for one Account (generic profiles) suggests that Account directly. */
  accountId?: string;
  /** Cheap check on the decoded text, e.g. the header row. Must not throw. */
  detect: (text: string) => boolean;
  parse: (text: string) => ParseResult;
};

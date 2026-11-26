/**
 * The data document: all of the owner's state as one versioned JSON value.
 * Later tickets add Institutions, Accounts, Holdings, Snapshots, ... here,
 * and bump CURRENT_SCHEMA_VERSION with a migration in ./migrations.ts.
 */
export type WealthDocument = {
  schemaVersion: number;
};

export const CURRENT_SCHEMA_VERSION = 1;

export function createEmptyDocument(): WealthDocument {
  return { schemaVersion: CURRENT_SCHEMA_VERSION };
}

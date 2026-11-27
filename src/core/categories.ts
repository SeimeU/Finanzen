import { CATEGORY_KINDS, type Category, type CategoryKind, type WealthDocument } from "./document";
import { fail, type Result } from "./result";

export type CategoryNode = { id: string; name: string; kind: CategoryKind; children: CategoryNode[] };

/** The Category tree in stored order: top-level Categories with their children. */
export function listCategories(document: WealthDocument): CategoryNode[] {
  const node = (c: Category, children: CategoryNode[]): CategoryNode => ({ id: c.id, name: c.name, kind: c.kind, children });
  return document.categories
    .filter((c) => c.parentId === null)
    .map((top) => node(top, document.categories.filter((c) => c.parentId === top.id).map((c) => node(c, []))));
}

type Created = Result<{ document: WealthDocument; id: string }>;
type Updated = Result<{ document: WealthDocument }>;

/** Adds a Category. With a parentId it becomes a child (second level) and takes the parent's kind. */
export function createCategory(
  document: WealthDocument,
  input: { name: string; parentId: string | null; kind: CategoryKind },
): Created {
  const parentId = input.parentId ?? null;
  const parent = parentId === null ? null : document.categories.find((c) => c.id === parentId);
  if (parent === undefined) return fail("category-not-found", "Die übergeordnete Kategorie gibt es nicht.");
  if (parent && parent.parentId !== null) {
    return fail("too-deep", "Kategorien haben nur zwei Ebenen. Bitte eine Hauptkategorie als übergeordnete wählen.");
  }
  if (!parent && !CATEGORY_KINDS.includes(input.kind)) {
    return fail("kind-required", "Bitte Einnahme oder Ausgabe wählen.");
  }
  const name = validName(document, input.name, parentId, null);
  if (!name.ok) return name;
  const id = nextCategoryId(document);
  const category: Category = { id, name: name.value, parentId, kind: parent ? parent.kind : input.kind };
  // Keep each child right after its siblings so the stored order reads as the tree.
  const categories = [...document.categories];
  let lastSibling = -1;
  categories.forEach((c, i) => {
    if (c.id === parentId || c.parentId === parentId) lastSibling = i;
  });
  if (parentId === null || lastSibling === -1) categories.push(category);
  else categories.splice(lastSibling + 1, 0, category);
  return { ok: true, id, document: { ...document, categories } };
}

/** Renames a Category. `kind` applies only to a top-level Category and carries over to its children. */
export function updateCategory(
  document: WealthDocument,
  input: { id: string; name: string; kind?: CategoryKind },
): Updated {
  const existing = document.categories.find((c) => c.id === input.id);
  if (!existing) return fail("category-not-found", "Diese Kategorie gibt es nicht.");
  const name = validName(document, input.name, existing.parentId, existing.id);
  if (!name.ok) return name;
  const kind = existing.parentId === null && input.kind && CATEGORY_KINDS.includes(input.kind) ? input.kind : existing.kind;
  return {
    ok: true,
    document: {
      ...document,
      categories: document.categories.map((c) =>
        c.id === existing.id ? { ...c, name: name.value, kind } : c.parentId === existing.id ? { ...c, kind } : c,
      ),
    },
  };
}

/**
 * Deletes a Category that has no children, and the Categorization rules that assign it.
 * Transactions in it (by hand or by rule) are classified automatically again (or land in the inbox).
 */
export function deleteCategory(document: WealthDocument, input: { id: string }): Updated {
  if (!document.categories.some((c) => c.id === input.id)) return fail("category-not-found", "Diese Kategorie gibt es nicht.");
  if (document.categories.some((c) => c.parentId === input.id)) {
    return fail("category-has-children", "Bitte zuerst die Unterkategorien löschen oder verschieben.");
  }
  return {
    ok: true,
    document: {
      ...document,
      categories: document.categories.filter((c) => c.id !== input.id),
      categorizationRules: document.categorizationRules.filter((r) => r.categoryId !== input.id),
      transactions: document.transactions.map((t) =>
        t.manualCategoryId === input.id || t.ruleCategoryId === input.id
          ? {
              ...t,
              manualCategoryId: t.manualCategoryId === input.id ? null : t.manualCategoryId,
              ruleCategoryId: t.ruleCategoryId === input.id ? null : t.ruleCategoryId,
            }
          : t,
      ),
    },
  };
}

function validName(
  document: WealthDocument,
  raw: string,
  parentId: string | null,
  selfId: string | null,
): Result<{ value: string }> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return fail("name-required", "Bitte einen Namen eingeben.");
  const taken = document.categories.some(
    (c) => c.parentId === parentId && c.id !== selfId && c.name.toLowerCase() === value.toLowerCase(),
  );
  if (taken) return fail("category-exists", `Die Kategorie „${value}“ gibt es hier bereits.`);
  return { ok: true, value };
}

function nextCategoryId(document: WealthDocument): string {
  let max = 0;
  for (const c of document.categories) {
    const m = /^c(\d+)$/.exec(c.id);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `c${max + 1}`;
}

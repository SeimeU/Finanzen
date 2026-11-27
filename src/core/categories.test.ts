import { describe, expect, it } from "vitest";
import {
  createCategory,
  createEmptyDocument,
  deleteCategory,
  listCategories,
  updateCategory,
  type CategoryNode,
  type Result,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

describe("default Categories", () => {
  it("a new document starts with a two-level list, each Category income or expense", () => {
    const tree = listCategories(createEmptyDocument());
    const wohnen = tree.find((c) => c.name === "Wohnen")!;
    expect(wohnen.kind).toBe("expense");
    expect(wohnen.children.map((c) => [c.name, c.kind])).toContainEqual(["Miete", "expense"]);
    const kapital = tree.find((c) => c.name === "Kapitalerträge")!;
    expect(kapital.kind).toBe("income");
    expect(tree.find((c) => c.name === "Steuern")!.kind).toBe("expense");
    for (const top of tree) for (const child of top.children) expect(child.children).toEqual([]);
  });
});

const find = (document: WealthDocument, name: string): CategoryNode => {
  const all = listCategories(document).flatMap((c) => [c, ...c.children]);
  const found = all.find((c) => c.name === name);
  if (!found) throw new Error(`no Category ${name}`);
  return found;
};

describe("editing Categories", () => {
  it("adds a top-level Category and a child that takes its parent's kind", () => {
    const top = must(createCategory(createEmptyDocument(), { name: "Haustier", parentId: null, kind: "expense" }));
    const child = must(createCategory(top.document, { name: "Futter", parentId: top.id, kind: "income" }));
    const haustier = find(child.document, "Haustier");
    expect(haustier).toEqual({ id: top.id, name: "Haustier", kind: "expense", children: [{ id: child.id, name: "Futter", kind: "expense", children: [] }] });
  });

  it("rejects an empty name, a duplicate name under the same parent, a third level and an unknown parent", () => {
    const document = createEmptyDocument();
    const wohnen = find(document, "Wohnen").id;
    const miete = find(document, "Miete").id;
    expect(createCategory(document, { name: " ", parentId: null, kind: "expense" })).toMatchObject({ ok: false, error: { code: "name-required" } });
    expect(createCategory(document, { name: "miete", parentId: wohnen, kind: "expense" })).toMatchObject({ ok: false, error: { code: "category-exists" } });
    expect(createCategory(document, { name: "Garage", parentId: miete, kind: "expense" })).toMatchObject({ ok: false, error: { code: "too-deep" } });
    expect(createCategory(document, { name: "Garage", parentId: "nope", kind: "expense" })).toMatchObject({ ok: false, error: { code: "category-not-found" } });
    // The same name under another parent is fine.
    expect(createCategory(document, { name: "Miete", parentId: find(document, "Freizeit").id, kind: "expense" }).ok).toBe(true);
  });

  it("renames a Category; changing a top-level kind changes its children too", () => {
    const document = createEmptyDocument();
    const renamed = must(updateCategory(document, { id: find(document, "Miete").id, name: "Wohnungsmiete" })).document;
    expect(find(renamed, "Wohnen").children.map((c) => c.name)).toContain("Wohnungsmiete");
    const flipped = must(updateCategory(renamed, { id: find(renamed, "Sonstiges").id, name: "Sonstiges", kind: "income" })).document;
    expect(find(flipped, "Sonstiges").kind).toBe("income");
    expect(find(flipped, "Gebühren").kind).toBe("income");
  });

  it("a child's kind follows its parent and cannot be changed on its own", () => {
    const document = createEmptyDocument();
    const updated = must(updateCategory(document, { id: find(document, "Miete").id, name: "Miete", kind: "income" })).document;
    expect(find(updated, "Miete").kind).toBe("expense");
  });

  it("deletes a Category without children; one with children is refused", () => {
    const document = createEmptyDocument();
    expect(deleteCategory(document, { id: find(document, "Wohnen").id })).toMatchObject({ ok: false, error: { code: "category-has-children" } });
    const deleted = must(deleteCategory(document, { id: find(document, "Miete").id })).document;
    expect(find(deleted, "Wohnen").children.map((c) => c.name)).not.toContain("Miete");
    expect(deleteCategory(document, { id: "nope" })).toMatchObject({ ok: false, error: { code: "category-not-found" } });
  });
});

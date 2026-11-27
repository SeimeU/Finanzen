import { useEffect, useState, type FormEvent } from "react";
import { CATEGORY_KINDS, type CategoryKind, type CategoryNode } from "../../core";
import { ApiError, categoriesApi } from "../api";
import { CATEGORY_KIND_LABELS } from "../labels";

/** The Category editor (Kategorien): two levels, each top-level Category income or expense. */
export function CategoriesView() {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    categoriesApi.list().then((r) => setTree(r.categories));
  }, []);

  /** Runs a Category command; returns whether it succeeded. */
  async function run(action: () => Promise<{ categories: CategoryNode[] }>): Promise<boolean> {
    setError("");
    try {
      setTree((await action()).categories);
      return true;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
      return false;
    }
  }

  return (
    <main className="page">
      <h1>Kategorien</h1>
      <NewCategoryForm tree={tree} run={run} />
      {error && <p role="alert">{error}</p>}
      <ul className="categories">
        {tree.map((top) => (
          <li key={top.id} aria-label={top.name} className="category-top">
            <CategoryRow category={top} isTop deletable={top.children.length === 0} run={run} />
            {top.children.length > 0 && (
              <ul>
                {top.children.map((child) => (
                  <li key={child.id} aria-label={child.name}>
                    <CategoryRow category={child} isTop={false} deletable run={run} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

type Run = (action: () => Promise<{ categories: CategoryNode[] }>) => Promise<boolean>;

function NewCategoryForm({ tree, run }: { tree: CategoryNode[]; run: Run }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => categoriesApi.create({ name, parentId: parentId || null, kind }))) setName("");
  }

  return (
    <form aria-label="Neue Kategorie" className="row inline-form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Übergeordnet
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Keine (Hauptkategorie)</option>
          {tree.map((top) => (
            <option key={top.id} value={top.id}>
              {top.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Art
        <select
          value={parentId ? (tree.find((t) => t.id === parentId)?.kind ?? kind) : kind}
          disabled={parentId !== ""}
          onChange={(e) => setKind(e.target.value as CategoryKind)}
        >
          {CATEGORY_KINDS.map((k) => (
            <option key={k} value={k}>
              {CATEGORY_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Hinzufügen</button>
    </form>
  );
}

/** One Category: rename it, change a top-level kind, or delete it (not while it has children). */
function CategoryRow({
  category,
  isTop,
  deletable,
  run,
}: {
  category: CategoryNode;
  isTop: boolean;
  deletable: boolean;
  run: Run;
}) {
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState(category.kind);
  useEffect(() => {
    setName(category.name);
    setKind(category.kind);
  }, [category.name, category.kind]);

  return (
    <div className="row category">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {isTop ? (
        <label>
          Art
          <select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            {CATEGORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="meta">{CATEGORY_KIND_LABELS[category.kind]}</span>
      )}
      <button
        type="button"
        className="secondary"
        disabled={name === category.name && kind === category.kind}
        onClick={() => run(() => categoriesApi.update({ id: category.id, name, kind: isTop ? kind : undefined }))}
      >
        Speichern
      </button>
      <button
        type="button"
        className="secondary"
        aria-label={`${category.name} löschen`}
        title={deletable ? undefined : "Zuerst die Unterkategorien löschen"}
        disabled={!deletable}
        onClick={() => run(() => categoriesApi.remove(category.id))}
      >
        Löschen
      </button>
    </div>
  );
}

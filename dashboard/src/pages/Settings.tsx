import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  createCategory,
  deleteCategory,
  fetchApps,
  fetchCategories,
  patchApp,
  patchCategory,
  type App,
  type Category,
} from "../api";

// The dataviz skill's validated dark-mode categorical palette (8 fixed hues, fixed order),
// checked against this dashboard's actual surface color (#020617) — not hand-picked.
const CATEGORY_COLORS = [
  "#3987e5", // blue
  "#199e70", // aqua
  "#c98500", // yellow
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
  "#d55181", // magenta
  "#d95926", // orange
];

interface SettingsProps {
  onAuthError: () => void;
}

export function Settings({ onAuthError }: SettingsProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([fetchCategories(), fetchApps()]);
      setCategories(c.categories);
      setApps(a.apps);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateCategory(name: string, color: string) {
    await createCategory(name, color);
    await load();
  }

  async function handleSaveCategory(id: number, name: string, color: string) {
    await patchCategory(id, { name, color });
    setEditingId(null);
    await load();
  }

  async function handleDeleteCategory(id: number) {
    await deleteCategory(id);
    await load();
  }

  async function handleAssignApp(exe: string, categoryId: number | null) {
    // Optimistic update — the app list re-sorts (uncategorized-first) on next full reload,
    // but flipping the field immediately keeps the dropdown from feeling laggy on tap.
    setApps((prev) => prev.map((a) => (a.exe === exe ? { ...a, categoryId } : a)));
    await patchApp(exe, { categoryId });
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-5 pb-10 pt-8 text-slate-100">
      <h1 className="text-sm font-medium uppercase tracking-wide text-slate-500">Settings</h1>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categories</h2>
        <div className="mt-3 space-y-2">
          {categories.map((cat) =>
            editingId === cat.id ? (
              <CategoryEditor
                key={cat.id}
                initialName={cat.name}
                initialColor={cat.color}
                onSave={(name, color) => handleSaveCategory(cat.id, name, color)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={cat.id} className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm text-slate-200">{cat.name}</span>
                <button onClick={() => setEditingId(cat.id)} className="text-xs text-slate-400">
                  Edit
                </button>
                <button onClick={() => handleDeleteCategory(cat.id)} className="text-xs text-red-400">
                  Delete
                </button>
              </div>
            ),
          )}
          {categories.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
        </div>

        <div className="mt-3">
          <CategoryEditor initialName="" initialColor={CATEGORY_COLORS[0]} onSave={handleCreateCategory} isNew />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apps</h2>
        <div className="mt-3 space-y-2">
          {apps.map((app) => (
            <div key={app.exe} className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2.5">
              <span className="flex-1 truncate text-sm text-slate-200">{app.displayName}</span>
              <select
                value={app.categoryId ?? ""}
                onChange={(e) => handleAssignApp(app.exe, e.target.value === "" ? null : Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {apps.length === 0 && (
            <p className="text-sm text-slate-500">No apps tracked yet — they'll show up here once the agent uploads some activity.</p>
          )}
        </div>
      </section>
    </div>
  );
}

interface CategoryEditorProps {
  initialName: string;
  initialColor: string;
  onSave: (name: string, color: string) => void | Promise<void>;
  onCancel?: () => void;
  isNew?: boolean;
}

function CategoryEditor({ initialName, initialColor, onSave, onCancel, isNew }: CategoryEditorProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed, color);
      if (isNew) setName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-slate-900 px-3 py-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={isNew ? "New category name" : "Category name"}
        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Choose color ${c}`}
            className="h-7 w-7 rounded-full"
            style={{
              backgroundColor: c,
              boxShadow: color === c ? "0 0 0 2px #020617, 0 0 0 4px #ffffff" : undefined,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-slate-400">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {isNew ? "Add category" : "Save"}
        </button>
      </div>
    </form>
  );
}

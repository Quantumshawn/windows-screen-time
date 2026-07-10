import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  createCategory,
  deleteCategory,
  fetchApps,
  fetchCategories,
  fetchSettings,
  patchApp,
  patchCategory,
  putSettings,
  type App,
  type Category,
} from "../api";
import { disablePushNotifications, enablePushNotifications, getPushSubscriptionStatus, isPushSupported } from "../push";
import { BellIcon, CheckIcon, ClockIcon } from "../icons";

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
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState<number | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a, s, sub] = await Promise.all([
        fetchCategories(),
        fetchApps(),
        fetchSettings(),
        isPushSupported() ? getPushSubscriptionStatus() : Promise.resolve(null),
      ]);
      setCategories(c.categories);
      setApps(a.apps);
      setDailyLimitMinutes(s.dailyLimitMinutes);
      setLimitInput(s.dailyLimitMinutes !== null ? String(s.dailyLimitMinutes) : "");
      setPushSubscribed(sub !== null);
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

  async function handleSaveLimit(e: FormEvent) {
    e.preventDefault();
    const trimmed = limitInput.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) return;
    const result = await putSettings(value);
    setDailyLimitMinutes(result.dailyLimitMinutes);
  }

  async function handleTogglePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushSubscribed) {
        await disablePushNotifications();
        setPushSubscribed(false);
      } else {
        await enablePushNotifications();
        setPushSubscribed(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Failed to update notifications");
    } finally {
      setPushBusy(false);
    }
  }

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
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <span className="animate-pulse text-sm">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-200">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 pb-10 pt-8 text-slate-100">
      <p className="mb-6 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Settings</p>

      <section className="surface rounded-3xl p-5">
        <SectionHeader icon={<ClockIcon className="h-4 w-4" />} title="Daily limit" />
        <form onSubmit={handleSaveLimit} className="mt-4 flex items-center gap-2">
          <input
            type="number"
            min="1"
            inputMode="numeric"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            placeholder="No limit"
            className="w-24 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
          />
          <span className="text-sm text-slate-400">minutes / day</span>
          <button
            type="submit"
            className="ml-auto rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-colors active:bg-indigo-600"
          >
            Save
          </button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {dailyLimitMinutes !== null
            ? `Currently ${formatMinutes(dailyLimitMinutes)}/day. You'll be notified once, the first time you cross it each day.`
            : "No limit set — clear the field and save to remove an existing limit."}
        </p>
      </section>

      <section className="surface mt-4 rounded-3xl p-5">
        <SectionHeader icon={<BellIcon className="h-4 w-4" />} title="Notifications" />
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-200">{pushSubscribed ? "Enabled" : "Disabled"}</p>
            {!isPushSupported() && <p className="mt-0.5 text-xs text-slate-500">Not supported in this browser.</p>}
            {pushError && <p className="mt-0.5 text-xs text-red-400">{pushError}</p>}
          </div>
          <ToggleSwitch checked={pushSubscribed} disabled={pushBusy || !isPushSupported()} onChange={handleTogglePush} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          On iOS, this only works after adding ScreenTime to your Home Screen — notifications from a Safari tab aren't
          supported.
        </p>
      </section>

      <section className="surface mt-4 rounded-3xl p-5">
        <SectionHeader title="Categories" />
        <div className="mt-4 space-y-2">
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
              <div key={cat.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm text-slate-200">{cat.name}</span>
                <button onClick={() => setEditingId(cat.id)} className="text-xs font-medium text-slate-400">
                  Edit
                </button>
                <button onClick={() => handleDeleteCategory(cat.id)} className="text-xs font-medium text-red-400/90">
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

      <section className="surface mt-4 rounded-3xl p-5">
        <SectionHeader title="Apps" />
        <div className="mt-4 space-y-2">
          {apps.map((app) => (
            <div key={app.exe} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
              <span className="flex-1 truncate text-sm text-slate-200">{app.displayName}</span>
              <select
                value={app.categoryId ?? ""}
                onChange={(e) => handleAssignApp(app.exe, e.target.value === "" ? null : Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200"
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

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function SectionHeader({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      {icon}
      <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-indigo-500" : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
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
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white/[0.03] p-3.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={isNew ? "New category name" : "Category name"}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
      />
      <div className="mt-3 flex flex-wrap gap-2.5">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Choose color ${c}`}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90"
            style={{ backgroundColor: c }}
          >
            {color === c && <CheckIcon className="h-4 w-4 text-white drop-shadow" />}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-full px-3.5 py-2 text-xs font-medium text-slate-400">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-colors active:bg-indigo-600 disabled:opacity-50"
        >
          {isNew ? "Add category" : "Save"}
        </button>
      </div>
    </form>
  );
}

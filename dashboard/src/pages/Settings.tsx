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

const CATEGORY_COLORS = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
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
    setApps((prev) => prev.map((a) => (a.exe === exe ? { ...a, categoryId } : a)));
    await patchApp(exe, { categoryId });
  }

  if (loading) {
    return (
      <div className="page page-center text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
          <span className="animate-pulse-soft text-sm text-slate-500">Loading settings…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page-center text-slate-100">
        <div className="surface w-full max-w-md rounded-[1.75rem] px-8 py-8">
          <p className="text-red-400">{error}</p>
          <button type="button" onClick={load} className="btn-primary mt-4 w-full rounded-full px-5">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page text-slate-100">
      <div className="animate-rise mb-6 lg:mb-8">
        <p className="eyebrow">Settings</p>
        <p className="mt-1.5 hidden text-base text-slate-400 lg:block">Limits, notifications, categories, and apps</p>
      </div>

      <div className="settings-layout">
        <section className="surface animate-rise rounded-[1.75rem] p-4 sm:p-5 lg:p-6">
          <SectionHeader icon={<ClockIcon className="h-4 w-4" />} title="Daily limit" />
          <form onSubmit={handleSaveLimit} className="mt-4 flex flex-wrap items-center gap-2.5">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              placeholder="No limit"
              className="field num w-28 px-3.5 py-3 text-slate-100"
            />
            <span className="text-[15px] text-slate-400">min / day</span>
            <button type="submit" className="btn-primary ml-auto rounded-full px-5 text-sm">
              Save
            </button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {dailyLimitMinutes !== null
              ? `Currently ${formatMinutes(dailyLimitMinutes)}/day. You'll be notified once, the first time you cross it each day.`
              : "No limit set — clear the field and save to remove an existing limit."}
          </p>
        </section>

        <section className="surface animate-rise-delay-1 rounded-[1.75rem] p-4 sm:p-5 lg:p-6">
          <SectionHeader icon={<BellIcon className="h-4 w-4" />} title="Notifications" />
          <div className="mt-4 flex min-h-[3.25rem] items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-white/[0.04]">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-slate-100">
                {pushSubscribed ? "Enabled" : "Disabled"}
              </p>
              {!isPushSupported() && <p className="mt-0.5 text-xs text-slate-500">Not supported in this browser.</p>}
              {pushError && <p className="mt-0.5 text-xs text-red-400">{pushError}</p>}
            </div>
            <ToggleSwitch checked={pushSubscribed} disabled={pushBusy || !isPushSupported()} onChange={handleTogglePush} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            On iOS, enable notifications only after adding ScreenTime to your Home Screen — Safari tabs can&apos;t
            receive push.
          </p>
        </section>

        <section className="surface animate-rise-delay-1 rounded-[1.75rem] p-4 sm:p-5 lg:p-6">
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
                <div
                  key={cat.id}
                  className="flex min-h-[3.25rem] items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.04]"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color, boxShadow: `0 0 8px ${cat.color}66` }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-100">{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => setEditingId(cat.id)}
                    className="min-h-11 min-w-11 rounded-xl px-2 text-xs font-semibold text-slate-400 active:bg-white/5 lg:hover:text-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="min-h-11 min-w-11 rounded-xl px-2 text-xs font-semibold text-red-400/80 active:bg-white/5 lg:hover:text-red-400"
                  >
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

        <section className="surface animate-rise-delay-2 rounded-[1.75rem] p-4 sm:p-5 lg:p-6">
          <SectionHeader title="Apps" />
          <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1 lg:max-h-[32rem]">
            {apps.map((app) => (
              <div
                key={app.exe}
                className="flex min-h-[3.25rem] items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.04]"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-100">{app.displayName}</span>
                <select
                  value={app.categoryId ?? ""}
                  onChange={(e) => handleAssignApp(app.exe, e.target.value === "" ? null : Number(e.target.value))}
                  className="field max-w-[48%] shrink-0 rounded-xl px-3 py-2 text-slate-200 lg:max-w-[12rem]"
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
              <p className="text-sm text-slate-500">
                No apps tracked yet — they&apos;ll show up here once the agent uploads some activity.
              </p>
            )}
          </div>
        </section>
      </div>
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
      {icon && <span className="text-sky-300/80">{icon}</span>}
      <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]">{title}</h2>
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
      className={`relative h-8 w-[3.25rem] shrink-0 rounded-full transition-all disabled:opacity-40 ${
        checked
          ? "bg-gradient-to-b from-sky-400 to-sky-500 shadow-[0_0_16px_-2px_rgba(14,165,233,0.7)]"
          : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[1.45rem]" : "translate-x-1"
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
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.04]">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={isNew ? "New category name" : "Category name"}
        enterKeyHint="done"
        className="field w-full rounded-xl px-3.5 py-3 text-slate-100"
      />
      <div className="mt-3 flex flex-wrap gap-2.5">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Choose color ${c}`}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90"
            style={{
              backgroundColor: c,
              boxShadow: color === c ? `0 0 0 2px #0e1118, 0 0 0 4px ${c}` : undefined,
            }}
          >
            {color === c && <CheckIcon className="h-4 w-4 text-white drop-shadow" />}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-full px-4 text-sm font-semibold text-slate-400"
          >
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving || !name.trim()} className="btn-primary rounded-full px-5 text-sm">
          {isNew ? "Add category" : "Save"}
        </button>
      </div>
    </form>
  );
}

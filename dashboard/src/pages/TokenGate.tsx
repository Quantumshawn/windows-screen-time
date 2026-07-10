import { useState, type FormEvent } from "react";
import { setStoredToken } from "../api";

interface TokenGateProps {
  onSaved: () => void;
}

export function TokenGate({ onSaved }: TokenGateProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setStoredToken(trimmed);
    onSaved();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-100">
      <h1 className="mb-2 text-xl font-semibold">ScreenTime</h1>
      <p className="mb-6 max-w-xs text-center text-sm text-slate-400">
        Enter your dashboard token to connect.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Dashboard token"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white active:bg-indigo-700"
        >
          Connect
        </button>
      </form>
    </div>
  );
}

/**
 * Built-in display names and noise apps to hide from totals / UI.
 * Matching is case-insensitive on process name (exe) and, for renames, on current display_name.
 */

/** Process name (agent ProcessName, usually without .exe) → friendly label */
export const DISPLAY_NAME_BY_EXE: Record<string, string> = {
  robloxplayerbeta: "Roblox",
  notepad: "Notepad",
};

/**
 * When the agent registered a weird FileDescription as display_name, map that → friendly name.
 * Keys are lowercased full display names.
 */
export const DISPLAY_NAME_BY_LABEL: Record<string, string> = {
  "zulu platform x64 architecture": "Minecraft",
  robloxplayerbeta: "Roblox",
  "notepad.exe": "Notepad",
};

/** Process names that should not count toward screen time or appear in lists. */
export const HIDDEN_EXES = new Set(
  [
    "applicationframehost",
    "snippingtool",
    "searchhost",
    "screentimeagent",
    "shellhost",
    "shellexperiencehost",
    "gamingservicesui",
    "storeinstallbroker",
    "windowsstoreinstallbroker",
    "installbroker",
  ].map((s) => s.toLowerCase()),
);

/** Display-name substrings that mark noise (matched case-insensitively). */
export const HIDDEN_DISPLAY_SUBSTR = [
  "application frame host",
  "store installer",
  "gaming services",
  "shellhost",
  "shell experience host",
];

export function preferredDisplayName(exe: string, displayName?: string): string {
  const exeKey = normalizeExe(exe);
  if (DISPLAY_NAME_BY_EXE[exeKey]) return DISPLAY_NAME_BY_EXE[exeKey];

  const label = (displayName ?? exe).trim();
  const labelKey = label.toLowerCase();
  if (DISPLAY_NAME_BY_LABEL[labelKey]) return DISPLAY_NAME_BY_LABEL[labelKey];

  // Strip trailing .exe from labels like Notepad.exe when no better map exists
  if (labelKey.endsWith(".exe") && label.length > 4) {
    return label.slice(0, -4);
  }

  return label || exe;
}

export function shouldHideApp(exe: string, displayName?: string): boolean {
  const exeKey = normalizeExe(exe);
  if (HIDDEN_EXES.has(exeKey)) return true;

  const label = (displayName ?? "").toLowerCase();
  if (!label) return false;
  return HIDDEN_DISPLAY_SUBSTR.some((s) => label.includes(s));
}

/** Agent usually sends ProcessName without extension; accept both. */
export function normalizeExe(exe: string): string {
  return exe.trim().toLowerCase().replace(/\.exe$/i, "");
}

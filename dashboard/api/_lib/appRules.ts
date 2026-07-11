import { query } from "./db.js";
import {
  DISPLAY_NAME_BY_EXE,
  DISPLAY_NAME_BY_LABEL,
  HIDDEN_DISPLAY_SUBSTR,
  HIDDEN_EXES,
  preferredDisplayName,
  shouldHideApp,
} from "./appDefaults.js";

let appliedThisInstance = false;

/**
 * Apply built-in renames + hide rules to whatever is already in `apps`.
 * Safe to call often; per serverless instance it only hits the DB once (plus after uploads).
 */
export async function applyBuiltInAppRules(force = false): Promise<void> {
  if (appliedThisInstance && !force) return;
  // Ensure column exists on older DBs that only ran CREATE TABLE IF NOT EXISTS once.
  await query(`ALTER TABLE apps ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE`);

  for (const [exeKey, name] of Object.entries(DISPLAY_NAME_BY_EXE)) {
    await query(
      `UPDATE apps SET display_name = $1
       WHERE lower(regexp_replace(exe, '\\.exe$', '', 'i')) = $2
         AND display_name IS DISTINCT FROM $1`,
      [name, exeKey],
    );
  }

  for (const [labelKey, name] of Object.entries(DISPLAY_NAME_BY_LABEL)) {
    await query(
      `UPDATE apps SET display_name = $1
       WHERE lower(display_name) = $2
         AND display_name IS DISTINCT FROM $1`,
      [name, labelKey],
    );
  }

  // Hide by process name
  for (const exeKey of HIDDEN_EXES) {
    await query(
      `UPDATE apps SET hidden = TRUE
       WHERE lower(regexp_replace(exe, '\\.exe$', '', 'i')) = $1
         AND hidden IS DISTINCT FROM TRUE`,
      [exeKey],
    );
  }

  // Hide by display-name substring
  for (const substr of HIDDEN_DISPLAY_SUBSTR) {
    await query(
      `UPDATE apps SET hidden = TRUE
       WHERE lower(display_name) LIKE $1
         AND hidden IS DISTINCT FROM TRUE`,
      [`%${substr}%`],
    );
  }

  appliedThisInstance = true;
}

/** Values to use when first inserting an app row from a slice upload. */
export function registrationFields(exe: string, rawDisplayName?: string): { displayName: string; hidden: boolean } {
  const displayName = preferredDisplayName(exe, rawDisplayName);
  return {
    displayName,
    hidden: shouldHideApp(exe, rawDisplayName ?? displayName),
  };
}

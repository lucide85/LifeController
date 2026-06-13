// Server-side settings, including the break-glass admin secure code.
// Read from settings.json on the server (gitignored). Falls back to env vars so
// the app still boots if the file is absent.
import { readFileSync } from "fs";
import { resolve } from "path";

export interface AppSettings {
  adminSecureCode: string | null;
  appName: string;
  allowSelfSignupRequests: boolean;
}

let cached: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cached) return cached;

  let fromFile: Partial<AppSettings> = {};
  try {
    const path = resolve(process.cwd(), "settings.json");
    const raw = readFileSync(path, "utf-8");
    fromFile = JSON.parse(raw);
  } catch {
    // settings.json missing — fine, fall back to env.
  }

  cached = {
    adminSecureCode:
      fromFile.adminSecureCode ?? process.env.ADMIN_SECURE_CODE ?? null,
    appName: fromFile.appName ?? "LifeController",
    allowSelfSignupRequests: fromFile.allowSelfSignupRequests ?? true,
  };
  return cached;
}

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "avikane@gmail.com").toLowerCase();
}

// Constant-time-ish comparison to validate a submitted admin secure code.
export function verifyAdminSecureCode(submitted: string): boolean {
  const expected = getSettings().adminSecureCode;
  if (!expected || !submitted) return false;
  if (submitted.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ submitted.charCodeAt(i);
  }
  return mismatch === 0;
}

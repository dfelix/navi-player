// The app's logging: to the browser console and to the Recent logs viewer
// (Settings → Advanced), as much as the Log level setting allows. At "silent",
// nothing at all.

import { shallowRef } from "vue";
import { useSettingsStore } from "@/stores/settings";
import type { LogLevel } from "@/lib/settingsSchema";

// A message shows when the Log level setting is at least as chatty as the
// message's own level.
const CHATTINESS: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

type Level = Exclude<LogLevel, "silent">;

function wanted(level: Level): boolean {
  let setting: LogLevel = "error";
  try {
    setting = useSettingsStore().power.developer.logLevel;
  } catch {
    // Too early for the settings store: errors only.
  }
  return CHATTINESS[setting] >= CHATTINESS[level];
}

export interface LogEntry {
  id: number;
  time: number;
  level: "error" | "warn" | "info" | "debug";
  scope: string;
  text: string;
}

// The most recent messages, for the in-app log viewer (Settings → Developer).
// Memory only: never persisted, gone on reload, and only what the Log level
// setting let through.
export const LOG_HISTORY_MAX = 500;
export const logHistory = shallowRef<readonly LogEntry[]>([]);
let nextId = 1;

// Credentials that can turn up in logged URLs or error messages: the Subsonic
// token, salt and password query parameters, and bearer tokens.
const SECRET_PARAM = /([?&](?:t|s|p|jwt)=)[^&\s"']*/g;
const BEARER = /(Bearer\s+)[\w.~+/=-]+/gi;

export function maskSecrets(text: string): string {
  return text.replace(SECRET_PARAM, "$1•••").replace(BEARER, "$1•••");
}

function stringify(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

function remember(level: LogEntry["level"], scope: string, args: unknown[]): void {
  const entry: LogEntry = {
    id: nextId++,
    time: Date.now(),
    level,
    scope,
    text: maskSecrets(args.map(stringify).join(" ")),
  };
  const kept = logHistory.value.slice(-(LOG_HISTORY_MAX - 1));
  kept.push(entry);
  logHistory.value = kept;
}

export function clearLogHistory(): void {
  logHistory.value = [];
}

// `scope` names the part of the app, e.g. "lrclib", for filtering.
function write(level: Level, kind: LogEntry["level"], scope: string, args: unknown[]): void {
  if (!wanted(level)) return;
  const method = kind === "info" ? "log" : kind;
  console[method](`[${scope}]`, ...args);
  remember(kind, scope, args);
}

// Warnings count as errors for the Log level setting: both mean something
// went wrong.
export const log = {
  error: (scope: string, ...args: unknown[]) => write("error", "error", scope, args),
  warn: (scope: string, ...args: unknown[]) => write("error", "warn", scope, args),
  info: (scope: string, ...args: unknown[]) => write("info", "info", scope, args),
  debug: (scope: string, ...args: unknown[]) => write("debug", "debug", scope, args),
};

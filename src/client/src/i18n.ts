import {
  DEFAULT_LOCALE_PREFERENCE,
  parseLocalePreference,
  resolveLocale,
  type PiStudioLocale,
  type PiStudioLocalePreference,
} from "../../shared/i18n/locale";
import { translate, type PiStudioCatalog, type PiStudioMessageKey, type PiStudioMessageParams } from "../../shared/i18n/translate";

/** Browser-local locale choice, stored like the theme preference. */
export const LOCALE_STORAGE_KEY = "pi-studio-app-locale";

const pluginCatalogs = new Map<string, PiStudioCatalog>();

/**
 * Resolved once per page load, before any component can render. Module-load
 * order guarantees this runs ahead of the app element's first render.
 */
const activeLocale: PiStudioLocale = bootLocale();

/** Locale used by PI STUDIO's own interface for the current page load. */
export function activePiStudioLocale(): PiStudioLocale {
  return activeLocale;
}

/** The saved preference: a supported locale, or `auto` to follow the browser. */
export function readLocalePreference(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): PiStudioLocalePreference {
  const raw = storage?.getItem(LOCALE_STORAGE_KEY);
  if (raw === undefined || raw === null) return DEFAULT_LOCALE_PREFERENCE;
  return parseLocalePreference(raw) ?? DEFAULT_LOCALE_PREFERENCE;
}

/**
 * Persist a locale choice and reload, so every component, plugin, and custom
 * element re-renders with the new catalog. Reloading keeps the mechanism simple
 * and matches how rarely the language changes.
 */
export function applyLocalePreference(preference: PiStudioLocalePreference): void {
  const storage = safeStorage();
  if (preference === DEFAULT_LOCALE_PREFERENCE) storage?.removeItem(LOCALE_STORAGE_KEY);
  else storage?.setItem(LOCALE_STORAGE_KEY, preference);
  globalThis.location.reload();
}

/** Translate a PI STUDIO interface message. */
export function t(key: PiStudioMessageKey, params?: PiStudioMessageParams): string {
  return translate(activeLocale, key, params);
}

/**
 * Register a plugin-owned catalog. Plugin keys are namespaced by the host as
 * `plugin:<pluginId>:<key>`, so a plugin cannot shadow host messages.
 */
export function registerPluginMessageCatalog(pluginId: string, catalog: PiStudioCatalog): void {
  // Namespace every plugin-local key here so resolution and the host fallback
  // both work against the same `plugin:<id>:<key>` key the lookup uses.
  const namespaced: Record<string, string> = {};
  for (const [key, message] of Object.entries(catalog)) namespaced[`plugin:${pluginId}:${key}`] = message;
  pluginCatalogs.set(pluginId, namespaced);
}

/** Translate a plugin-owned key, falling back to the host catalogs. */
export function pluginT(pluginId: string, key: string, params?: PiStudioMessageParams): string {
  return translate(activeLocale, `plugin:${pluginId}:${key}`, params, pluginCatalogs.get(pluginId));
}

/** Locale-aware date/time formatting for message timestamps and activity. */
export function formatLocaleDateTime(value: number | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(activeLocale, options).format(value);
}

/**
 * Resolve the locale for this page load. Kept DOM-free on purpose: plugin API
 * bundles are imported by Node-side artifact checks, where `document` does not
 * exist. `main.ts` tags the document instead.
 */
function bootLocale(): PiStudioLocale {
  return resolveLocale(readLocalePreference(), browserLanguageCandidates());
}

function browserLanguageCandidates(): readonly string[] {
  const languages: unknown = globalThis.navigator.languages;
  if (Array.isArray(languages) && languages.length > 0) {
    return languages.filter((candidate): candidate is string => typeof candidate === "string");
  }
  const language: unknown = globalThis.navigator.language;
  return typeof language === "string" && language !== "" ? [language] : [];
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Storage can be unavailable (private mode or blocked cookies); the locale
    // then stays on the browser-detected default for this page load.
    return undefined;
  }
}

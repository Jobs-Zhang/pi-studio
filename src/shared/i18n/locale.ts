/**
 * Locale identity for PI STUDIO's own UI strings.
 *
 * The locale is a browser-local preference, like the theme: users either let
 * the app follow the browser/system language (`auto`) or pin a supported
 * locale on this device. Servers, sessions, and stored data are unaffected.
 */
export const PI_STUDIO_LOCALES = ["en", "zh-CN"] as const;

export type PiStudioLocale = (typeof PI_STUDIO_LOCALES)[number];

/** A saved locale choice: a supported locale, or `auto` to follow the browser. */
export type PiStudioLocalePreference = PiStudioLocale | "auto";

/** The locale used when nothing matches; every catalog must define it. */
export const FALLBACK_LOCALE: PiStudioLocale = "en";

export const DEFAULT_LOCALE_PREFERENCE: PiStudioLocalePreference = "auto";

/** Parse stored or configured data only; unknown values fall back to `auto`. */
export function parseLocalePreference(value: unknown): PiStudioLocalePreference | undefined {
  if (value === "auto") return "auto";
  return isPiStudioLocale(value) ? value : undefined;
}

export function isPiStudioLocale(value: unknown): value is PiStudioLocale {
  if (typeof value !== "string") return false;
  return PI_STUDIO_LOCALES.some((locale) => locale === value);
}

/**
 * Resolve the locale to render with. `auto` walks the language candidates
 * (browser `navigator.languages`) in order, matching by exact tag first and by
 * primary language subtag second, so `zh-Hans-CN` and `zh-TW` both reach the
 * supported `zh-CN` catalog before falling back to English.
 */
export function resolveLocale(
  preference: PiStudioLocalePreference,
  candidates: readonly string[] = [],
): PiStudioLocale {
  if (preference !== "auto") return preference;
  for (const candidate of candidates) {
    const exact = PI_STUDIO_LOCALES.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
    if (exact !== undefined) return exact;
    const primary = candidate.split("-")[0]?.toLowerCase();
    if (primary === undefined || primary === "") continue;
    const byPrimary = PI_STUDIO_LOCALES.find((locale) => locale.split("-")[0]?.toLowerCase() === primary);
    if (byPrimary !== undefined) return byPrimary;
  }
  return FALLBACK_LOCALE;
}

/** Endonym shown in the language picker. */
export function localeDisplayName(locale: PiStudioLocale): string {
  return locale === "zh-CN" ? "简体中文" : "English";
}

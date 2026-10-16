import { en, type PiStudioMessageKey } from "./messages/en.js";
import { zhCN } from "./messages/zh-CN.js";
import { FALLBACK_LOCALE, type PiStudioLocale } from "./locale.js";

export type { PiStudioMessageKey };

export type PiStudioMessageParams = Record<string, string | number>;

/** A catalog is either the host catalog or a plugin-provided one. */
export type PiStudioCatalog = Readonly<Record<string, string>>;

const hostCatalogs: Record<PiStudioLocale, PiStudioCatalog> = {
  en,
  "zh-CN": zhCN,
};

const pluralRulesCache = new Map<PiStudioLocale, Intl.PluralRules>();

function pluralRulesFor(locale: PiStudioLocale): Intl.PluralRules {
  const cached = pluralRulesCache.get(locale);
  if (cached !== undefined) return cached;
  const rules = new Intl.PluralRules(locale);
  pluralRulesCache.set(locale, rules);
  return rules;
}

/**
 * Translate a host message key. Plugin catalogs are passed in by the caller so
 * plugin-owned keys resolve without the host knowing their contents.
 *
 * Resolution order: the requested locale, the fallback locale, then the key
 * itself, so a missing translation is visible instead of blank.
 */
export function translate(
  locale: PiStudioLocale,
  key: string,
  params?: PiStudioMessageParams,
  catalog?: PiStudioCatalog,
): string {
  const template = resolveTemplate(locale, key, params, catalog);
  return params === undefined ? template : interpolate(template, params);
}

function resolveTemplate(
  locale: PiStudioLocale,
  key: string,
  params: PiStudioMessageParams | undefined,
  catalog: PiStudioCatalog | undefined,
): string {
  const count = params?.["count"];
  const pluralKey = typeof count === "number" ? pluralKeyFor(locale, key, count, catalog) : undefined;
  return lookup(locale, pluralKey ?? key, catalog)
    ?? lookup(FALLBACK_LOCALE, pluralKey ?? key, catalog)
    ?? lookup(locale, key, catalog)
    ?? lookup(FALLBACK_LOCALE, key, catalog)
    ?? key;
}

function lookup(locale: PiStudioLocale, key: string, catalog: PiStudioCatalog | undefined): string | undefined {
  return (catalog ?? hostCatalogs[locale])[key];
}

/** Prefer `key_<category>`, then `key_other`, then the plain key. */
function pluralKeyFor(
  locale: PiStudioLocale,
  key: string,
  count: number,
  catalog: PiStudioCatalog | undefined,
): string | undefined {
  const category = pluralRulesFor(locale).select(count);
  const suffixed = `${key}_${category}`;
  if (lookup(locale, suffixed, catalog) !== undefined || lookup(FALLBACK_LOCALE, suffixed, catalog) !== undefined) {
    return suffixed;
  }
  const other = `${key}_other`;
  if (lookup(locale, other, catalog) !== undefined || lookup(FALLBACK_LOCALE, other, catalog) !== undefined) {
    return other;
  }
  return undefined;
}

function interpolate(template: string, params: PiStudioMessageParams): string {
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Translations for all pages and the YouTube content script. English is the
 * default; the language follows the browser unless picked in the settings.
 *
 * `t` is a live binding: call `setLanguage` before rendering. Pages reload
 * when the language changes instead of re-rendering every text.
 */
import { de } from '@/locales/de';
import { en, type Messages } from '@/locales/en';

export type Language = 'en' | 'de';
export type LanguagePref = 'auto' | Language;

export let t: Messages = en;
export let lang: Language = 'en';

export function resolveLanguage(pref: LanguagePref): Language {
  if (pref !== 'auto') return pref;
  const ui = globalThis.navigator?.language ?? 'en';
  return ui.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLanguage(pref: LanguagePref): void {
  lang = resolveLanguage(pref);
  t = lang === 'de' ? de : en;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** BCP 47 locale for number and date formatting. */
export function locale(): string {
  return lang === 'de' ? 'de-DE' : 'en-US';
}

/** Name of the extension (from _locales; getManifest() may return the raw "__MSG_…" key). */
export function appName(): string {
  const getMessage = browser.i18n.getMessage as (key: string) => string;
  return getMessage('extName') || 'UrTube';
}

/** 12345 → "12,345" / "12.345" */
export const n = (x: number) => x.toLocaleString(locale());

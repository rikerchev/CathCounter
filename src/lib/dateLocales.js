// v3.01 — maps the app's own language codes (see src/lib/languages.js) to a
// date-fns Locale object (for react-day-picker's `locale` prop, used by
// CompetitionCalendar.jsx) and a BCP-47 tag (for native Intl.DateTimeFormat /
// toLocaleDateString calls, used by SessionCalendar.jsx and
// CompetitionCalendar.jsx). Previously several calendar surfaces were
// hardcoded to Bulgarian month/weekday names and "bg-BG" formatting
// regardless of the user's selected language — this centralizes the mapping
// so every calendar follows whatever language is currently active.
import {
  bg, enUS, cs, de, es, fr, hu, it, mk, nl, pl, ro, ru, sk, srLatn, tr, uk,
} from "date-fns/locale";

export const DATE_FNS_LOCALES = {
  en: enUS,
  bg,
  ro,
  hu,
  fr,
  de,
  it,
  ru,
  uk,
  pl,
  cs,
  nl,
  es,
  // Our sr.js translation file uses Latin script (matches the app's own
  // convention — see terms-translation-2.99.md), so this uses date-fns'
  // Latin-script Serbian locale (srLatn), not the Cyrillic `sr`.
  sr: srLatn,
  sk,
  mk,
  tr,
};

export const BCP47_LOCALES = {
  en: "en-US",
  bg: "bg-BG",
  ro: "ro-RO",
  hu: "hu-HU",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  ru: "ru-RU",
  uk: "uk-UA",
  pl: "pl-PL",
  cs: "cs-CZ",
  nl: "nl-NL",
  es: "es-ES",
  sr: "sr-Latn-RS",
  sk: "sk-SK",
  mk: "mk-MK",
  tr: "tr-TR",
};

export function getDateFnsLocale(lang) {
  return DATE_FNS_LOCALES[lang] || DATE_FNS_LOCALES.en;
}

export function getBcp47Locale(lang) {
  return BCP47_LOCALES[lang] || BCP47_LOCALES.en;
}

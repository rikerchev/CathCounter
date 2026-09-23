// v3.34 — maps a detected visitor country (ISO 3166-1 alpha-2, from
// src/lib/geo.js's IP-based detectCountry()) to one of the app's supported
// language codes (see src/lib/languages.js's DEFAULT_LANGUAGES), so a
// first-time visitor's language can default to "wherever they're logging in
// from" instead of always starting in English — see src/lib/i18n.jsx's
// LanguageProvider for where this is actually applied.
//
// Deliberately NOT exhaustive: only countries where one of our 17
// translated languages is the dominant/official language are listed. Any
// country not in this map (or one whose language we don't have a
// translation for) simply falls back to the existing default ("en") —
// never a wrong guess, just no guess.
const COUNTRY_TO_LANGUAGE = {
  BG: "bg",
  RO: "ro",
  HU: "hu",
  FR: "fr",
  DE: "de",
  AT: "de",
  CH: "de",
  IT: "it",
  RU: "ru",
  BY: "ru",
  UA: "uk",
  PL: "pl",
  CZ: "cs",
  NL: "nl",
  RS: "sr",
  ME: "sr",
  BA: "sr",
  SK: "sk",
  MK: "mk",
  TR: "tr",
  // Spanish — Spain plus the main Latin American countries.
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  PE: "es",
  CL: "es",
  VE: "es",
  EC: "es",
  GT: "es",
  CU: "es",
  BO: "es",
  DO: "es",
  HN: "es",
  PY: "es",
  SV: "es",
  NI: "es",
  CR: "es",
  PA: "es",
  UY: "es",
  PR: "es",
};

// Returns a supported language code for the given ISO country code, or
// null when the country isn't in the map (caller should keep whatever
// default it already had — never call this a "guess" the caller must use).
export function getLanguageForCountry(countryCode) {
  if (!countryCode) return null;
  return COUNTRY_TO_LANGUAGE[countryCode.toUpperCase()] || null;
}

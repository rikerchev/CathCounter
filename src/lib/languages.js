// Default built-in languages (used when no AppLanguage records exist yet)
export const DEFAULT_LANGUAGES = [
  { code: "en", name: "English", native_name: "English", is_active: true, sort_order: 0 },
  { code: "bg", name: "Bulgarian", native_name: "Български", is_active: true, sort_order: 1 },
  { code: "ro", name: "Romanian", native_name: "Română", is_active: true, sort_order: 2 },
  { code: "hu", name: "Hungarian", native_name: "Magyar", is_active: true, sort_order: 3 },
  { code: "fr", name: "French", native_name: "Français", is_active: true, sort_order: 4 },
  { code: "de", name: "German", native_name: "Deutsch", is_active: true, sort_order: 5 },
  { code: "it", name: "Italian", native_name: "Italiano", is_active: true, sort_order: 6 },
  { code: "ru", name: "Russian", native_name: "Русский", is_active: true, sort_order: 7 },
  { code: "uk", name: "Ukrainian", native_name: "Українська", is_active: true, sort_order: 8 },
  { code: "pl", name: "Polish", native_name: "Polski", is_active: true, sort_order: 9 },
  { code: "cs", name: "Czech", native_name: "Čeština", is_active: true, sort_order: 10 },
  { code: "nl", name: "Dutch", native_name: "Nederlands", is_active: true, sort_order: 11 },
  { code: "es", name: "Spanish", native_name: "Español", is_active: true, sort_order: 12 },
  { code: "sr", name: "Serbian", native_name: "Српски", is_active: true, sort_order: 13 },
  { code: "sk", name: "Slovak", native_name: "Slovenčina", is_active: true, sort_order: 14 },
  { code: "mk", name: "Macedonian", native_name: "Македонски", is_active: true, sort_order: 15 },
  { code: "tr", name: "Turkish", native_name: "Türkçe", is_active: true, sort_order: 16 },
];

export function getLanguageName(code) {
  const lang = DEFAULT_LANGUAGES.find((l) => l.code === code);
  return lang ? lang.name : code;
}

export function getLanguageNativeName(code) {
  const lang = DEFAULT_LANGUAGES.find((l) => l.code === code);
  return lang ? lang.native_name : code;
}
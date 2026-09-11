// Countries where the app's supported languages are official.
// Grouped by language for the advertiser's country selection UI.

export const COUNTRY_GROUPS = [
  {
    language: "bg",
    label: "Български",
    countries: [{ code: "BG", name: "България" }],
  },
  {
    language: "en",
    label: "English",
    countries: [
      { code: "GB", name: "Великобритания" },
      { code: "US", name: "САЩ" },
      { code: "IE", name: "Ирландия" },
      { code: "AU", name: "Австралия" },
      { code: "NZ", name: "Нова Зеландия" },
      { code: "CA", name: "Канада" },
      { code: "ZA", name: "ЮАР" },
    ],
  },
  {
    language: "ro",
    label: "Română",
    countries: [
      { code: "RO", name: "Румъния" },
      { code: "MD", name: "Молдова" },
    ],
  },
  {
    language: "hu",
    label: "Magyar",
    countries: [{ code: "HU", name: "Унгария" }],
  },
  {
    language: "fr",
    label: "Français",
    countries: [
      { code: "FR", name: "Франция" },
      { code: "BE", name: "Белгия" },
      { code: "LU", name: "Люксембург" },
      { code: "MC", name: "Монако" },
    ],
  },
  {
    language: "de",
    label: "Deutsch",
    countries: [
      { code: "DE", name: "Германия" },
      { code: "AT", name: "Австрия" },
      { code: "CH", name: "Швейцария" },
      { code: "LI", name: "Лихтенщайн" },
    ],
  },
  {
    language: "it",
    label: "Italiano",
    countries: [
      { code: "IT", name: "Италия" },
      { code: "SM", name: "Сан Марино" },
    ],
  },
  {
    language: "ru",
    label: "Русский",
    countries: [
      { code: "RU", name: "Русия" },
      { code: "BY", name: "Беларус" },
      { code: "KZ", name: "Казахстан" },
      { code: "KG", name: "Киргизстан" },
    ],
  },
  {
    language: "uk",
    label: "Українська",
    countries: [{ code: "UA", name: "Украйна" }],
  },
  {
    language: "pl",
    label: "Polski",
    countries: [{ code: "PL", name: "Полша" }],
  },
  {
    language: "cs",
    label: "Čeština",
    countries: [{ code: "CZ", name: "Чехия" }],
  },
  {
    language: "nl",
    label: "Nederlands",
    countries: [
      { code: "NL", name: "Холандия" },
      { code: "BE", name: "Белгия" },
    ],
  },
  {
    language: "es",
    label: "Español",
    countries: [
      { code: "ES", name: "Испания" },
      { code: "MX", name: "Мексико" },
      { code: "AR", name: "Аржентина" },
      { code: "CO", name: "Колумбия" },
      { code: "PE", name: "Перу" },
      { code: "VE", name: "Венецуела" },
      { code: "CL", name: "Чили" },
      { code: "EC", name: "Еквадор" },
      { code: "GT", name: "Гватемала" },
      { code: "CU", name: "Куба" },
      { code: "BO", name: "Боливия" },
      { code: "DO", name: "Доминикана" },
      { code: "HN", name: "Хондурас" },
      { code: "PY", name: "Парагвай" },
      { code: "SV", name: "Салвадор" },
      { code: "NI", name: "Никарагуа" },
      { code: "CR", name: "Коста Рика" },
      { code: "PA", name: "Панама" },
      { code: "UY", name: "Уругвай" },
      { code: "PR", name: "Пуерто Рико" },
      { code: "GQ", name: "Екваториална Гвинея" },
    ],
  },
  {
    language: "sr",
    label: "Српски",
    countries: [{ code: "RS", name: "Сърбия" }],
  },
  {
    language: "sk",
    label: "Slovenčina",
    countries: [{ code: "SK", name: "Словакия" }],
  },
  {
    language: "mk",
    label: "Македонски",
    countries: [{ code: "MK", name: "Северна Македония" }],
  },
  {
    language: "tr",
    label: "Türkçe",
    countries: [{ code: "TR", name: "Турция" }],
  },
  {
    language: "hr",
    label: "Hrvatski",
    countries: [{ code: "HR", name: "Хърватия" }],
  },
  {
    language: "sl",
    label: "Slovenščina",
    countries: [{ code: "SI", name: "Словения" }],
  },
  {
    language: "sq",
    label: "Shqip",
    countries: [
      { code: "AL", name: "Албания" },
      { code: "XK", name: "Косово" },
    ],
  },
  {
    language: "bs",
    label: "Bosanski",
    countries: [{ code: "BA", name: "Босна и Херцеговина" }],
  },
  {
    language: "cnr",
    label: "Crnogorski",
    countries: [{ code: "ME", name: "Черна гора" }],
  },
  {
    language: "el",
    label: "Ελληνικά",
    countries: [{ code: "GR", name: "Гърция" }],
  },
];

// Flatten unique countries (some appear in multiple language groups, e.g. BE, CH)
export const ALL_COUNTRIES = (() => {
  const seen = {};
  const result = [];
  for (const group of COUNTRY_GROUPS) {
    for (const c of group.countries) {
      if (!seen[c.code]) {
        seen[c.code] = true;
        result.push(c);
      }
    }
  }
  return result;
})();

export const COUNTRY_NAME_BY_CODE = (() => {
  const map = {};
  ALL_COUNTRIES.forEach((c) => { map[c.code] = c.name; });
  return map;
})();
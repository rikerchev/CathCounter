import React, { createContext, useContext, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ro } from "./translations/ro";
import { hu } from "./translations/hu";
import { fr } from "./translations/fr";
import { de } from "./translations/de";
import { it } from "./translations/it";
import { ru } from "./translations/ru";
import { uk } from "./translations/uk";
import { pl } from "./translations/pl";
import { cs } from "./translations/cs";
import { nl } from "./translations/nl";
import { es } from "./translations/es";
import { sr } from "./translations/sr";
import { sk } from "./translations/sk";
import { mk } from "./translations/mk";
import { tr } from "./translations/tr";
import { en } from "./translations/en";
import { bg } from "./translations/bg";

export const translations = {
  en,
  bg,
  ro, hu, fr, de, it, ru, uk, pl, cs, nl, es, sr, sk, mk, tr,
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem("appLang") || "en";
    } catch {
      return "en";
    }
  });
  const [dbOverrides, setDbOverrides] = useState({});
  const [appLanguages, setAppLanguages] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem("appLang", lang);
    } catch {
      // ignore
    }
  }, [lang]);

  const reloadTranslations = async () => {
    try {
      const records = await base44.entities.Translation.list("-updated_date", 500);
      const overrides = {};
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        try {
          overrides[r.key] = JSON.parse(r.values || "{}");
        } catch {
          overrides[r.key] = {};
        }
      }
      setDbOverrides(overrides);
    } catch {
      // DB not available yet — use static translations only
    }
    try {
      const langs = await base44.entities.AppLanguage.filter({ is_active: true }, "sort_order", 50);
      setAppLanguages(langs);
    } catch {
      // fall back to static language list
    }
  };

  useEffect(() => {
    reloadTranslations();
  }, []);

  const t = (key) => {
    const dbVal = dbOverrides[key]?.[lang];
    if (dbVal && dbVal.trim() && dbVal !== key) {
      return dbVal;
    }
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, appLanguages, dbOverrides, translations, reloadTranslations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSelector({ className }) {
  const { lang, setLang, appLanguages } = useLanguage();
  const langs = appLanguages && appLanguages.length > 0 ? appLanguages : DEFAULT_LANG_SELECTOR;
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value)}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 cursor-pointer min-h-[44px] ${className || ""}`}
    >
      {langs.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native_name || l.name}
        </option>
      ))}
    </select>
  );
}

const DEFAULT_LANG_SELECTOR = [
  { code: "en", name: "English", native_name: "English" },
  { code: "bg", name: "Bulgarian", native_name: "Български" },
  { code: "ro", name: "Romanian", native_name: "Română" },
  { code: "hu", name: "Hungarian", native_name: "Magyar" },
  { code: "fr", name: "French", native_name: "Français" },
  { code: "de", name: "German", native_name: "Deutsch" },
  { code: "it", name: "Italian", native_name: "Italiano" },
  { code: "ru", name: "Russian", native_name: "Русский" },
  { code: "uk", name: "Ukrainian", native_name: "Українська" },
  { code: "pl", name: "Polish", native_name: "Polski" },
  { code: "cs", name: "Czech", native_name: "Čeština" },
  { code: "nl", name: "Dutch", native_name: "Nederlands" },
  { code: "es", name: "Spanish", native_name: "Español" },
  { code: "sr", name: "Serbian", native_name: "Српски" },
  { code: "sk", name: "Slovak", native_name: "Slovenčina" },
  { code: "mk", name: "Macedonian", native_name: "Македонски" },
  { code: "tr", name: "Turkish", native_name: "Türkçe" },
];
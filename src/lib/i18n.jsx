import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getCachedCountry, detectCountry } from "./geo";
import { getLanguageForCountry } from "./countryLanguage";
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

// v3.35 — FIX for a bug in the v3.34 rollout: `appLang` gets written to
// localStorage on every render that changes `lang` (see the persistence
// effect below), including the very first one — so EVERY visitor who had
// ever loaded the app before v3.34 already had some `appLang` value sitting
// in their browser (usually "en", the old hardcoded default) that was never
// an actual choice they made. v3.34 treated "appLang is present" as "don't
// run geo-detection", which meant the new country-based default could only
// ever fire for a genuinely brand-new browser profile — which is why
// testing it by switching a VPN's exit country on an already-used browser
// kept showing English: the stored-but-never-chosen "en" blocked it every
// time. A separate flag now marks a REAL, deliberate pick (only ever set
// from LanguageSelector's onChange, see setLangExplicit below) — only that
// flag skips geo-detection; a merely-remembered `appLang` value no longer
// does.
const EXPLICIT_KEY = "appLangExplicit";

function hasExplicitLangChoice() {
  try {
    return localStorage.getItem(EXPLICIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function LanguageProvider({ children }) {
  // v3.34 — a first-time visitor (no saved "appLang" yet) now defaults to
  // the language of the COUNTRY they appear to be logging in from — most
  // visibly on the login screen, the first thing anyone unauthenticated
  // sees — instead of always starting in English. See countryLanguage.js
  // for the country→language map and geo.js for the underlying (already
  // existing, ad-targeting) IP lookup this reuses.
  //
  // Country detection is a network call, so it can't produce the very
  // first, synchronous render. For that first paint, we use whatever
  // country is already cached (getCachedCountry() — same 24h cache
  // useEligibleAds.js's country-targeted ads already populate, so a
  // returning visitor within that window gets the right language with no
  // flicker at all) and fall back to "en" only when nothing is cached yet;
  // the effect below then corrects it once the real (or freshly fetched)
  // country is known.
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem("appLang");
      if (stored) return stored;
    } catch {
      // fall through to the geo-based guess below
    }
    return getLanguageForCountry(getCachedCountry()) || "en";
  });
  const [dbOverrides, setDbOverrides] = useState({});
  const [appLanguages, setAppLanguages] = useState([]);
  // The very first guess this mount made (see useState above) — used below
  // to tell "still on our own initial guess" apart from "the person already
  // changed the language themselves while the country lookup was in
  // flight", so a slow network response can never stomp on a manual choice.
  const initialGuessRef = useRef(lang);

  useEffect(() => {
    try {
      localStorage.setItem("appLang", lang);
    } catch {
      // ignore
    }
  }, [lang]);

  // v3.34 (gate fixed in v3.36 — see EXPLICIT_KEY above) — only for a
  // visitor who never deliberately picked a language: resolve (or fetch, if
  // not already cached) their country and switch to its language once
  // known. Runs on every mount otherwise, not just "first ever visit" — a
  // returning visitor whose VPN/location changed since last time should
  // still get the right language, and detectCountry()'s own 24h cache
  // keeps that essentially free.
  useEffect(() => {
    if (hasExplicitLangChoice()) return;
    let cancelled = false;
    detectCountry().then((code) => {
      if (cancelled) return;
      const mapped = getLanguageForCountry(code);
      if (!mapped) return;
      setLang((prev) => {
        // Someone already picked a language by hand (via LanguageSelector)
        // since this component mounted — respect that over our own guess.
        if (prev !== initialGuessRef.current) return prev;
        return mapped;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // runs once per mount; re-running on every `lang` change would re-fetch
    // the (cached) country pointlessly and fight with manual selection.
  }, []);

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

  // v3.36 — the ONE place that marks a language choice as deliberate. Only
  // LanguageSelector's onChange calls this (never the geo-detection effect
  // above, which calls the plain setLang instead) — that's what lets this
  // flag actually mean "a person picked this," so future visits stop
  // re-guessing from geo once someone has.
  const setLangExplicit = (code) => {
    try {
      localStorage.setItem(EXPLICIT_KEY, "1");
    } catch {
      // ignore
    }
    setLang(code);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, setLangExplicit, t, appLanguages, dbOverrides, translations, reloadTranslations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSelector({ className }) {
  const { lang, setLangExplicit, appLanguages } = useLanguage();
  const langs = appLanguages && appLanguages.length > 0 ? appLanguages : DEFAULT_LANG_SELECTOR;
  return (
    <select
      value={lang}
      onChange={(e) => setLangExplicit(e.target.value)}
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
// Species translation utility
// Maps stored species names (in any language) back to translation keys,
// so species display correctly when the app language changes.

const SPECIES_KEYS = [
  "species.carp",
  "species.crucian",
  "species.amur",
  "species.bream",
  "species.sturgeon",
  "species.catfish",
];

// Reverse map: translated value -> key, built from all language files
import { bg } from "@/lib/translations/bg";
import { en } from "@/lib/translations/en";
import { de } from "@/lib/translations/de";
import { fr } from "@/lib/translations/fr";
import { es } from "@/lib/translations/es";
import { it } from "@/lib/translations/it";
import { ru } from "@/lib/translations/ru";
import { uk } from "@/lib/translations/uk";
import { pl } from "@/lib/translations/pl";
import { cs } from "@/lib/translations/cs";
import { nl } from "@/lib/translations/nl";
import { sr } from "@/lib/translations/sr";
import { sk } from "@/lib/translations/sk";
import { mk } from "@/lib/translations/mk";
import { ro } from "@/lib/translations/ro";
import { hu } from "@/lib/translations/hu";
import { tr } from "@/lib/translations/tr";

const ALL_LANG_MODULES = [bg, en, de, fr, es, it, ru, uk, pl, cs, nl, sr, sk, mk, ro, hu, tr];

const REVERSE_MAP = {};
for (const mod of ALL_LANG_MODULES) {
  for (const key of SPECIES_KEYS) {
    const val = mod?.[key];
    if (val && !REVERSE_MAP[val]) {
      REVERSE_MAP[val] = key;
    }
  }
}

/**
 * Translate a species name to the current language.
 * Handles both old records (stored translated text) and new records (stored key).
 * @param {string} species - The stored species value
 * @param {function} t - The translation function from useLanguage()
 * @returns {string} The translated species name
 */
export function translateSpecies(species, t) {
  if (!species) return null;
  // Already a key
  if (species.startsWith("species.")) return t(species);
  // Reverse-lookup: map stored text back to key, then translate
  const key = REVERSE_MAP[species];
  if (key) return t(key);
  // Custom species — return as-is
  return species;
}
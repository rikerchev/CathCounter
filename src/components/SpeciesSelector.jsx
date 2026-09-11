import React from "react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/i18n";

const SPECIES_KEYS = [
  "species.carp",
  "species.crucian",
  "species.amur",
  "species.bream",
  "species.sturgeon",
  "species.catfish",
];

export default function SpeciesSelector({ value, customValue, onChange, onCustomChange }) {
  const { t } = useLanguage();
  const isOther = value === "other";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {SPECIES_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(t(key))}
            className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              value === t(key)
                ? "bg-cyan-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange("other")}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full min-h-[44px] ${
          isOther
            ? "bg-cyan-600 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {t("saveCatch.otherSpecies")}
      </button>
      {isOther && (
        <Input
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={t("saveCatch.speciesPlaceholder")}
          className="h-9 text-sm"
        />
      )}
    </div>
  );
}
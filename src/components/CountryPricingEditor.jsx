import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, ChevronDown, ChevronUp } from "lucide-react";
import { COUNTRY_GROUPS, COUNTRY_NAME_BY_CODE } from "@/lib/countries";

/**
 * CountryPricingEditor — lets the admin set a monthly price per country
 * for a given ad slot. Also supports an "all countries" price.
 *
 * Props:
 *   value: string (JSON-encoded { "BG": 5.00, "all": 50.00 } or "")
 *   onChange: (jsonString) => void
 */
export default function CountryPricingEditor({ value, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [allPrice, setAllPrice] = useState("");
  const [countryPrices, setCountryPrices] = useState({});

  useEffect(() => {
    try {
      const parsed = value ? JSON.parse(value) : {};
      setAllPrice(parsed.all != null ? String(parsed.all) : "");
      const { all, ...rest } = parsed;
      setCountryPrices(rest);
    } catch {
      setAllPrice("");
      setCountryPrices({});
    }
  }, [value]);

  function commit(newAll, newPrices) {
    const merged = {};
    if (newAll !== "" && newAll != null) merged.all = parseFloat(newAll);
    for (const [code, price] of Object.entries(newPrices)) {
      if (price !== "" && price != null) merged[code] = parseFloat(price);
    }
    onChange(Object.keys(merged).length > 0 ? JSON.stringify(merged) : "");
  }

  function handleAllChange(val) {
    setAllPrice(val);
    commit(val, countryPrices);
  }

  function handleCountryPrice(code, val) {
    const next = { ...countryPrices, [code]: val };
    setCountryPrices(next);
    commit(allPrice, next);
  }

  const hasAnyPrice = allPrice !== "" || Object.values(countryPrices).some((v) => v !== "" && v != null);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-border p-3 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-sm font-medium text-slate-600 dark:text-muted-foreground min-h-[44px]"
      >
        <span className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-600" />
          Цени по държави
          {hasAnyPrice && <span className="text-xs text-emerald-600 font-normal">(зададени)</span>}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-slate-400">
            Задайте цена на месец за отделни държави. Ако държава няма цена, се ползва базовата цена на слота.
          </p>

          {/* All countries price */}
          <div>
            <Label>Цена за всички държави (€/мес)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={allPrice}
              onChange={(e) => handleAllChange(e.target.value)}
              placeholder="напр. 50.00"
              className="min-h-[44px]"
            />
          </div>

          {/* Per-country prices */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {COUNTRY_GROUPS.map((group) => (
              <div key={group.language}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{group.label}</p>
                <div className="space-y-1">
                  {group.countries.map((country) => (
                    <div key={country.code} className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 dark:text-muted-foreground flex-1 min-w-0 truncate">
                        {country.name}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={countryPrices[country.code] || ""}
                        onChange={(e) => handleCountryPrice(country.code, e.target.value)}
                        placeholder="€/мес"
                        className="w-28 min-h-[40px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
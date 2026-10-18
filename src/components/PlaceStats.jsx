import React, { useMemo, useState } from "react";
import { MapPin, ChevronDown, ChevronRight, Fish, Tag, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { translateSpecies } from "@/lib/speciesUtils";
import { placeFilterValue, spotFilterValue } from "@/lib/catchPlaces";

// v3.120 — statistics for every grouped place (usually one water body) AND for
// each of its sub-locations separately: catches, total weight, the most
// frequent species / bait / distance. "Покажи" filters the whole Statistics
// page (all charts and recommendations) down to that place or sub-location.

function top(catches, getValue) {
  const map = new Map();
  for (const c of catches) {
    const v = getValue(c);
    if (!v) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  let best = null;
  for (const [v, n] of map) if (!best || n > best[1]) best = [v, n];
  return best ? best[0] : null;
}

function summarize(catches, t) {
  return {
    count: catches.length,
    weight: catches.reduce((s, c) => s + (c.weight || 0), 0),
    species: top(catches, (c) => translateSpecies(c.species, t)),
    bait: top(catches, (c) => c.bait),
    distance: top(catches, (c) => c.distance),
  };
}

function SummaryLine({ s, t }) {
  const items = [
    { icon: Fish, label: t("stats.topSpeciesShort"), value: s.species },
    { icon: Tag, label: t("rod.bait"), value: s.bait },
    { icon: Gauge, label: t("rod.distance"), value: s.distance },
  ].filter((i) => i.value);
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 grid grid-cols-1 gap-0.5 text-xs text-slate-500">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-1.5 min-w-0">
          <Icon className="h-3 w-3 flex-shrink-0 text-slate-400" />
          <span className="text-slate-400">{label}:</span>
          <span className="truncate font-medium text-slate-600">{value}</span>
        </div>
      ))}
    </div>
  );
}

export default function PlaceStats({ catches, index, onSelect }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState({});

  const rows = useMemo(() => {
    const byPlace = new Map();
    for (const c of catches) {
      const pk = index.placeKeyOf(c);
      if (!pk) continue;
      if (!byPlace.has(pk)) byPlace.set(pk, []);
      byPlace.get(pk).push(c);
    }
    return index.places
      .filter((p) => byPlace.has(p.key))
      .map((p) => {
        const list = byPlace.get(p.key);
        const bySpot = new Map();
        for (const c of list) {
          const sk = index.spotKeyOf(c);
          if (!bySpot.has(sk)) bySpot.set(sk, []);
          bySpot.get(sk).push(c);
        }
        const spots = p.spots
          .filter((s) => bySpot.has(s.key))
          .map((s) => ({ ...s, stats: summarize(bySpot.get(s.key), t) }))
          .sort((a, b) => b.stats.count - a.stats.count);
        return { ...p, stats: summarize(list, t), spots };
      })
      .sort((a, b) => b.stats.count - a.stats.count);
  }, [catches, index, t]);

  if (rows.length === 0) return null;

  const show = (value) => {
    onSelect(value);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("stats.byPlace")}</h2>
      </div>
      <p className="text-xs text-slate-400">{t("stats.byPlaceHint")}</p>

      <div className="space-y-2">
        {rows.map((p) => {
          const multi = p.spots.length > 1;
          const open = !!expanded[p.key];
          return (
            <div key={p.key} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                {multi ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [p.key]: !e[p.key] }))}
                    className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-slate-200"
                    aria-label={p.name}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="w-7 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-semibold text-slate-800">{p.name}</h3>
                    <Button variant="outline" size="sm" className="h-7 flex-shrink-0 px-2 text-xs" onClick={() => show(placeFilterValue(p.key))}>
                      {t("stats.showStats")}
                    </Button>
                  </div>
                  <div className="text-xs text-slate-400">
                    {p.stats.count} {t("stats.catches")} · {p.stats.weight.toFixed(1)} kg
                    {multi ? ` · ${p.spots.length} ${t("stats.locations").toLowerCase()}` : ""}
                  </div>
                  <SummaryLine s={p.stats} t={t} />
                </div>
              </div>

              {multi && open && (
                <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 pl-9">
                  {p.spots.map((s) => (
                    <div key={s.key || "__unnamed"} className="rounded-lg bg-white p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium text-slate-700">{s.name}</div>
                        <Button variant="outline" size="sm" className="h-7 flex-shrink-0 px-2 text-xs" onClick={() => show(spotFilterValue(p.key, s.key))}>
                          {t("stats.showStats")}
                        </Button>
                      </div>
                      <div className="text-xs text-slate-400">
                        {s.stats.count} {t("stats.catches")} · {s.stats.weight.toFixed(1)} kg
                      </div>
                      <SummaryLine s={s.stats} t={t} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

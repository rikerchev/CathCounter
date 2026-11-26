import React, { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import Weather48Chart, { seriesColor, useIsDark } from "@/components/Weather48Chart";

// v3.174 — smart fish-activity advice cards for the live session (see
// src/lib/fishActivity.js for the rules and ActiveSession.jsx for when they
// appear): session start, a drastic weather change after a landed fish, and
// 10 casts without a catch.
// v3.176 — one integrated analysis (temperature -> pressure -> wind) with ONE
// recommendation; the three readings are tappable chips that open a 48 h chart.

const LEVEL_STYLE = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  good: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function FishAdvice({ items, onDismiss, lat, lng }) {
  const { t } = useLanguage();
  const dark = useIsDark();
  // which element's chart is open, per card: { [cardId]: "temp" | "press" | "wind" }
  const [open, setOpen] = useState({});
  // v3.186 — a card is read once and closed, so it is always shown in full (the
  // v3.185 collapsed mode is gone); the chips still open the 48 h chart.
  if (!items || items.length === 0) return null;

  const toggle = (cardId, id) => setOpen((s) => ({ ...s, [cardId]: s[cardId] === id ? null : id }));

  return (
    <div className="space-y-2">
      {items.map((a) => {
        // cards saved by v3.174/175 have plain-string lines, no chips and "action"
        const lines = (a.lines || []).map((l) => (typeof l === "string" ? { id: null, text: l } : l));
        const chips = a.chips || [];
        const conclusion = a.conclusion || a.action;
        const sel = open[a.id] || null;
        return (
          <div key={a.id} className="rounded-xl bg-white dark:bg-card border border-cyan-100 dark:border-border shadow-sm px-3 py-2 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
                <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800 dark:text-foreground">{t("fa.title." + a.kind)}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_STYLE[a.level] || ""}`}>{a.activity}</span>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(a.id)}
                aria-label={t("fa.dismiss")}
                className="p-1 -m-1 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {chips.length > 0 ? (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(a.id, c.id)}
                      aria-pressed={sel === c.id}
                      style={{ borderColor: seriesColor(c.id, dark), color: seriesColor(c.id, dark) }}
                      className={`text-xs px-2.5 py-1 rounded-full border min-h-[32px] ${sel === c.id ? "bg-slate-100 dark:bg-accent font-semibold" : "bg-white dark:bg-card"}`}
                    >
                      {c.text}
                    </button>
                  ))}
                </div>
                {!sel && <p className="text-[11px] text-slate-500 dark:text-muted-foreground mt-1">{t("fa.chart.hint")}</p>}
              </div>
            ) : (
              a.now && <p className="text-xs text-slate-500 dark:text-muted-foreground">{a.now}</p>
            )}

            {sel && (
              <div className="space-y-1">
                <Weather48Chart sel={sel} lat={lat} lng={lng} />
                <button type="button" onClick={() => toggle(a.id, sel)} className="text-xs text-slate-500 dark:text-muted-foreground underline">
                  {t("fa.chart.hide")}
                </button>
              </div>
            )}

            {a.intro && <p className="text-sm text-slate-600 dark:text-muted-foreground">{a.intro}</p>}

            {a.changes && a.changes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground mb-0.5">{t("fa.whatChanged")}</p>
                <ul className="text-sm text-slate-700 dark:text-foreground space-y-0.5 list-disc pl-4">
                  {a.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {a.noChange && <p className="text-sm text-slate-700 dark:text-foreground">{a.noChange}</p>}

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{t("fa.h.analysis")}</p>
              {lines.map((l, i) => (
                <div key={i} className="text-sm text-slate-700 dark:text-foreground">
                  {l.id && (
                    <button
                      type="button"
                      onClick={() => toggle(a.id, l.id)}
                      style={{ color: seriesColor(l.id, dark) }}
                      className="text-xs font-semibold block text-left"
                    >
                      {i + 1}. {t("fa.h." + l.id)}
                    </button>
                  )}
                  <p>{l.text}</p>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg px-3 py-2">{conclusion}</p>
          </div>
        );
      })}
    </div>
  );
}

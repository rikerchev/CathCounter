import React, { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

// v3.174 — smart fish-activity advice cards for the live session (see
// src/lib/fishActivity.js for the rules and ActiveSession.jsx for when they
// appear): session start, a drastic weather change after a landed fish, and
// 10 casts without a catch.

const LEVEL_STYLE = {
  high: "bg-emerald-100 text-emerald-800",
  good: "bg-lime-100 text-lime-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-rose-100 text-rose-800",
};

function WaterInput({ onSave }) {
  const { t } = useLanguage();
  const [v, setV] = useState("");
  const save = () => {
    const n = parseFloat(v);
    if (Number.isNaN(n)) return;
    onSave(n);
    setV("");
  };
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
      <span className="text-xs text-slate-500">{t("fa.waterManual")}</span>
      <input
        type="number"
        step="0.5"
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-16 h-8 text-sm border border-slate-200 rounded-md px-2"
      />
      <button
        type="button"
        onClick={save}
        disabled={v === ""}
        className="text-xs px-2 h-8 rounded-md bg-cyan-600 text-white disabled:opacity-40"
      >
        {t("fa.waterSave")}
      </button>
    </div>
  );
}

export default function FishAdvice({ items, onDismiss, onWaterTemp }) {
  const { t } = useLanguage();
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <div key={a.id} className="rounded-2xl bg-white border border-cyan-100 shadow-sm p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-slate-800">{t("fa.title." + a.kind)}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(a.id)}
              aria-label={t("fa.dismiss")}
              className="p-1 -m-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_STYLE[a.level] || ""}`}>
              {a.activity}
            </span>
          </div>
          {a.now && <p className="text-xs text-slate-400">{a.now}</p>}
          {a.intro && <p className="text-sm text-slate-600">{a.intro}</p>}

          {a.changes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-0.5">{t("fa.whatChanged")}</p>
              <ul className="text-sm text-slate-700 space-y-0.5 list-disc pl-4">
                {a.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {a.noChange && <p className="text-sm text-slate-700">{a.noChange}</p>}

          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">{t("fa.where")}</p>
            <ul className="text-sm text-slate-700 space-y-1 list-disc pl-4">
              {a.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>

          <p className="text-sm font-medium text-cyan-800 bg-cyan-50 rounded-lg px-3 py-2">{a.action}</p>

          {a.kind === "start" && <WaterInput onSave={onWaterTemp} />}
        </div>
      ))}
    </div>
  );
}

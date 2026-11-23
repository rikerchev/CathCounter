import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { hasRole } from "@/lib/roles";
import { useLanguage } from "@/lib/i18n";
import { Eye, Users, Loader2 } from "lucide-react";
import { getLanguageNativeName } from "@/lib/languages";

// v3.164 — own, cookieless statistics of the public (static) pages:
// /ribolovno-prilozhenie and the other marketing pages in every language.
// Data comes from /api/analytics/summary (server/routes/analytics.ts).

const PERIODS = [
  { value: 7, label: "7 дни" },
  { value: 30, label: "30 дни" },
  { value: 90, label: "3 месеца" },
  { value: 365, label: "1 година" },
];

const DEVICE_LABELS = { mobile: "Телефон", tablet: "Таблет", desktop: "Компютър", other: "Друго" };

function Card({ title, children }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      {children}
    </div>
  );
}

function Table({ rows, labelOf, empty = "Все още няма данни" }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-slate-400">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <div className="space-y-1.5">
      <div className="flex text-[11px] text-slate-400 gap-2">
        <span className="flex-1" />
        <span className="w-14 text-right">Прегледи</span>
        <span className="w-14 text-right">Посетители</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="relative rounded-md overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-sky-100 dark:bg-sky-900/30" style={{ width: `${(r.views / max) * 100}%` }} />
          <div className="relative flex items-center gap-2 px-2 py-1 text-xs">
            <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">{labelOf(r.key)}</span>
            <span className="w-14 text-right font-medium">{r.views}</span>
            <span className="w-14 text-right text-slate-500">{r.visitors}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ daily }) {
  if (!daily || daily.length === 0) return <p className="text-xs text-slate-400">Все още няма данни</p>;
  const max = Math.max(1, ...daily.map((d) => d.views));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-28">
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.views} прегледа, ${d.visitors} посетители`}
            className="flex-1 min-w-[2px] bg-sky-500 rounded-t-sm"
            style={{ height: `${Math.max(3, (d.views / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{daily[0].day}</span>
        <span>{daily[daily.length - 1].day}</span>
      </div>
    </div>
  );
}

export default function AdminTraffic() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isAdmin = !user || hasRole(user, "admin");

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    base44.analytics
      .summary(days)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Грешка при зареждане"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("menuGroup.noAccess")}</p>
      </div>
    );
  }

  const pageLabel = (p) => (p === "/" ? "/ (начална)" : p);
  const langLabel = (c) => `${getLanguageNativeName(c) || c} (${c})`;
  const refLabel = (h) => (h ? h : "Директно / без източник");
  const countryLabel = (c) => {
    if (!c) return "Неизвестна";
    try {
      return new Intl.DisplayNames(["bg"], { type: "region" }).of(c) || c;
    } catch {
      return c;
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Посещаемост на сайта</h1>
        <p className="text-xs text-slate-500 mt-1">
          Публичните страници (/ribolovno-prilozhenie и подстраниците, всички езици). Без бисквитки и без
          запазване на IP адреси. „Посетители“ се броят по дни (един и същ човек в различни дни се брои повторно).
          Броенето започва от внедряването на v3.164.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setDays(p.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              days === p.value
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-white dark:bg-card text-slate-600 dark:text-slate-300 border-slate-200 dark:border-border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}
      {error && !loading && <p className="text-sm text-red-500">{error}</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Eye className="w-3.5 h-3.5" /> Прегледи</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{data.totals.views}</div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Users className="w-3.5 h-3.5" /> Посетители</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{data.totals.visitors}</div>
            </div>
          </div>

          <Card title="По дни"><DailyChart daily={data.daily} /></Card>
          <Card title="Страници"><Table rows={data.pages} labelOf={pageLabel} /></Card>
          <Card title="Езици на страниците"><Table rows={data.langs} labelOf={langLabel} /></Card>
          <Card title="Откъде идват"><Table rows={data.referrers} labelOf={refLabel} /></Card>
          <Card title="Държави"><Table rows={data.countries} labelOf={countryLabel} /></Card>
          <Card title="Устройства"><Table rows={data.devices} labelOf={(d) => DEVICE_LABELS[d] || d} /></Card>
        </>
      )}
    </div>
  );
}

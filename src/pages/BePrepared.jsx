import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { bg, cs, de, enGB, es, fr, hu, it, mk, nl, pl, ro, ru, sk, srLatn, tr, uk } from "date-fns/locale";
import {
  Loader2, CalendarDays, Search, LocateFixed, Save, Trash2, FolderOpen, Thermometer, Gauge, Wind, MapPin, ClipboardCheck,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCurrentLocation, lookupPlaceName } from "@/lib/geolocation";
import { searchPlaces } from "@/lib/placeSearch";
import {
  PERIODS, PLAN_DAYS, fetchForecast, forecastRange, buildPlan, describePeriod, ymd, fromYmd, readPlans, savePlan, deletePlan,
} from "@/lib/fishingPlan";

// v3.194 — "Бъди подготвен": pick a day (up to 16 days ahead) and a place on the
// map (the current location by default, or an address) and get an advice for
// each of six periods of the day, from the same analysis as the live advice but
// on the weather FORECAST. Separate from the advice of the active session.

const DATE_LOCALES = { bg, cs, de, en: enGB, es, fr, hu, it, mk, nl, pl, ro, ru, sk, sr: srLatn, tr, uk };
const DEFAULT_CENTER = [42.7, 25.3]; // Bulgaria, used until a place is chosen
const CHIP_ICON = { temp: Thermometer, press: Gauge, wind: Wind };

const LEVEL_STYLE = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  good: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#0891b2;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);transform:rotate(-45deg);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const hh = (n) => String(n % 24).padStart(2, "0") + ":00";

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], Math.max(map.getZoom(), 11));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when `target` (a new object per request) changes
  }, [target]);
  return null;
}

export default function BePrepared() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const uid = user?.id || "";

  const [pos, setPos] = useState(null); // { lat, lng, name }
  const [fly, setFly] = useState(null); // asks the map to centre on a place
  const [locating, setLocating] = useState(true);
  const [dateStr, setDateStr] = useState(ymd(new Date()));
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = no search yet
  const [searching, setSearching] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [plans, setPlans] = useState(() => readPlans(uid));
  const nameReq = useRef(0);

  const dateLocale = DATE_LOCALES[lang] || enGB;

  // name of the picked place (reverse geocoding), without blocking the forecast
  const nameFor = useCallback(
    async (lat, lng) => {
      const req = ++nameReq.current;
      let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const r = await lookupPlaceName(lat, lng, lang);
        if (r.status === "ok" && r.name) name = r.name;
      } catch {
        // keep the coordinates
      }
      if (req === nameReq.current) setPos((p) => (p && p.lat === lat && p.lng === lng ? { ...p, name } : p));
    },
    [lang]
  );

  const pick = useCallback(
    (lat, lng, name, flyTo) => {
      setPos({ lat, lng, name: name || `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
      if (flyTo) setFly({ lat, lng });
      if (!name) nameFor(lat, lng);
    },
    [nameFor]
  );

  // the current location is the default place
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loc = await getCurrentLocation(lang, false);
        if (!cancelled && loc && Number.isFinite(loc.latitude)) pick(loc.latitude, loc.longitude, loc.name, true);
      } catch {
        // no permission / no GPS: the angler picks a place on the map
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const loc = await getCurrentLocation(lang, false);
      pick(loc.latitude, loc.longitude, loc.name, true);
    } catch {
      toast({ title: t("plan.noLocation"), variant: "destructive" });
    } finally {
      setLocating(false);
    }
  };

  // the forecast of the picked place (one request; the day is then chosen locally)
  const loadForecast = useCallback(async (lat, lng) => {
    setLoading(true);
    setError("");
    try {
      setForecast(await fetchForecast(lat, lng));
    } catch {
      setForecast(null);
      setError(t("plan.error"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes with the language only
  }, []);

  useEffect(() => {
    if (!pos) return undefined;
    const id = setTimeout(() => loadForecast(pos.lat, pos.lng), 400);
    return () => clearTimeout(id);
  }, [pos?.lat, pos?.lng, loadForecast]);

  const range = useMemo(() => (forecast ? forecastRange(forecast) : null), [forecast]);

  // keep the chosen day inside the forecast
  useEffect(() => {
    if (!range) return;
    if (dateStr < range.today) setDateStr(range.today);
    else if (dateStr > range.max) setDateStr(range.max);
  }, [range, dateStr]);

  const plan = useMemo(() => (forecast ? buildPlan({ forecast, dateStr }) : null), [forecast, dateStr]);

  const minStr = range ? range.today : ymd(new Date());
  const maxStr = range ? range.max : ymd(new Date(Date.now() + (PLAN_DAYS - 1) * 86400000));
  const selected = fromYmd(dateStr);
  const dateLabel = format(selected, "PPPP", { locale: dateLocale });

  const doSearch = async (e) => {
    e?.preventDefault?.();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(query, lang));
    } catch {
      setResults([]);
      toast({ title: t("plan.searchError"), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const choose = (r) => {
    pick(r.lat, r.lng, r.name, true);
    setResults(null);
    setQuery("");
  };

  const onSave = () => {
    if (!pos) return;
    setPlans(savePlan(uid, { date: dateStr, lat: pos.lat, lng: pos.lng, name: pos.name }));
    toast({ title: t("plan.savedToast") });
  };
  const onOpen = (p) => {
    setDateStr(p.date);
    pick(p.lat, p.lng, p.name, true);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  const onDelete = (id) => setPlans(deletePlan(uid, id));

  const today = ymd(new Date());

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-cyan-600" />
          {t("nav.beReady")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("plan.subtitle")}</p>
      </div>

      {/* date */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{t("plan.date")}</p>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 h-10 text-left text-sm shadow-sm"
            >
              <CalendarDays className="h-4 w-4 flex-shrink-0 text-cyan-600" />
              <span className="truncate first-letter:uppercase">{dateLabel}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={dateLocale}
              weekStartsOn={1}
              selected={selected}
              defaultMonth={selected}
              onSelect={(d) => {
                if (d) {
                  setDateStr(ymd(d));
                  setCalOpen(false);
                }
              }}
              disabled={(d) => {
                const s = ymd(d);
                return s < minStr || s > maxStr;
              }}
            />
            <p className="px-3 pb-3 text-[11px] text-slate-500 dark:text-muted-foreground">{t("plan.limit").replace("{n}", String(PLAN_DAYS))}</p>
          </PopoverContent>
        </Popover>
      </div>

      {/* place: search + map */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{t("plan.location")}</p>
        <form onSubmit={doSearch} className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("plan.searchPh")} className="h-10 text-sm" />
          <Button type="submit" variant="outline" className="h-10 px-3" disabled={searching} aria-label={t("plan.search")}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
          <Button type="button" variant="outline" className="h-10 px-3" onClick={useMyLocation} disabled={locating} aria-label={t("plan.myLocation")} title={t("plan.myLocation")}>
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
          </Button>
        </form>

        {results && (
          <div className="rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card divide-y divide-slate-100 dark:divide-border">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500 dark:text-muted-foreground">{t("plan.noResults")}</p>
            ) : (
              results.map((r, i) => (
                <button key={i} type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-accent min-h-[40px]">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-cyan-600" />
                  <span>{r.name}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-border" style={{ isolation: "isolate" }}>
          <MapContainer center={pos ? [pos.lat, pos.lng] : DEFAULT_CENTER} zoom={pos ? 12 : 7} scrollWheelZoom={false} style={{ height: "240px", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <ClickToPick onPick={(la, ln) => pick(la, ln, null, false)} />
            <FlyTo target={fly} />
            {pos && (
              <Marker
                position={[pos.lat, pos.lng]}
                icon={pinIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = e.target.getLatLng();
                    pick(ll.lat, ll.lng, null, false);
                  },
                }}
              />
            )}
          </MapContainer>
          <div className="bg-slate-50 dark:bg-card px-3 py-1.5 text-xs text-slate-600 dark:text-muted-foreground">
            {pos ? pos.name : locating ? t("plan.locating") : t("plan.mapHint")}
          </div>
        </div>
      </div>

      {/* result */}
      {!pos ? (
        <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("plan.pickPlace")}</p>
      ) : loading && !plan ? (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          {t("plan.loading")}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-900 px-3 py-3 space-y-2">
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}</p>
          <Button type="button" variant="outline" className="h-9" onClick={() => loadForecast(pos.lat, pos.lng)}>
            {t("plan.retry")}
          </Button>
        </div>
      ) : plan ? (
        <div className="space-y-3">
          {/* summary of the day */}
          <div className="rounded-xl bg-white dark:bg-card border border-cyan-100 dark:border-border shadow-sm px-3 py-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-foreground first-letter:uppercase">{dateLabel}</p>
              <Button type="button" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={onSave}>
                <Save className="w-3.5 h-3.5" />
                {t("plan.save")}
              </Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground">{pos.name}</p>
            {plan.water != null && (
              <p className="text-xs text-slate-600 dark:text-muted-foreground">{t("plan.water").replace("{w}", String(plan.water).replace(".", t("fa.dec") === "fa.dec" ? "." : t("fa.dec")))}</p>
            )}
            <p className="text-[13px] leading-snug font-medium text-cyan-800 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg px-3 py-1.5">
              {plan.best.length === 0
                ? t("plan.allPassed")
                : plan.bestLevel === "low"
                  ? t("plan.weak")
                  : t("plan.best").replace("{list}", plan.best.map((id) => t("plan.p." + id)).join(", "))}
            </p>
            {plan.daysAhead > 7 && <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("plan.far")}</p>}
          </div>

          {/* the six periods */}
          {plan.periods.map((p) => {
            if (p.unavailable) return null;
            const d = describePeriod(p, t);
            const isBest = plan.best.includes(p.id) && plan.bestLevel !== "low";
            return (
              <div
                key={p.id}
                className={`rounded-xl border bg-white dark:bg-card px-3 py-2 space-y-1.5 ${p.passed ? "opacity-60" : ""} ${
                  isBest ? "border-emerald-300 dark:border-emerald-700" : "border-slate-200 dark:border-border"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-800 dark:text-foreground">{t("plan.p." + p.id)}</span>
                  <span className="text-xs text-slate-500 dark:text-muted-foreground">
                    {hh(p.from)}–{hh(p.to)}
                  </span>
                  {p.current && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">{t("plan.now")}</span>}
                  {p.passed && <span className="text-[11px] text-slate-500">{t("plan.passed")}</span>}
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_STYLE[p.level] || ""}`}>{d.badge}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.chips.map((c) => {
                    const Icon = CHIP_ICON[c.id];
                    return (
                      <span key={c.id} className="inline-flex items-center gap-1 text-[11px] leading-none px-2 py-1 rounded-full border border-slate-200 dark:border-border text-slate-600 dark:text-muted-foreground">
                        {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
                        {c.text}
                      </span>
                    );
                  })}
                </div>
                <p className="text-[13px] leading-snug font-medium text-cyan-800 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg px-3 py-1.5">{d.rec}</p>
                <p className="text-xs text-slate-600 dark:text-muted-foreground">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">{t("fa.w.h.relief")}: </span>
                  {d.rel}
                </p>
                <p className="text-xs text-slate-600 dark:text-muted-foreground">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">{t("fa.w.h.bottom")}: </span>
                  {d.bot}
                </p>
              </div>
            );
          })}

          {/* general guidance for the day */}
          <div className="rounded-xl border border-slate-200 dark:border-border bg-slate-50/60 dark:bg-muted/20 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{t("plan.general")}</p>
            {plan.season && (
              <div className="text-xs text-slate-700 dark:text-foreground">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">{t("fa.w.h.time")}</p>
                <p>{t("fa.w.time." + plan.season)}</p>
              </div>
            )}
            <div className="text-xs text-slate-700 dark:text-foreground">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">{t("fa.w.h.edge")}</p>
              <p>{t("fa.w.edge")}</p>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{t("fa.w.note")}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("plan.noForecast")}</p>
      )}

      {/* saved plans */}
      <div className="space-y-2 pt-2">
        <p className="text-sm font-semibold text-slate-800 dark:text-foreground">{t("plan.myPlans")}</p>
        {plans.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-muted-foreground">{t("plan.noPlans")}</p>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card divide-y divide-slate-100 dark:divide-border">
            {plans.map((p) => {
              const past = p.date < today;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-foreground truncate first-letter:uppercase">{format(fromYmd(p.date), "PPP", { locale: dateLocale })}</p>
                    <p className="text-xs text-slate-500 dark:text-muted-foreground truncate">{past ? `${t("plan.past")} · ` : ""}{p.name}</p>
                  </div>
                  {!past && (
                    <Button type="button" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={() => onOpen(p)}>
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t("plan.open")}
                    </Button>
                  )}
                  <button type="button" onClick={() => onDelete(p.id)} aria-label={t("plan.delete")} className="p-2 -mr-1 text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{t("plan.localNote")}</p>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Trophy, Calendar, Users, Medal, CheckCircle2, Clock, Send, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import CompetitionCalendar from "@/components/CompetitionCalendar";
import { ALL_COUNTRIES } from "@/lib/countries";
import { Filter } from "lucide-react";
import {
  parseCatchResults, totalCatchWeight, hasAnyResult, rankByPenaltyAndWeight,
} from "@/lib/competitionResults";
import { downloadStandingsImage, downloadParticipantsImage } from "@/lib/standingsImage";

// v2.83 — fishing_type used to be a fixed enum; competition creation now
// takes free text instead (see WaterBodyManagement.jsx). Old competitions
// still hold one of these six values, so they're translated as before;
// anything else (new, free-typed) is shown as-is.
const FISHING_TYPE_KEYS = ["feeder", "float", "carp", "predator", "match", "other"];

function fishingTypeLabel(value, t) {
  if (!value) return "";
  return FISHING_TYPE_KEYS.includes(value) ? t("fishing." + value) : value;
}

function formatDate(d, lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Competitions() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [searchParams] = useSearchParams();
  const waterBodyFilter = searchParams.get("water_body");
  const [competitions, setCompetitions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registerFor, setRegisterFor] = useState(null);
  const [regName, setRegName] = useState(user?.full_name || "");
  const [regPhone, setRegPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notifying, setNotifying] = useState(null);
  const [waterBodies, setWaterBodies] = useState([]);
  const [filterCountry, setFilterCountry] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const country = user?.country || "";
  const navigate = useNavigate();
  const highlightComp = searchParams.get("comp");
  // v2.90 — catch-weight entry moved entirely to the organizer/admin side
  // (WaterBodyManagement.jsx) — a registrant no longer enters their own
  // results here, only sees them (see the myRegs badges below) once the
  // organizer records them. standingsFor is the competition currently
  // showing its standings dialog (all-registrations, read-only).
  const [standingsFor, setStandingsFor] = useState(null);
  // v2.89 — backs the "Изтегли като снимка" button in the standings dialog.
  // v2.92 — the download itself draws its own canvas now (see
  // src/lib/standingsImage.js), so this just tracks the button's busy state.
  const [generatingImage, setGeneratingImage] = useState(false);
  // v2.94 — separate busy flag for the "Списък участници" card button
  // (see handleDownloadParticipantsImage below), independent of
  // generatingImage so the two download buttons never share a spinner.
  const [generatingParticipantsImage, setGeneratingParticipantsImage] = useState(false);

  const load = useCallback(async () => {
    try {
      const [all, regs, allWb] = await Promise.all([
        base44.entities.Competition.list("-date", 100),
        base44.entities.CompetitionRegistration.list(),
        base44.entities.WaterBody.list(),
      ]);
      setRegistrations(regs || []);
      setWaterBodies(allWb || []);

      // v2.89 — a CLOSED competition (registration ended — typically once
      // the event itself already happened, which is exactly when weigh-in
      // results start being entered) used to disappear from this page
      // entirely, taking its standings with it. Now it stays reachable
      // here for anyone who registered a participant in it, or once it
      // actually has a recorded result — an old closed competition nobody
      // registered for and that never got any results still stays hidden,
      // so this list doesn't fill up with dead entries.
      let filtered = (all || []).filter((c) => {
        if (c.status === "open") return true;
        if (c.status === "closed") {
          const compRegs = (regs || []).filter((r) => r.competition_id === c.id && r.status === "active");
          const isMine = compRegs.some((r) => r.created_by_id === user?.id);
          const hasResults = compRegs.some((r) => hasAnyResult(parseCatchResults(r.catch_results)));
          return isMine || hasResults;
        }
        return false;
      });
      if (waterBodyFilter) filtered = filtered.filter((c) => c.water_body_id === waterBodyFilter);
      setCompetitions(filtered);
    } catch (e) {
      toast({ title: t("wb.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, waterBodyFilter, t, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function countsFor(compId) {
    const regs = registrations.filter((r) => r.competition_id === compId && r.status === "active");
    return {
      main: regs.filter((r) => r.slot_type === "main").length,
      reserve: regs.filter((r) => r.slot_type === "reserve").length,
    };
  }

  // v2.86 — was myRegistration() (singular, .find()): one account could only
  // ever have ONE active registration per competition, because as soon as it
  // existed the whole "register" button was replaced by the "you're
  // registered" view. Now returns ALL of the account's active registrations
  // for a competition, so someone can register several participants (e.g.
  // themselves plus family/friends) from the same account — see the render
  // below, which lists every one of them and keeps offering a "register
  // another participant" button as long as there's room.
  function myRegistrations(compId) {
    return registrations.filter((r) => r.competition_id === compId && r.created_by_id === user?.id && r.status === "active");
  }

  // v2.87 — every active registration for a competition (not just the
  // current account's own), used to compute standings across everyone.
  function regsFor(compId) {
    return registrations.filter((r) => r.competition_id === compId && r.status === "active");
  }

  async function handleRegister() {
    if (!registerFor) return;
    if (!regName.trim()) {
      toast({ title: t("comp.enterName"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const counts = countsFor(registerFor.id);
      const isMainFull = counts.main >= registerFor.max_participants;
      const isReserveFull = counts.reserve >= registerFor.max_reserves;
      if (isMainFull && isReserveFull) {
        toast({ title: t("comp.noFreeSlots"), variant: "destructive" });
        setSubmitting(false);
        return;
      }
      const slotType = isMainFull ? "reserve" : "main";
      // v2.79 — competition entry-fee payment (Revolut) is paused for now,
      // same treatment SectorReservations.jsx got in v2.77: no in-app payment
      // step, `fee` on the competition is purely an informational price the
      // organizer collects in person. `payment_status: "pending"` is kept on
      // the row (still permanently inert, nothing ever flips it to "paid"
      // from here anymore) so re-enabling this later doesn't need a schema
      // change — see markPaid()/showPayment, removed below in this version.
      //
      // v2.80 — regName is a free-typed name (someone can register a family
      // member/friend under a different name than their own account), so
      // registered_by_email snapshots the actually-logged-in account's email
      // alongside it. The organizer's participant list (WaterBodyManagement.jsx)
      // shows both, so a registration can always be traced back to a real
      // account even when the entered name isn't the account holder's own.
      await base44.entities.CompetitionRegistration.create({
        competition_id: registerFor.id,
        participant_name: regName,
        participant_phone: regPhone,
        slot_type: slotType,
        registered_by_email: user?.email || null,
        payment_status: "pending",
        status: "active",
      });
      toast({
        title: slotType === "main" ? t("comp.registeredAsMainToast") : t("comp.registeredAsReserveToast"),
        description: `${t("comp.registerFor")} „${registerFor.title}“`,
      });
      setRegisterFor(null);
      setRegPhone("");
      await load();
    } catch (e) {
      toast({ title: t("comp.errorRegistering"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNotify(comp) {
    setNotifying(comp.id);
    try {
      const res = await base44.functions.invoke("notify-competition-users", { competition_id: comp.id });
      toast({
        title: `${t("comp.notifiedUsers")} ${res.data.notified} ${t("comp.users")}`,
        description: res.data.country === "all" ? t("comp.allCountriesLabel") : res.data.country,
      });
    } catch (e) {
      toast({ title: t("comp.errorNotifying"), description: e.message, variant: "destructive" });
    } finally {
      setNotifying(null);
    }
  }

  async function cancelRegistration(reg) {
    try {
      await base44.entities.CompetitionRegistration.update(reg.id, { status: "cancelled" });
      toast({ title: t("comp.unregistered") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    }
  }

  // v2.89 — "generate on request" image export for the standings dialog,
  // nothing pre-rendered or stored anywhere. v2.91/v2.92 — now drawn
  // entirely by the shared src/lib/standingsImage.js (own canvas rendering
  // of the ranked list, the water body's REAL brochure embedded unchanged
  // at the bottom) instead of an html2canvas screenshot of the dialog — see
  // that module's own comment for the full design rationale. Same shared
  // function as WaterBodyManagement.jsx's handleDownloadStandingsImage.
  async function handleDownloadStandingsImage(comp) {
    setGeneratingImage(true);
    try {
      const roundsCount = Math.max(1, comp.rounds_count || 1);
      await downloadStandingsImage({
        ranked: rankByPenaltyAndWeight(regsFor(comp.id), roundsCount),
        title: comp.title,
        competition: comp,
        waterBody: waterBodies.find((w) => w.id === comp.water_body_id),
        filename: `klasirane-${(comp.title || "sastezanie").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.png`,
        t,
        lang,
      });
    } catch (e) {
      toast({ title: t("comp.errorGeneratingImage"), description: e.message, variant: "destructive" });
    } finally {
      setGeneratingImage(false);
    }
  }

  // v2.94 — "who's registered so far" image, downloadable during
  // registration (independent of whether there's a draw or any results
  // yet — unlike the standings button above, which only shows once
  // standings.length > 0) so anyone browsing this competition can see how
  // many people have signed up and share the image, together with the
  // water body's own brochure, to help promote the competition and the
  // app. Same shared canvas renderer as handleDownloadStandingsImage (see
  // standingsImage.js) and the same function WaterBodyManagement.jsx uses.
  async function handleDownloadParticipantsImage(comp) {
    setGeneratingParticipantsImage(true);
    try {
      await downloadParticipantsImage({
        registrations: regsFor(comp.id),
        title: comp.title,
        competition: comp,
        waterBody: waterBodies.find((w) => w.id === comp.water_body_id),
        filename: `uchastnici-${(comp.title || "sastezanie").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.png`,
        t,
        lang,
      });
    } catch (e) {
      toast({ title: t("comp.errorGeneratingImage"), description: e.message, variant: "destructive" });
    } finally {
      setGeneratingParticipantsImage(false);
    }
  }

  const compWbIds = {};
  competitions.forEach((c) => { if (c.water_body_id) compWbIds[c.water_body_id] = true; });

  const countriesWithComps = {};
  const regionsByCountry = {};
  waterBodies.forEach((wb) => {
    if (!compWbIds[wb.id]) return;
    if (wb.country) {
      countriesWithComps[wb.country] = true;
      if (wb.region) {
        if (!regionsByCountry[wb.country]) regionsByCountry[wb.country] = {};
        regionsByCountry[wb.country][wb.region] = true;
      }
    }
  });

  const availableCountries = ALL_COUNTRIES.filter((c) => countriesWithComps[c.code]);

  const filteredByLocation = competitions.filter((c) => {
    if (!filterCountry && !filterRegion) return true;
    const wb = waterBodies.find((w) => w.id === c.water_body_id);
    if (!wb) return false;
    if (filterCountry && wb.country !== filterCountry) return false;
    if (filterRegion && wb.region !== filterRegion) return false;
    return true;
  });

  const availableRegions = filterCountry && regionsByCountry[filterCountry]
    ? Object.keys(regionsByCountry[filterCountry]).sort()
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="w-6 h-6 text-amber-500" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("comp.title")}</h1>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 shadow-sm space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-muted-foreground">
          <Filter className="w-3.5 h-3.5" /> {t("comp.filterByLocation")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterCountry}
            onChange={(e) => { setFilterCountry(e.target.value); setFilterRegion(""); }}
            className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-card dark:text-foreground"
          >
            <option value="">{t("comp.allCountries")}</option>
            {availableCountries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            disabled={!filterCountry}
            className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 dark:bg-card dark:text-foreground"
          >
            <option value="">{t("comp.allRegions")}</option>
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        {(filterCountry || filterRegion) && (
          <button
            onClick={() => { setFilterCountry(""); setFilterRegion(""); }}
            className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
          >
            {t("comp.clearFilter")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <CompetitionCalendar competitions={filteredByLocation} />
          {filteredByLocation.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">{t("comp.noActiveCompetitions")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredByLocation.map((c) => {
                const counts = countsFor(c.id);
                const mainFull = counts.main >= c.max_participants;
                const reserveFull = counts.reserve >= c.max_reserves;
                const allFull = mainFull && reserveFull;
                const myRegs = myRegistrations(c.id);
                const roundsCount = Math.max(1, c.rounds_count || 1);
                // v2.89 — ranked by sector penalty points first (fewer is
                // better), total catch weight only the tie-break — see
                // rankByPenaltyAndWeight. rankedMap looks a single
                // registration's own placing up for the myRegs badges below.
                const regsForComp = regsFor(c.id);
                const standings = rankByPenaltyAndWeight(regsForComp, roundsCount);
                const rankedMap = new Map(standings.map((x) => [x.id, x]));
                return (
                  <div key={c.id} className={`rounded-2xl bg-white border p-4 shadow-sm transition-all ${highlightComp === c.id ? "border-cyan-400 ring-2 ring-cyan-200 dark:bg-card dark:border-cyan-500" : "border-slate-100 dark:bg-card dark:border-border"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-bold text-slate-800 dark:text-foreground">{c.title}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{c.water_body_name || t("comp.waterBody")}</p>
                      </div>
                      {c.fishing_type && (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                          {fishingTypeLabel(c.fishing_type, t)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-500 dark:text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> {formatDate(c.date, lang)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> {t("comp.participants")}: {counts.main}/{c.max_participants}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Medal className="w-3.5 h-3.5" /> {t("comp.reserves")}: {counts.reserve}/{c.max_reserves}
                      </div>
                      {c.prize_fund && (
                        <div className="flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" /> {t("comp.prizeFund")}: {c.prize_fund}
                        </div>
                      )}
                      {c.fee > 0 && (
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                          {t("comp.fee")}: €{c.fee}
                        </div>
                      )}
                    </div>

                    {c.conditions && (
                      <p className="text-sm text-slate-600 dark:text-muted-foreground mt-3">
                        <span className="font-medium text-slate-700 dark:text-foreground">{t("comp.conditions")}:</span> {c.conditions}
                      </p>
                    )}

                    <div className="mt-4 space-y-2">
                      {(user?.roles || [user?.role])?.some((r) => ["admin", "water_owner"].includes(r)) && (
                        <Button
                          variant="outline"
                          onClick={() => handleNotify(c)}
                          disabled={notifying === c.id}
                          className="min-h-[44px] w-full text-xs"
                        >
                          <Send className="w-3.5 h-3.5 mr-1" />
                          {notifying === c.id ? t("comp.notifying") : t("comp.notifyUsers")}
                        </Button>
                      )}
                      {/* v2.87 — public standings, visible to everyone
                          browsing this competition, not just its
                          participants — only shown once there's at least
                          one recorded result, so an empty/useless button
                          doesn't clutter competitions nobody has weighed in
                          for yet. */}
                      {standings.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => setStandingsFor(c)}
                          className="min-h-[40px] w-full text-xs"
                        >
                          <Trophy className="w-3.5 h-3.5 mr-1" /> {t("comp.standings")}
                        </Button>
                      )}
                      {/* v2.94 — "who's registered so far" image, next to
                          "Класиране" — shown whenever there's at least one
                          registration, independent of standings (this is
                          meant to be used DURING registration, before any
                          draw/results exist). */}
                      {regsForComp.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => handleDownloadParticipantsImage(c)}
                          disabled={generatingParticipantsImage}
                          className="min-h-[40px] w-full text-xs"
                        >
                          {generatingParticipantsImage ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                          {t("comp.downloadParticipantsImage")}
                        </Button>
                      )}
                      {myRegs.length > 0 && (
                        <div className="space-y-2">
                          {/* v2.86 — one card per registration the account
                              holds for this competition, not just one: the
                              same account can now register more than one
                              participant (see myRegistrations above). Each
                              row shows WHO it's for (participant_name) since
                              they can be different people, and cancels
                              independently of the others. */}
                          {myRegs.map((r) => (
                            <div key={r.id} className="space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 min-w-0 ${
                                  r.slot_type === "main"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                                }`}>
                                  {r.slot_type === "main" ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <Clock className="w-3 h-3 shrink-0" />}
                                  <span className="truncate">
                                    {r.participant_name} — {r.slot_type === "main" ? t("comp.registeredAsMain") : t("comp.registeredAsReserve")}
                                  </span>
                                </span>
                                <Button variant="outline" size="sm" onClick={() => cancelRegistration(r)} className="min-h-[40px] text-xs shrink-0">
                                  {t("comp.unregister")}
                                </Button>
                              </div>
                              {/* v2.83 — set once the organizer runs the draw
                                  (WaterBodyManagement.jsx). Shown as soon as
                                  it's assigned so the participant knows where
                                  to fish without asking the organizer. */}
                              {r.assigned_box != null && (
                                <div className="rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/20 dark:border-cyan-800 px-3 py-2 text-xs font-medium text-cyan-800 dark:text-cyan-300">
                                  {t("comp.yourBox")}: {r.assigned_sector} — {r.assigned_box}
                                </div>
                              )}
                              {/* v2.90 — read-only: catch weight is now
                                  entered only by the organizer/admin (see
                                  WaterBodyManagement.jsx) — this just shows
                                  what's been recorded so far, plus this
                                  registration's own overall standing once
                                  it's been scored (see rankByPenaltyAndWeight). */}
                              {(totalCatchWeight(parseCatchResults(r.catch_results)) > 0 || rankedMap.has(r.id)) && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {totalCatchWeight(parseCatchResults(r.catch_results)) > 0 && (
                                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                      {t("comp.totalWeight")}: {totalCatchWeight(parseCatchResults(r.catch_results))} {t("comp.kg")}
                                    </span>
                                  )}
                                  {rankedMap.has(r.id) && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                                      {t("comp.standings")} #{rankedMap.get(r.id).rank} · {rankedMap.get(r.id).penalty} {t("comp.pointsUnit")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* v2.89 — a closed competition can now appear here
                          (see load()) so its standings/results stay
                          reachable, but registration itself is genuinely
                          over — no register button for it, whether or not
                          slots happen to still look free. */}
                      {c.status !== "open" ? (
                        <span className="text-xs text-slate-400">{t("comp.registrationClosedLabel")}</span>
                      ) : allFull ? (
                        <span className="text-xs text-slate-400">
                          {myRegs.length === 0 ? t("comp.allFull") : t("comp.allFullCantAddMore")}
                        </span>
                      ) : (
                        <Button
                          onClick={() => { setRegisterFor(c); setRegName(myRegs.length > 0 ? "" : (user?.full_name || "")); }}
                          className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px] w-full"
                        >
                          {myRegs.length > 0 ? t("comp.registerAnother") : t("comp.register")} {mainFull ? t("comp.asReserve") : ""}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!registerFor} onOpenChange={(o) => !o && setRegisterFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("comp.registerFor")} „{registerFor?.title}“</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("comp.fullName")} *</Label>
              <Input value={regName} onChange={(e) => setRegName(e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("comp.phone")}</Label>
              <Input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="min-h-[44px]" />
            </div>
            <p className="text-xs text-slate-400">
              {registerFor && countsFor(registerFor.id).main >= registerFor.max_participants
                ? t("comp.mainFullReserve")
                : t("comp.willBeRegistered")}
            </p>
            {registerFor?.fee > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                {t("comp.participationFee")}: <span className="font-bold">{registerFor.fee} €</span>. {t("comp.paymentLinkInfo")}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterFor(null)} className="min-h-[44px]">{t("wb.cancel")}</Button>
            <Button onClick={handleRegister} disabled={submitting} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
              {submitting ? t("comp.register") + "..." : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v2.87 — read-only standings for one competition; v2.89 — ranked by
          penalty points first (fewer is better — see rankByPenaltyAndWeight),
          total catch weight only the tie-break. v2.92 — this dialog is now
          purely for on-screen viewing; the downloaded PNG (see
          downloadStandingsImage) is drawn separately, straight onto a
          canvas, not screenshotted from here. */}
      <Dialog open={!!standingsFor} onOpenChange={(o) => !o && setStandingsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" /> <span className="break-words">{t("comp.standings")} — {standingsFor?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {standingsFor && (() => {
            const roundsCount = Math.max(1, standingsFor.rounds_count || 1);
            const ranked = rankByPenaltyAndWeight(regsFor(standingsFor.id), roundsCount);
            return (
              <div className="bg-white p-3 rounded-xl space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                  <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-sm font-bold text-slate-800 break-words">{standingsFor.title}</p>
                </div>
                {ranked.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("comp.noResultsYet")}</p>
                ) : (
                  <div className="space-y-2">
                    {ranked.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          r.rank === 1
                            ? "bg-amber-400 text-white"
                            : r.rank === 2
                            ? "bg-slate-300 text-slate-700"
                            : r.rank === 3
                            ? "bg-amber-700 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}>
                          {r.rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{r.participant_name}</p>
                          {r.assigned_box != null && (
                            <p className="text-[10px] text-slate-400">
                              {t("wb.competitionSector")} {r.assigned_sector} — {t("wb.assignedBox")} {r.assigned_box}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-bold text-indigo-700">{r.penalty} {t("comp.pointsUnit")}</p>
                          <p className="text-[10px] text-amber-700">{r.total} {t("comp.kg")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-300 text-right">{t("app.name")} · CatchCount</p>
              </div>
            );
          })()}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStandingsFor(null)} className="min-h-[44px]">{t("wb.cancel")}</Button>
            <Button
              variant="outline"
              onClick={() => handleDownloadStandingsImage(standingsFor)}
              disabled={generatingImage}
              className="min-h-[44px]"
            >
              {generatingImage ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              {generatingImage ? t("comp.generatingImage") : t("comp.downloadImage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
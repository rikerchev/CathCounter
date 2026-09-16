import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Trophy, Calendar, Users, Medal, CheckCircle2, Clock, Send, Scale } from "lucide-react";
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
  parseCatchResults, stringifyCatchResults, totalCatchWeight, rankByTotalWeight,
} from "@/lib/competitionResults";

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
  // v2.87 — registration currently having its per-round catch weight
  // entered (resultsFor), and the competition currently showing its
  // standings dialog (standingsFor, all-registrations, read-only).
  const [resultsFor, setResultsFor] = useState(null);
  const [resultsForm, setResultsForm] = useState([]);
  const [standingsFor, setStandingsFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const all = await base44.entities.Competition.list("-date", 100);
      let filtered = (all || []).filter((c) => c.status === "open");
      if (waterBodyFilter) filtered = filtered.filter((c) => c.water_body_id === waterBodyFilter);
      setCompetitions(filtered);

      const regs = await base44.entities.CompetitionRegistration.list();
      setRegistrations(regs || []);

      const allWb = await base44.entities.WaterBody.list();
      setWaterBodies(allWb || []);
    } catch (e) {
      toast({ title: t("wb.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, waterBodyFilter, t]);

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

  // v2.87 — enter/edit THIS registration's own per-round catch weight.
  // Reachable only for a registration the current account itself created
  // (see the render below — the button only appears on the account's own
  // myRegs rows), which the server's owner_or_relation update rule already
  // allows regardless. Organizer/admin edit any participant's results from
  // WaterBodyManagement.jsx instead.
  function openResultsForm(reg, roundsCount) {
    const results = parseCatchResults(reg.catch_results);
    setResultsFor(reg);
    setResultsForm(Array.from({ length: Math.max(1, roundsCount || 1) }, (_, i) => (
      results[i] != null ? String(results[i]) : ""
    )));
  }

  function updateResultInput(i, value) {
    setResultsForm((f) => {
      const next = f.slice();
      next[i] = value;
      return next;
    });
  }

  async function saveResults() {
    if (!resultsFor) return;
    try {
      await base44.entities.CompetitionRegistration.update(resultsFor.id, {
        catch_results: stringifyCatchResults(resultsForm),
      });
      toast({ title: t("comp.resultsSaved") });
      setResultsFor(null);
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
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
                const standings = rankByTotalWeight(regsFor(c.id));
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
                              {/* v2.87 — enter/edit this registration's own
                                  per-round catch weight. Only the account
                                  that made this specific registration sees
                                  this button for it (see myRegs above) —
                                  the server's owner_or_relation update rule
                                  allows exactly that. */}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                {totalCatchWeight(parseCatchResults(r.catch_results)) > 0 && (
                                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                    {t("comp.totalWeight")}: {totalCatchWeight(parseCatchResults(r.catch_results))} {t("comp.kg")}
                                  </span>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openResultsForm(r, roundsCount)}
                                  className="min-h-[36px] text-xs ml-auto"
                                >
                                  <Scale className="w-3.5 h-3.5 mr-1" /> {t("comp.enterResults")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {allFull ? (
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

      {/* v2.87 — enter/edit one round of catch weight for one of the
          account's own registrations (see openResultsForm/saveResults). */}
      <Dialog open={!!resultsFor} onOpenChange={(o) => !o && setResultsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">{t("comp.enterResults")} — {resultsFor?.participant_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {resultsForm.map((w, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs text-slate-400 font-normal">{t("comp.round")} {i + 1}</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={w}
                    onChange={(e) => updateResultInput(i, e.target.value)}
                    placeholder={t("comp.kg")}
                    className="min-h-[44px]"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {t("comp.totalWeight")}: {totalCatchWeight(resultsForm.map((v) => (v === "" ? null : Number(v))))} {t("comp.kg")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultsFor(null)} className="min-h-[44px]">{t("wb.cancel")}</Button>
            <Button onClick={saveResults} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v2.87 — read-only standings for one competition: everyone with at
          least one round's weight recorded, ranked descending by total
          catch weight — heaviest first, per rankByTotalWeight. */}
      <Dialog open={!!standingsFor} onOpenChange={(o) => !o && setStandingsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" /> <span className="break-words">{t("comp.standings")} — {standingsFor?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {standingsFor && (() => {
            const ranked = rankByTotalWeight(regsFor(standingsFor.id));
            return ranked.length === 0 ? (
              <p className="text-sm text-slate-400">{t("comp.noResultsYet")}</p>
            ) : (
              <div className="space-y-2">
                {ranked.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-accent p-3">
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      r.rank === 1
                        ? "bg-amber-400 text-white"
                        : r.rank === 2
                        ? "bg-slate-300 text-slate-700"
                        : r.rank === 3
                        ? "bg-amber-700 text-white"
                        : "bg-slate-200 dark:bg-accent text-slate-500 dark:text-muted-foreground"
                    }`}>
                      {r.rank}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800 dark:text-foreground">{r.participant_name}</span>
                    <span className="shrink-0 text-sm font-bold text-amber-700 dark:text-amber-400">{r.total} {t("comp.kg")}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStandingsFor(null)} className="min-h-[44px]">{t("wb.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
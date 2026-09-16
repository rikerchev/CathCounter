import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { hasRole } from "@/lib/roles";
import { Waves, PlusCircle, Users, Medal, Settings2, CalendarCheck, Pencil, Landmark, ArrowRightLeft, Download, Loader2 } from "lucide-react";
import { getMerchantBrochureLink } from "@/lib/referral";
import { downloadInviteBrochure } from "@/lib/brochure";
import WaterBodyEditDialog from "@/components/WaterBodyEditDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const FISHING_TYPE_VALUES = ["feeder", "float", "carp", "predator", "match", "other"];

function formatDate(d, lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function WaterBodyManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [waterBodies, setWaterBodies] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompForm, setShowCompForm] = useState(false);
  const [compFor, setCompFor] = useState(null);
  const [compForm, setCompForm] = useState({
    title: "", fishing_type: "feeder", max_participants: "20", max_reserves: "5",
    conditions: "", prize_fund: "", fee: "", date: "", registration_deadline: "",
  });
  const [sectorAvail, setSectorAvail] = useState([]);
  const [sectorRes, setSectorRes] = useState([]);
  const [showSectorForm, setShowSectorForm] = useState(false);
  const [sectorFor, setSectorFor] = useState(null);
  const [sectorForm, setSectorForm] = useState({ date: "", end_date: "", total_sectors: "10", fee_per_person: "" });
  const [editWb, setEditWb] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");

  // v2.77 scoped this to the signed-in merchant's own water bodies only.
  // v2.78 — reverted that for admin accounts specifically: rkerchev@gmail.com
  // (and any admin) should be able to see and edit every merchant's objects
  // straight from "Одобрени търговци" too, not only from the dedicated
  // "Търговци" admin screen (AdminTraders.jsx) — that screen still owns
  // approval/rejection, bonus ad-time and reassigning the owner, but a plain
  // admin account is never blocked from this page anymore either.
  const isAdmin = hasRole(user, "admin");
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const allWb = await base44.entities.WaterBody.list();
      const mine = isAdmin ? (allWb || []) : (allWb || []).filter((w) => w.created_by_id === user.id);
      setWaterBodies(mine);

      const allComps = await base44.entities.Competition.list("-date", 200);
      const mineCompIds = {};
      mine.forEach((w) => { mineCompIds[w.id] = true; });
      setCompetitions((allComps || []).filter((c) => mineCompIds[c.water_body_id]));

      const allRegs = await base44.entities.CompetitionRegistration.list();
      setRegistrations(allRegs || []);

      const allSectAvail = await base44.entities.SectorAvailability.list("-date", 200);
      setSectorAvail(allSectAvail || []);

      const allSectRes = await base44.entities.SectorReservation.list();
      setSectorRes((allSectRes || []).filter((r) => r.status === "active"));
    } catch (e) {
      toast({ title: t("wb.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, user, t, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  function openCompForm(wb) {
    setCompFor(wb);
    setCompForm({
      title: "", fishing_type: "feeder", max_participants: "20", max_reserves: "5",
      conditions: "", prize_fund: "", fee: "", date: "", registration_deadline: "",
    });
    setShowCompForm(true);
  }

  function openEditForm(wb) {
    setEditWb(wb);
    setShowEditForm(true);
  }

  // v2.69 — printable brochure whose QR identifies this water body directly
  // (see src/lib/brochure.js / server/routes/merchantReferrals.ts).
  async function handleDownloadBrochure(wb) {
    setDownloadingId(wb.id);
    try {
      await downloadInviteBrochure({
        name: wb.name,
        link: getMerchantBrochureLink("water_body", wb.id),
        filename: `catchcount-broshura-${(wb.name || "vodoem").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.pdf`,
      });
    } catch (e) {
      toast({ title: t("tv.brochureFailed"), description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId("");
    }
  }

  async function saveWaterBody(data) {
    if (!editWb) return;
    try {
      await base44.entities.WaterBody.update(editWb.id, data);
      toast({ title: t("wb.waterBodyUpdated") });
      setShowEditForm(false);
      await load();
    } catch (e) {
      toast({ title: t("wb.errorSaving"), description: e.message, variant: "destructive" });
    }
  }

  function openSectorForm(wb) {
    setSectorFor(wb);
    setSectorForm({ date: "", end_date: "", total_sectors: "10", fee_per_person: wb.fee_per_person ? String(wb.fee_per_person) : "" });
    setShowSectorForm(true);
  }

  async function createSectorAvailability(e) {
    e.preventDefault();
    if (!sectorFor) return;
    try {
      await base44.entities.SectorAvailability.create({
        water_body_id: sectorFor.id,
        water_body_name: sectorFor.name,
        date: sectorForm.date,
        end_date: sectorForm.end_date || sectorForm.date,
        total_sectors: Number(sectorForm.total_sectors),
        fee_per_person: sectorForm.fee_per_person ? Number(sectorForm.fee_per_person) : 0,
        status: "open",
      });
      toast({ title: t("wb.sectorsOpened") });
      setShowSectorForm(false);
      await load();
    } catch (e) {
      toast({ title: t("wb.errorCreating"), description: e.message, variant: "destructive" });
    }
  }

  async function closeSectorAvailability(avail) {
    try {
      await base44.entities.SectorAvailability.update(avail.id, { status: "closed" });
      toast({ title: t("wb.reservationsClosed") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    }
  }

  function sectAvailFor(wbId) {
    return sectorAvail.filter((a) => a.water_body_id === wbId);
  }

  function sectResFor(availId) {
    return sectorRes.filter((r) => r.availability_id === availId);
  }

  async function createCompetition(e) {
    e.preventDefault();
    if (!compFor) return;
    try {
      await base44.entities.Competition.create({
        water_body_id: compFor.id,
        water_body_name: compFor.name,
        title: compForm.title,
        fishing_type: compForm.fishing_type,
        max_participants: Number(compForm.max_participants),
        max_reserves: Number(compForm.max_reserves),
        conditions: compForm.conditions,
        prize_fund: compForm.prize_fund,
        fee: compForm.fee ? Number(compForm.fee) : 0,
        date: compForm.date ? new Date(compForm.date).toISOString() : null,
        registration_deadline: compForm.registration_deadline ? new Date(compForm.registration_deadline).toISOString() : null,
        status: "open",
      });
      toast({ title: t("wb.competitionCreated") });
      setShowCompForm(false);
      await load();
    } catch (e) {
      toast({ title: t("wb.errorCreating"), description: e.message, variant: "destructive" });
    }
  }

  async function closeCompetition(comp) {
    try {
      await base44.entities.Competition.update(comp.id, { status: "closed" });
      toast({ title: t("wb.registrationClosed") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    }
  }

  function regsFor(compId) {
    return registrations.filter((r) => r.competition_id === compId && r.status === "active");
  }

  async function markTransferred(regId, type) {
    try {
      if (type === "competition") {
        await base44.entities.CompetitionRegistration.update(regId, { payment_status: "transferred" });
      } else {
        await base44.entities.SectorReservation.update(regId, { payment_status: "transferred" });
      }
      toast({ title: t("wb.markedTransferred") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      </div>
    );
  }

  const approvedWb = waterBodies.filter((w) => w.status === "approved");
  const pendingWb = waterBodies.filter((w) => w.status === "pending");

  const wbMap = {};
  waterBodies.forEach((w) => { wbMap[w.id] = w; });
  const compMap = {};
  competitions.forEach((c) => { compMap[c.id] = c; });
  const pendingTransfers = [];
  registrations.forEach((r) => {
    if (r.payment_status === "paid" && r.status === "active") {
      const comp = compMap[r.competition_id];
      const wb = comp ? wbMap[comp.water_body_id] : null;
      if (wb && comp) {
        pendingTransfers.push({
          type: "competition",
          id: r.id,
          title: comp.title,
          wbName: wb.name,
          payer: r.participant_name,
          amount: comp.fee || 0,
          iban: wb.iban,
        });
      }
    }
  });
  // v2.77 — sector-reservation entries removed from this list: reservations
  // no longer go through any in-app payment step (see SectorReservations.jsx
  // and payment.js), so payment_status on a SectorReservation never becomes
  // "paid" anymore and this branch would never match going forward. Left
  // only for competition entry fees below, which still use their own
  // separate Revolut payment step in Competitions.jsx (out of scope for
  // this change).

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("wb.myWaterBodies")}</h1>
      </div>

      {pendingTransfers.length > 0 && (
        <div className="rounded-2xl bg-cyan-50 border-2 border-cyan-300 dark:bg-cyan-900/20 dark:border-cyan-700 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-cyan-600" />
            <h2 className="font-bold text-cyan-800 dark:text-cyan-400">{t("wb.pendingTransfers")} ({pendingTransfers.length})</h2>
          </div>
          <p className="text-xs text-cyan-700 dark:text-cyan-300">{t("wb.pendingTransfersDesc")}</p>
          <div className="space-y-2">
            {pendingTransfers.map((tr) => (
              <div key={tr.type + tr.id} className="rounded-xl bg-white dark:bg-card border border-cyan-200 dark:border-cyan-800 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-800 dark:text-foreground">{tr.title}</p>
                    <p className="text-xs text-slate-500 dark:text-muted-foreground">{tr.wbName} • {tr.payer}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-emerald-600">{tr.amount} €</p>
                  </div>
                </div>
                {tr.iban && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-accent p-2">
                    <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <code className="flex-1 text-xs font-mono break-all">{tr.iban}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(tr.iban); toast({ title: t("wb.ibanCopied") }); }} className="min-h-[36px] text-xs">{t("wb.copy")}</Button>
                  </div>
                )}
                <Button size="sm" onClick={() => markTransferred(tr.id, tr.type)} className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[40px] text-xs">
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> {t("wb.markTransferred")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingWb.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">{t("wb.pendingApproval")}</p>
          {pendingWb.map((w) => (
            <div key={w.id} className="text-sm text-amber-700 dark:text-amber-300">
              {w.name} — {w.location}
            </div>
          ))}
        </div>
      )}

      {approvedWb.length === 0 && pendingWb.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Waves className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">{t("wb.noWaterBodies")}</p>
        </div>
      ) : (
        approvedWb.map((wb) => {
          const wbComps = competitions.filter((c) => c.water_body_id === wb.id);
          return (
            <div key={wb.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-800 dark:text-foreground">{wb.name}</h2>
                  <p className="text-xs text-slate-400">{wb.location}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => openEditForm(wb)} size="sm" variant="outline" className="min-h-[40px]">
                    <Pencil className="w-4 h-4 mr-1" /> {t("wb.edit")}
                  </Button>
                  <Button onClick={() => openCompForm(wb)} size="sm" className="bg-cyan-600 hover:bg-cyan-700 min-h-[40px]">
                    <PlusCircle className="w-4 h-4 mr-1" /> {t("wb.competition")}
                  </Button>
                  <Button onClick={() => openSectorForm(wb)} size="sm" variant="outline" className="min-h-[40px]">
                    <CalendarCheck className="w-4 h-4 mr-1" /> {t("wb.sectors")}
                  </Button>
                  <Button
                    onClick={() => handleDownloadBrochure(wb)}
                    size="sm"
                    variant="outline"
                    disabled={downloadingId === wb.id}
                    className="min-h-[40px]"
                  >
                    {downloadingId === wb.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                    {t("tv.downloadBrochure")}
                  </Button>
                </div>
              </div>

              {wbComps.length === 0 ? (
                <p className="text-xs text-slate-400">{t("wb.noActiveCompetitions")}</p>
              ) : (
                <div className="space-y-2">
                  {wbComps.map((c) => {
                    const regs = regsFor(c.id);
                    return (
                      <div key={c.id} className="rounded-xl bg-slate-50 dark:bg-accent p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-slate-800 dark:text-foreground truncate">{c.title}</p>
                            <p className="text-xs text-slate-400">{formatDate(c.date, lang)}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            c.status === "open"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-slate-200 text-slate-600 dark:bg-accent dark:text-muted-foreground"
                          }`}>
                            {c.status === "open" ? t("wb.open") : t("wb.closed")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {regs.filter((r) => r.slot_type === "main").length}/{c.max_participants}</span>
                          <span className="flex items-center gap-1"><Medal className="w-3 h-3" /> {regs.filter((r) => r.slot_type === "reserve").length}/{c.max_reserves}</span>
                        </div>
                        {c.status === "open" && (
                          <Button variant="outline" size="sm" onClick={() => closeCompetition(c)} className="min-h-[36px] mt-2 text-xs">
                            {t("wb.closeRegistration")}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(() => {
                const wbSectAvail = sectAvailFor(wb.id);
                return wbSectAvail.length === 0 ? (
                  <p className="text-xs text-slate-400">{t("wb.noOpenSectors")}</p>
                ) : (
                  <div className="space-y-2">
                    {wbSectAvail.map((a) => {
                      const sRes = sectResFor(a.id);
                      return (
                        <div key={a.id} className="rounded-xl bg-slate-50 dark:bg-accent p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm text-slate-800 dark:text-foreground">{a.end_date && a.end_date !== a.date ? `${formatDate(a.date, lang)} – ${formatDate(a.end_date, lang)}` : formatDate(a.date, lang)}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {sRes.length}/{a.total_sectors} {t("wb.reserved")}</span>
                                {a.fee_per_person > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">{a.fee_per_person} €</span>}
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              a.status === "open"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-slate-200 text-slate-600 dark:bg-accent dark:text-muted-foreground"
                            }`}>
                              {a.status === "open" ? t("wb.open") : t("wb.closed")}
                            </span>
                          </div>
                          {sRes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {sRes.map((r) => (
                                <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                                  {t("wb.sector")}.{r.sector_number} — {r.reserved_by_name}{r.payment_status === "paid" ? " ✓" : " ⏳"}
                                </span>
                              ))}
                            </div>
                          )}
                          {a.status === "open" && (
                            <Button variant="outline" size="sm" onClick={() => closeSectorAvailability(a)} className="min-h-[36px] mt-2 text-xs">
                              {t("wb.closeReservations")}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })
      )}

      <WaterBodyEditDialog
        wb={editWb}
        open={showEditForm}
        onOpenChange={setShowEditForm}
        onSaved={saveWaterBody}
      />

      <Dialog open={showCompForm} onOpenChange={setShowCompForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wb.newCompetition")} — {compFor?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={createCompetition} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("wb.titleLabel")} *</Label>
              <Input value={compForm.title} onChange={(e) => setCompForm((f) => ({ ...f, title: e.target.value }))} required className="min-h-[44px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.fishingType")}</Label>
                <Select value={compForm.fishing_type} onValueChange={(v) => setCompForm((f) => ({ ...f, fishing_type: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FISHING_TYPE_VALUES.map((ft) => <SelectItem key={ft} value={ft}>{t("fishing." + ft)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.prizeFund")}</Label>
                <Input value={compForm.prize_fund} onChange={(e) => setCompForm((f) => ({ ...f, prize_fund: e.target.value }))} className="min-h-[44px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.participationFee")}</Label>
                <Input type="number" step="any" value={compForm.fee} onChange={(e) => setCompForm((f) => ({ ...f, fee: e.target.value }))} className="min-h-[44px]" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.maxParticipants")}</Label>
                <Input type="number" value={compForm.max_participants} onChange={(e) => setCompForm((f) => ({ ...f, max_participants: e.target.value }))} className="min-h-[44px]" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.maxReserves")}</Label>
                <Input type="number" value={compForm.max_reserves} onChange={(e) => setCompForm((f) => ({ ...f, max_reserves: e.target.value }))} className="min-h-[44px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.dateAndTime")} *</Label>
                <Input type="datetime-local" value={compForm.date} onChange={(e) => setCompForm((f) => ({ ...f, date: e.target.value }))} required className="min-h-[44px]" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.registrationDeadline")}</Label>
                <Input type="datetime-local" value={compForm.registration_deadline} onChange={(e) => setCompForm((f) => ({ ...f, registration_deadline: e.target.value }))} className="min-h-[44px]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("wb.conditions")}</Label>
              <Textarea value={compForm.conditions} onChange={(e) => setCompForm((f) => ({ ...f, conditions: e.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCompForm(false)} className="min-h-[44px]">{t("wb.cancel")}</Button>
              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">{t("wb.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSectorForm} onOpenChange={setShowSectorForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wb.sectorsForReservation")} — {sectorFor?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={createSectorAvailability} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.startDate")} *</Label>
                <Input type="date" value={sectorForm.date} onChange={(e) => setSectorForm((f) => ({ ...f, date: e.target.value }))} required className="min-h-[44px]" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.endDate")}</Label>
                <Input type="date" value={sectorForm.end_date} min={sectorForm.date} onChange={(e) => setSectorForm((f) => ({ ...f, end_date: e.target.value }))} className="min-h-[44px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.sectorCount")} *</Label>
                <Input type="number" min="1" value={sectorForm.total_sectors} onChange={(e) => setSectorForm((f) => ({ ...f, total_sectors: e.target.value }))} required className="min-h-[44px]" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.feePerPerson")}</Label>
                <Input type="number" step="any" value={sectorForm.fee_per_person} onChange={(e) => setSectorForm((f) => ({ ...f, fee_per_person: e.target.value }))} className="min-h-[44px]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSectorForm(false)} className="min-h-[44px]">{t("wb.cancel")}</Button>
              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">{t("wb.openBtn")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { CalendarCheck, Waves, MapPin, Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { boxLabelsFor } from "@/lib/sectorLabels";

function formatDate(d, lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateRange(start, end, lang) {
  if (!start) return "—";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  if (!e || s.getTime() === e.getTime()) return formatDate(start, lang);
  const locale = lang === "bg" ? "bg-BG" : "en-GB";
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString(locale, { day: "2-digit" })} – ${e.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  }
  return `${formatDate(start, lang)} – ${formatDate(end, lang)}`;
}

export default function SectorReservations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [searchParams] = useSearchParams();
  const wbFilter = searchParams.get("water_body");
  const [waterBodies, setWaterBodies] = useState([]);
  const [availabilities, setAvailabilities] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reserveFor, setReserveFor] = useState(null);
  // v2.96 — was a free-typed integer (1..total_sectors); now a chosen label
  // string from boxLabelsFor(avail), which falls back to plain sequential
  // numbers ("1", "2", ...) when the owner hasn't set custom box_labels, so
  // old availabilities keep working exactly as before.
  const [sectorLabel, setSectorLabel] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const allWb = await base44.entities.WaterBody.list();
      const approved = (allWb || []).filter((w) => w.status === "approved");
      setWaterBodies(approved);

      const allAvail = await base44.entities.SectorAvailability.list("-date", 200);
      setAvailabilities(allAvail || []);

      const allRes = await base44.entities.SectorReservation.list();
      setReservations((allRes || []).filter((r) => r.status === "active"));
    } catch (e) {
      toast({ title: t("sr.title"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  function resForAvail(availId) {
    return reservations.filter((r) => r.availability_id === availId);
  }

  function takenSectors(availId) {
    const set = {};
    resForAvail(availId).forEach((r) => { set[r.sector_number] = true; });
    return set;
  }

  function openReserve(avail, wb) {
    setReserveFor({ avail, wb });
    setSectorLabel("");
    setName(user?.full_name || "");
    setPhone("");
  }

  async function confirmReservation() {
    if (!reserveFor) return;
    const { avail, wb } = reserveFor;
    const labels = boxLabelsFor(avail);
    if (!sectorLabel || !labels.includes(sectorLabel)) {
      toast({ title: t("sr.invalidSector"), description: t("sr.selectSectorRange"), variant: "destructive" });
      return;
    }
    const taken = takenSectors(avail.id);
    if (taken[sectorLabel]) {
      toast({ title: t("sr.sectorTaken"), description: t("sr.chooseAnotherSector"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // v2.77 — payment_status is set once and never changes anymore (the
      // "pay via Revolut" / "I paid" step that used to move it to "paid" was
      // removed along with the platform-commission split — see payment.js).
      // Kept as "pending" rather than dropped so the column stays meaningful
      // if a payment flow is ever reintroduced later.
      await base44.entities.SectorReservation.create({
        water_body_id: wb.id,
        water_body_name: wb.name,
        availability_id: avail.id,
        date: avail.date,
        sector_number: sectorLabel,
        reserved_by_name: name,
        reserved_by_phone: phone,
        fee: avail.fee_per_person || 0,
        payment_status: "pending",
        status: "active",
      });
      toast({ title: t("sr.reservationMade"), description: t("sr.sectorReserved") });
      setReserveFor(null);
      await load();
    } catch (e) {
      toast({ title: t("sr.errorReserving"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const openAvail = availabilities.filter((a) => a.status === "open" && a.date >= today);
  const filteredWb = wbFilter ? waterBodies.filter((w) => w.id === wbFilter) : waterBodies;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <CalendarCheck className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("sr.title")}</h1>
      </div>

      {openAvail.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Waves className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">{t("sr.noOpenDates")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredWb.map((wb) => {
            const wbAvail = openAvail.filter((a) => a.water_body_id === wb.id);
            if (wbAvail.length === 0) return null;
            return (
              <div key={wb.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3">
                <div className="flex items-start gap-3">
                  {wb.scheme_image_url && (
                    <img
                      src={wb.scheme_image_url}
                      alt={t("wb.schemeImage")}
                      className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-border shrink-0"
                    />
                  )}
                  <div>
                    <h2 className="font-bold text-slate-800 dark:text-foreground">{wb.name}</h2>
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <MapPin className="w-3 h-3" /> {wb.location}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {wbAvail.map((avail) => {
                    const taken = takenSectors(avail.id);
                    const takenCount = Object.keys(taken).length;
                    const free = avail.total_sectors - takenCount;
                    return (
                      <div key={avail.id} className="rounded-xl bg-slate-50 dark:bg-accent p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm text-slate-800 dark:text-foreground">{formatDateRange(avail.date, avail.end_date, lang)}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" /> {t("sr.available")}: {free}/{avail.total_sectors}
                              </span>
                              {avail.fee_per_person > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                  {avail.fee_per_person} €{t("sr.perPerson")}
                                </span>
                              )}
                            </div>
                          </div>
                          {free > 0 ? (
                            <Button size="sm" onClick={() => openReserve(avail, wb)} className="bg-cyan-600 hover:bg-cyan-700 min-h-[40px]">
                              {t("sr.reserve")}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Lock className="w-3 h-3" /> {t("sr.full")}
                            </span>
                          )}
                        </div>
                        {takenCount > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.keys(taken).map((s) => (
                              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                {t("sr.sector")} {s} — {t("sr.taken")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!reserveFor} onOpenChange={(o) => !o && setReserveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sr.reservation")} — {reserveFor?.wb.name}</DialogTitle>
          </DialogHeader>
          {reserveFor && (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 dark:bg-accent p-3 text-sm">
                <p><span className="text-slate-500 dark:text-muted-foreground">{t("sr.date")}:</span> {formatDate(reserveFor.avail.date, lang)}</p>
                <p><span className="text-slate-500 dark:text-muted-foreground">{t("sr.sectors")}:</span> {reserveFor.avail.total_sectors}</p>
                {reserveFor.avail.fee_per_person > 0 && (
                  <p><span className="text-slate-500 dark:text-muted-foreground">{t("sr.fee")}:</span> <span className="text-emerald-600 font-medium">{reserveFor.avail.fee_per_person} €</span></p>
                )}
              </div>
              {reserveFor.wb.scheme_image_url && (
                <div className="space-y-1.5">
                  <Label>{t("wb.schemeImage")}</Label>
                  <img
                    src={reserveFor.wb.scheme_image_url}
                    alt={t("wb.schemeImage")}
                    className="w-full max-h-48 object-contain rounded-lg border border-slate-200 dark:border-border bg-white"
                  />
                </div>
              )}
              {/* v2.96 — was a free-typed number; now a grid of the
                  availability's actual box labels (boxLabelsFor falls back
                  to plain sequential numbers when the owner hasn't set
                  custom box_labels), with already-taken boxes disabled. */}
              <div className="space-y-1.5">
                <Label>{t("sr.sectorNumber")} *</Label>
                <div className="flex flex-wrap gap-1.5">
                  {boxLabelsFor(reserveFor.avail).map((label) => {
                    const taken = !!takenSectors(reserveFor.avail.id)[label];
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={taken}
                        onClick={() => setSectorLabel(label)}
                        className={`min-h-[40px] min-w-[40px] px-2 rounded-md text-sm border transition-colors ${
                          taken
                            ? "bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed dark:bg-accent dark:text-muted-foreground dark:border-border"
                            : sectorLabel === label
                            ? "bg-cyan-600 text-white border-cyan-600"
                            : "bg-white text-slate-700 border-slate-300 hover:border-cyan-400 dark:bg-card dark:text-foreground dark:border-border"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("sr.name")} *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px]" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("sr.phone")}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="min-h-[44px]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReserveFor(null)} className="min-h-[44px]">{t("sr.cancel")}</Button>
            <Button type="button" onClick={confirmReservation} disabled={submitting} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
              {submitting ? t("sr.saving") : t("sr.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
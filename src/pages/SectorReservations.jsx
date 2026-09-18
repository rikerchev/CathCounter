import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { CalendarCheck, Waves, MapPin, Users, Lock, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { boxLabelsFor, labeledSectorGroupsFor } from "@/lib/sectorLabels";
import ZoomableImage from "@/components/ZoomableImage";

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
  // v3.06 — was always silently booked for the availability's start date
  // (avail.date), even when the owner opened a whole date RANGE
  // (date..end_date); the customer had no way to say which day within that
  // range they actually mean. Defaults to the start date, shown/editable
  // only when the availability actually spans more than one day.
  const [resDate, setResDate] = useState("");
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

  // v3.07 — a box is only actually occupied on the SPECIFIC day it was
  // reserved for (SectorReservation.date), not for every day of a multi-day
  // opening (date..end_date). Before this, reserving box "5" for just one
  // day within a 5-day period silently blocked that same box for all 5 days
  // — nobody else could ever book it again for the OTHER four, even though
  // only one day was actually taken. `date` is now required: every caller
  // below passes the specific day it cares about, so a single-day opening
  // (the common case, avail.date === avail.end_date) behaves exactly as
  // before, and a multi-day one is finally checked per day.
  function takenSectors(availId, date) {
    const set = {};
    resForAvail(availId).forEach((r) => {
      if (r.date === date) set[r.sector_number] = true;
    });
    return set;
  }

  // Every calendar day from `start` to `end` (inclusive), as ISO date
  // strings — used to compute a safe "free" count across a whole multi-day
  // opening (see freeCountFor below) without hand-rolling date math at each
  // call site.
  function datesInRange(start, end) {
    const out = [];
    let d = new Date(`${start}T00:00:00`);
    const last = new Date(`${end || start}T00:00:00`);
    while (d <= last) {
      out.push(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86400000);
    }
    return out;
  }

  // The BEST-case free count across every day of the opening — a single-day
  // opening has exactly one day in range, so this is unchanged from before.
  // For a multi-day range, "free" no longer means "free for the whole
  // period" (that conflated every day together — the exact bug being fixed
  // here), it means "there's still at least one day with this many boxes
  // open" — a fair one-number summary for the card; the exact per-day
  // picture is what the reservation dialog's date-aware box grid enforces.
  function freeCountFor(avail) {
    const days = datesInRange(avail.date, avail.end_date || avail.date);
    const perDayFree = days.map((d) => avail.total_sectors - Object.keys(takenSectors(avail.id, d)).length);
    return Math.max(...perDayFree);
  }

  function openReserve(avail, wb) {
    setReserveFor({ avail, wb });
    setSectorLabel("");
    setResDate(avail.date);
    setName(user?.full_name || "");
    // v3.10 — auto-filled from the account's own phone (same precedent as
    // Competitions.jsx's own registration form), not left blank — the
    // owner's request was that a reservation always carries a direct
    // contact number without the customer having to retype it every time.
    // Still an editable field, in case this one reservation is for someone
    // else's number.
    setPhone(user?.phone || "");
  }

  // Changing the date in the dialog can make a previously-picked box
  // available again (or newly taken by someone else on the new day) — clear
  // the selection so the customer always re-confirms against the day they
  // actually ended up choosing, instead of silently keeping a pick that no
  // longer means what they think it does.
  function changeResDate(date) {
    setResDate(date);
    setSectorLabel("");
  }

  async function confirmReservation() {
    if (!reserveFor) return;
    const { avail, wb } = reserveFor;
    const labels = boxLabelsFor(avail);
    if (!sectorLabel || !labels.includes(sectorLabel)) {
      toast({ title: t("sr.invalidSector"), description: t("sr.selectSectorRange"), variant: "destructive" });
      return;
    }
    if (!resDate || resDate < avail.date || resDate > (avail.end_date || avail.date)) {
      toast({ title: t("sr.invalidSector"), description: t("sr.selectDateRange"), variant: "destructive" });
      return;
    }
    const taken = takenSectors(avail.id, resDate);
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
      const created = await base44.entities.SectorReservation.create({
        water_body_id: wb.id,
        water_body_name: wb.name,
        availability_id: avail.id,
        date: resDate,
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
      // v3.10 — immediate email to BOTH the water body's owner and the
      // person who just booked, each with the sector/box just reserved and
      // the booker's own name/phone — see server/routes/functions.ts's
      // "notify-sector-reservation". Deliberately AFTER the success
      // toast/reload above and in its own try/catch: an email hiccup must
      // never make the reservation itself look like it failed, since it
      // already fully succeeded by this point.
      try {
        await base44.functions.invoke("notify-sector-reservation", { reservation_id: created.id });
      } catch { /* best-effort — the reservation itself already succeeded */ }
    } catch (e) {
      toast({ title: t("sr.errorReserving"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // v3.10 — the reservation's own creator (or an admin) can cancel it
  // directly from this same list — no need to go through the water body's
  // owner. Soft-cancel via status update (mirrors
  // WaterBodyManagement.jsx's cancelRegistrationAsOrganizer for
  // competitions), not a hard delete: the box immediately reads as free
  // again everywhere `reservations` is filtered to status === "active"
  // (load/resForAvail/takenSectors above), while the record itself is kept.
  async function cancelMyReservation(r) {
    if (!window.confirm(t("sr.confirmCancelReservation"))) return;
    try {
      await base44.entities.SectorReservation.update(r.id, { status: "cancelled" });
      toast({ title: t("sr.reservationCancelled") });
      await load();
    } catch (e) {
      toast({ title: t("sr.errorReserving"), description: e.message, variant: "destructive" });
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
                    <ZoomableImage
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
                    const free = freeCountFor(avail);
                    const availRes = resForAvail(avail.id);
                    const isMultiDay = avail.end_date && avail.end_date !== avail.date;
                    return (
                      <div key={avail.id} className="rounded-xl bg-slate-50 dark:bg-accent p-3">
                        {/* v3.04 — stacked on mobile (button gets its own
                            full-width row below the info) rather than
                            squeezed onto the same row, now that the button
                            itself is bigger/more prominent (per the site
                            owner's request) and its label is longer. */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
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
                            {/* v3.06 — per-opening working hours (pre-filled
                                from the water body's own when the owner
                                opened this period, editable per period —
                                see WaterBodyManagement.jsx). */}
                            {avail.working_hours && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                                <Clock className="w-3 h-3" /> {avail.working_hours}
                              </div>
                            )}
                          </div>
                          {free > 0 ? (
                            <Button
                              onClick={() => openReserve(avail, wb)}
                              className="bg-cyan-600 hover:bg-cyan-700 min-h-[48px] w-full sm:w-auto px-6 text-base font-semibold"
                            >
                              {t("sr.reserve")}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Lock className="w-3 h-3" /> {t("sr.full")}
                            </span>
                          )}
                        </div>
                        {/* v3.07 — one badge PER reservation now, not one
                            per box-number-ever-taken-during-this-period —
                            each shows its own date when the opening spans
                            more than one day, since the same box legitimately
                            belongs to different people on different days. */}
                        {/* v3.10 — the customer's own reservation(s) for
                            THIS availability get pulled out of the generic
                            "taken" list below into their own row, each with
                            an explicit cancel button — no need to go
                            through the water body's owner to give up a
                            spot. `created_by_id` is set server-side on
                            create (see confirmReservation), so this is
                            never spoofable client-side. */}
                        {availRes.some((r) => r.created_by_id === user?.id) && (
                          <div className="flex flex-col gap-1.5 mt-2">
                            {availRes.filter((r) => r.created_by_id === user?.id).map((r) => (
                              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 px-2.5 py-1.5">
                                <span className="text-xs text-cyan-700 dark:text-cyan-400 font-medium">
                                  {t("sr.myReservation")}: {t("sr.sector")} {r.sector_number}{isMultiDay ? ` · ${formatDate(r.date, lang)}` : ""}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => cancelMyReservation(r)}
                                  className="h-8 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 shrink-0"
                                >
                                  <X className="w-3.5 h-3.5 mr-1" /> {t("sr.cancelReservation")}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Everyone else's reservation for this availability
                            stays a plain anonymized "taken" badge — the
                            existing v3.07 behavior, just excluding the
                            customer's own (shown above instead). */}
                        {availRes.filter((r) => r.created_by_id !== user?.id).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {availRes.filter((r) => r.created_by_id !== user?.id).map((r) => (
                              <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                {t("sr.sector")} {r.sector_number}{isMultiDay ? ` · ${formatDate(r.date, lang)}` : ""} — {t("sr.taken")}
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
                {/* v3.06 — a single-day opening still just shows its one
                    date as plain text (unchanged); a multi-day opening
                    (end_date > date) shows the picker below instead, so this
                    line only covers the single-day case now. */}
                {reserveFor.avail.date === (reserveFor.avail.end_date || reserveFor.avail.date) && (
                  <p><span className="text-slate-500 dark:text-muted-foreground">{t("sr.date")}:</span> {formatDate(reserveFor.avail.date, lang)}</p>
                )}
                <p><span className="text-slate-500 dark:text-muted-foreground">{t("sr.sectors")}:</span> {reserveFor.avail.total_sectors}</p>
                {reserveFor.avail.fee_per_person > 0 && (
                  <p><span className="text-slate-500 dark:text-muted-foreground">{t("sr.fee")}:</span> <span className="text-emerald-600 font-medium">{reserveFor.avail.fee_per_person} €</span></p>
                )}
                {reserveFor.avail.working_hours && (
                  <p><span className="text-slate-500 dark:text-muted-foreground">{t("common.workingHours")}:</span> {reserveFor.avail.working_hours}</p>
                )}
              </div>
              {/* v3.06 — was completely missing: the customer had no way to
                  say which day within a multi-day opening (date..end_date)
                  their reservation is for, so it was always silently booked
                  for the start date. Only shown when the opening actually
                  spans more than one day — a single-day opening keeps the
                  plain text line above, unchanged. */}
              {reserveFor.avail.end_date && reserveFor.avail.end_date !== reserveFor.avail.date && (
                <div className="space-y-1.5">
                  <Label>{t("sr.date")} *</Label>
                  <Input
                    type="date"
                    value={resDate}
                    min={reserveFor.avail.date}
                    max={reserveFor.avail.end_date}
                    onChange={(e) => changeResDate(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>
              )}
              {reserveFor.wb.scheme_image_url && (
                <div className="space-y-1.5">
                  <Label>{t("wb.schemeImage")}</Label>
                  <ZoomableImage
                    src={reserveFor.wb.scheme_image_url}
                    alt={t("wb.schemeImage")}
                    className="w-full max-h-48 object-contain rounded-lg border border-slate-200 dark:border-border bg-white"
                  />
                </div>
              )}
              {/* v2.96 — was a free-typed number; now a grid of the
                  availability's actual box labels, with already-taken boxes
                  disabled. v3.04 — grouped under its sector's name when the
                  owner configured more than one named sector
                  (labeledSectorGroupsFor); a single unnamed sector (still
                  the common case) renders exactly as before — one flat grid,
                  no header. */}
              <div className="space-y-2">
                <Label>{t("sr.sectorNumber")} *</Label>
                {labeledSectorGroupsFor(reserveFor.avail).map((group, gi) => (
                  <div key={gi} className="space-y-1">
                    {group.name && (
                      <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{group.name}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {group.boxes.map((label) => {
                        const taken = !!takenSectors(reserveFor.avail.id, resDate)[label];
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
                ))}
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
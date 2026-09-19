import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { hasRole, effectiveRoles, highestRole } from "@/lib/roles";
import { Waves, PlusCircle, Users, Medal, Settings2, CalendarCheck, Pencil, Landmark, ArrowRightLeft, Download, Loader2, ClipboardList, FileDown, Phone, Mail, Shuffle, Trash2, X, RotateCcw, Copy, Trophy, Scale, GripVertical, Upload, Image as ImageIcon, Send, Clock, Calendar as CalendarIcon, List as ListIcon } from "lucide-react";
import { maskEmail } from "@/lib/emailMask";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { getMerchantBrochureLink } from "@/lib/referral";
import { downloadInviteBrochure } from "@/lib/brochure";
import BrochureContactDialog from "@/components/BrochureContactDialog";
import {
  parseSectorsConfig, stringifySectorsConfig, totalBoxes, drawBoxes, NOT_ENOUGH_BOXES,
} from "@/lib/competitionSectors";
import ZoomableImage from "@/components/ZoomableImage";
import {
  parseCatchResults, stringifyCatchResults, totalCatchWeight, roundSectorPoints, rankByPenaltyAndWeight,
} from "@/lib/competitionResults";
import { downloadStandingsImage, downloadParticipantsImage, downloadDrawResultsImage } from "@/lib/standingsImage";
import WaterBodyEditDialog from "@/components/WaterBodyEditDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// v2.83 — fishing_type used to be a fixed enum (see below in the create/edit
// form, now a free-text Input); FISHING_TYPE_KEYS is only kept to translate
// OLD competitions that still hold one of these six values when they're
// opened for editing (see openEditCompForm), so the input shows "Фидер"
// instead of the raw internal key "feeder".
const FISHING_TYPE_KEYS = ["feeder", "float", "carp", "predator", "match", "other"];
function fishingTypeLabel(value, t) {
  if (!value) return "";
  return FISHING_TYPE_KEYS.includes(value) ? t("fishing." + value) : value;
}

// v2.84 — boxCount only drives how many label cells appear in the editor
// (see updateSectorRow); the actual per-box names/numbers live in `boxes`
// and are what gets saved (see stringifySectorsConfig).
const EMPTY_SECTOR_ROW = { name: "", boxCount: "", boxes: [] };

function formatDate(d, lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// v3.14 — SectorAvailability.date/end_date and SectorReservation.date are
// plain "YYYY-MM-DD" calendar dates with NO time component of their own
// (unlike Competition.date above, a real timestamp with a meaningful hour —
// e.g. the draw/start time) — they only say WHICH DAY a reservation period
// runs or a booking is for. `new Date("2026-09-21")` parses that as
// midnight UTC; formatDate's `hour`/`minute` options then rendered it in
// the BROWSER's local timezone (Europe/Sofia, UTC+2/+3), producing a bogus
// artifact time with no real meaning — e.g. "21.09.2026 г., 03:00" — that
// the water body owner mistook for an actual opening time. Fixed by never
// asking for hour/minute here; the water body's REAL operating hours are a
// separate free-text field (SectorAvailability.working_hours) shown
// alongside the date range instead — see its own card below.
function formatDateOnly(d, lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in LOCAL time, not the ISO
// string (UTC, with seconds/millis) that Competition.date is stored as —
// used only when opening an existing competition for editing.
function toDatetimeLocal(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// v3.14 — calendar-grid helpers for the "view by day" toggle on a
// multi-day SectorAvailability period (see AvailabilityCalendar below).
// Weeks start Monday (Bulgarian convention), matching a normal wall
// calendar rather than the US Sunday-first layout.
const WEEKDAY_LABELS_BG = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function isoDateOf(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Every {year, month} (month 0-indexed) the [startISO, endISO] range
// touches, so a period spanning several months (like the 21.09–01.11
// example that prompted this) renders one grid per month instead of one
// giant one.
function monthsBetween(startISO, endISO) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const out = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

// A flat array of 7*N Date objects (or null for the leading/trailing
// padding cells before day 1 / after the last day), grouped into full
// weeks so the grid always renders as complete rows.
function buildMonthGrid(year, month) {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// v3.14 — the calendar view of a reservation period's own component: one
// small month grid per month the period spans, each day cell listing that
// day's active reservations (box + name, same info as the flat-list
// badges), so a long multi-day period (weeks/months, e.g. 21.09–01.11) can
// be scanned for which days are busy at a glance instead of hunting
// through one long undifferentiated list. Days outside the availability's
// own [date, end_date] range (padding from the month grid, or days before/
// after the period within its own months) are dimmed and never
// interactive — this is a read-only view, not a picker.
function AvailabilityCalendar({ avail, reservations, t, lang }) {
  const startISO = avail.date;
  const endISO = avail.end_date || avail.date;
  const months = monthsBetween(startISO, endISO);
  return (
    <div className="space-y-3 mt-2">
      {months.map(({ year, month }) => {
        const cells = buildMonthGrid(year, month);
        const monthLabel = new Date(year, month, 1).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { month: "long", year: "numeric" });
        return (
          <div key={`${year}-${month}`} className="rounded-lg border border-slate-200 dark:border-border overflow-hidden">
            <div className="bg-slate-100 dark:bg-accent px-2 py-1 text-xs font-medium text-slate-600 dark:text-foreground capitalize">
              {monthLabel}
            </div>
            <div className="grid grid-cols-7 text-[10px] text-slate-400 dark:text-muted-foreground border-b border-slate-100 dark:border-border">
              {WEEKDAY_LABELS_BG.map((w) => (
                <div key={w} className="text-center py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                if (!d) {
                  return <div key={i} className="min-h-[46px] border-t border-r border-slate-100 dark:border-border last:border-r-0" />;
                }
                const iso = isoDateOf(d);
                const inRange = iso >= startISO && iso <= endISO;
                const dayRes = inRange ? reservations.filter((r) => r.date === iso) : [];
                return (
                  <div
                    key={i}
                    className={`min-h-[46px] border-t border-r border-slate-100 dark:border-border last:border-r-0 p-1 ${inRange ? "" : "opacity-30"}`}
                  >
                    <div className="text-[10px] text-slate-400 dark:text-muted-foreground">{d.getDate()}</div>
                    {dayRes.length > 0 && (
                      <div className="space-y-0.5 mt-0.5">
                        {dayRes.map((r) => (
                          <div
                            key={r.id}
                            title={`${t("wb.sector")}.${r.sector_number} — ${r.reserved_by_name}${r.reserved_by_phone ? ` · ${r.reserved_by_phone}` : ""}${r.arrival_time ? ` · ${r.arrival_time}` : ""}`}
                            className="text-[9px] leading-tight px-1 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 truncate"
                          >
                            {r.sector_number} {r.reserved_by_name}
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
      })}
    </div>
  );
}

const PAYMENT_STATUS_LABEL_KEYS = {
  pending: "wb.paymentStatusPending",
  paid: "wb.paymentStatusPaid",
  transferred: "wb.paymentStatusTransferred",
};

// v3.14 — was defined INSIDE the participants dialog's own render function
// (a fresh `const ParticipantRow = ({ r }) => {...}` on every single
// render), which is exactly the mistake it looks like: a component's
// IDENTITY, not just its props, decides whether React updates its existing
// DOM or tears it down and rebuilds it from scratch, and a brand-new
// function is a brand-new identity every time — even though every
// `<ParticipantRow key={r.id} .../>` element still had the same key. So
// every keystroke in a weight input (updateResultDraft -> setResultsDraft
// -> the whole dialog re-renders -> a new ParticipantRow function exists)
// made React discard and recreate EVERY participant row's entire DOM
// subtree, not just the one being edited — destroying the focused <Input>
// mid-typing and resetting the dialog's scroll position back to the top on
// every single result entered. That's exactly the site owner's report:
// losing your place in a 28-participant list after every weigh-in, and
// mistyping as a result. Lifted out to a stable, module-level component
// fixes both: React now just diffs props against the SAME existing DOM
// node, so focus and scroll position are left alone.
function ParticipantRow({
  r, seqById, rankedMap, roundPointsMatrix, roundsCount, resultsDraft, updateResultDraft, openEditReg, t,
}) {
  const draftResults = resultsDraft[r.id] || Array.from({ length: roundsCount }, () => "");
  const total = totalCatchWeight(draftResults.map((v) => (v === "" ? null : Number(v))));
  const ranked = rankedMap.get(r.id);
  const roundPoints = roundPointsMatrix.map((m) => m.get(r.id));
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-accent p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-foreground">
          <span className="text-slate-400 dark:text-muted-foreground font-normal">#{seqById.get(r.id)}</span> {r.participant_name}
        </p>
        <Button variant="ghost" size="icon" onClick={() => openEditReg(r)} className="w-7 h-7 shrink-0 -mt-1 -mr-1 text-slate-400 hover:text-cyan-600">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
      {/* v3.09 — the whole point of this release: a weight input per round,
          right here on the participant's own row, so recording a weigh-in
          no longer needs the pencil button/a separate dialog at all.
          Purely local (resultsDraft) until "Запази" in the dialog's own
          footer below — see saveParticipantsResults. */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5 pb-0.5">
        {draftResults.map((w, i) => (
          <div key={i} className="flex items-center gap-1">
            {roundsCount > 1 && (
              <span className="text-[10px] text-slate-400 dark:text-muted-foreground shrink-0">{t("wb.roundLabel")} {i + 1}</span>
            )}
            <Input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              placeholder={t("wb.kg")}
              value={w}
              onChange={(e) => updateResultDraft(r.id, i, e.target.value)}
              className="h-8 w-[76px] text-xs px-2"
            />
          </div>
        ))}
      </div>
      {r.registered_by_email && (
        <p className="text-xs text-slate-500 dark:text-muted-foreground flex items-center gap-1">
          {/* v3.03 — masked (see src/lib/emailMask.js): the organizer can
              still tell registrations apart by account without seeing
              another user's full email — the "Съобщение до участниците"/
              CSV-export flows below reach the real address server-side. */}
          <Mail className="w-3 h-3 shrink-0" /> {t("wb.registeredByAccount")}: {maskEmail(r.registered_by_email)}
        </p>
      )}
      {/* v2.90 — set only by the organizer's "assign to user" action
          (reassignParticipant) — the account that now actually owns this
          registration, when it differs from whoever originally submitted
          it above. */}
      {r.assigned_user_email && (
        <p className="text-xs text-cyan-700 dark:text-cyan-400 flex items-center gap-1 font-medium">
          <ArrowRightLeft className="w-3 h-3 shrink-0" /> {t("wb.assignedToAccount")}: {maskEmail(r.assigned_user_email)}
        </p>
      )}
      {r.participant_phone && (
        <p className="text-xs text-slate-500 dark:text-muted-foreground flex items-center gap-1">
          <Phone className="w-3 h-3 shrink-0" /> {r.participant_phone}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-accent text-slate-600 dark:text-muted-foreground">
          {t(PAYMENT_STATUS_LABEL_KEYS[r.payment_status] || "wb.paymentStatusPending")}
        </span>
        {/* v2.83 — set once the organizer runs "Тегли жребий" below. */}
        {r.assigned_box != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
            {t("wb.competitionSector")} {r.assigned_sector} — {t("wb.assignedBox")} {r.assigned_box}
          </span>
        )}
        {total > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t("wb.totalWeight")}: {total} {t("wb.kg")}
          </span>
        )}
        {/* v2.89 — overall standing (penalty points first, total weight as
            tie-break — see rankByPenaltyAndWeight), shown only once this
            participant has at least one scored round. */}
        {ranked && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            {t("comp.standings")} #{ranked.rank} · {ranked.penalty} {t("comp.pointsUnit")}
          </span>
        )}
      </div>
      {/* v2.89 — per-round placing within the participant's own sector (see
          roundSectorPoints); a round with no points yet (not weighed in yet
          for anyone in the sector, or no box assigned) simply isn't shown
          for that round. */}
      {roundsCount > 1 && roundPoints.some((p) => typeof p === "number") && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {roundPoints.map((p, i) => typeof p === "number" && (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
              {t("wb.roundLabel")} {i + 1}: {p} {t("comp.pointsUnit")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
  // v2.83 — null = creating a new competition (compFor says for which water
  // body); an object = editing that existing competition instead.
  const [compEditing, setCompEditing] = useState(null);
  const [compForm, setCompForm] = useState({
    title: "", fishing_type: "", max_participants: "20", max_reserves: "5",
    conditions: "", prize_fund: "", fee: "", date: "", registration_deadline: "",
    sectors: [EMPTY_SECTOR_ROW], rounds_count: "1",
  });
  // v2.83 — editing one participant's name/phone/slot/payment status from
  // the organizer's participant list (see participantsFor below).
  // v3.09 — catch_results moved out of this dialog entirely, into inline
  // per-row inputs on the participants list itself (see resultsDraft) — this
  // form is name/phone/slot/payment status only now.
  const [editingReg, setEditingReg] = useState(null);
  const [regEditForm, setRegEditForm] = useState({ participant_name: "", participant_phone: "", slot_type: "main", payment_status: "pending" });
  // v2.90 — "assign this registration to a real system account" (see
  // reassignParticipant below): a single draft email input + busy flag,
  // reset whenever a different participant is opened for editing (openEditReg).
  const [reassignEmail, setReassignEmail] = useState("");
  const [reassigning, setReassigning] = useState(false);
  // v3.03 — "message everyone registered for this competition" (see
  // sendParticipantsMessage below): the competition the dialog is currently
  // open for, the organizer's free-text message, and a busy flag.
  const [messagingFor, setMessagingFor] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  // v2.87 — competition whose standings dialog is open. v2.89 — ranked by
  // penalty points first, total catch weight only as the tie-break — see
  // rankByPenaltyAndWeight. v2.92 — generatingImage backs the "Изтегли
  // като снимка" button (src/lib/standingsImage.js draws its own canvas
  // now, no DOM screenshot involved).
  const [standingsFor, setStandingsFor] = useState(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  // v2.94 — separate busy flag for the "Списък участници" button (next to
  // "Класиране" in the participants dialog footer): its own
  // downloadParticipantsImage call, kept independent of generatingImage so
  // clicking one button never shows the other's spinner.
  const [generatingParticipantsImage, setGeneratingParticipantsImage] = useState(false);
  // v3.07 — separate busy flag for the new "Изтегли жребий (снимка)" button
  // (participants dialog footer, shown once a draw has happened) — its own
  // downloadDrawResultsImage call, same independent-spinner reasoning as
  // generatingParticipantsImage above.
  const [generatingDrawResultsImage, setGeneratingDrawResultsImage] = useState(false);
  // v2.94 — "assign an owner to a water body the admin created/still owns"
  // (see reassignWaterBodyOwner below) — same email-draft + busy-id pattern
  // as AdminTraders.jsx's own reassignOwner, now also reachable from here
  // (admin-only) since this is where admin already manages every water body
  // day to day (v2.78), not just from the separate "Търговци" screen.
  const [reassignOwnerEmail, setReassignOwnerEmail] = useState({});
  const [reassigningOwnerId, setReassigningOwnerId] = useState("");
  const [sectorAvail, setSectorAvail] = useState([]);
  const [sectorRes, setSectorRes] = useState([]);
  // v3.14 — busy-id for deleteSectorAvailability below, same pattern as
  // deletingCompId. calendarView toggles the list/calendar display per
  // availability id (keyed by SectorAvailability.id, default = list).
  const [deletingAvailId, setDeletingAvailId] = useState("");
  const [calendarView, setCalendarView] = useState({});
  const [showSectorForm, setShowSectorForm] = useState(false);
  const [sectorFor, setSectorFor] = useState(null);
  // v3.04 — was a flat box count + flat label list; now the same named
  // {name, boxCount, boxes} sector-row shape the competition form already
  // uses (see EMPTY_SECTOR_ROW/compForm.sectors above), so a water body's
  // general reservation places can also be grouped into named sectors, not
  // just one flat list of boxes.
  const [sectorForm, setSectorForm] = useState({ date: "", end_date: "", fee_per_person: "", working_hours: "", sectors: [EMPTY_SECTOR_ROW] });
  // v2.96 — scheme/layout reference photo, uploaded from the same sector
  // declaration dialog but saved straight onto the WaterBody itself (see
  // uploadSchemeImage below and the column comment in
  // server/schema/entities.generated.ts) rather than onto the
  // SectorAvailability row, since a water body's physical layout doesn't
  // change between different reservation-date declarations.
  const [uploadingSchemeImage, setUploadingSchemeImage] = useState(false);
  const [editWb, setEditWb] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");
  // v3.21 — the water body pending a brochure download, while
  // BrochureContactDialog is open asking for an optional contact line.
  const [brochureTarget, setBrochureTarget] = useState(null);
  // v2.91 — "delete a closed competition" (see deleteClosedCompetition).
  const [deletingCompId, setDeletingCompId] = useState("");
  // v2.80 — participant list + CSV export for a competition, per the
  // organizer's request: see participantsFor/regsFor/exportRegistrations.
  const [participantsFor, setParticipantsFor] = useState(null);
  // v2.94 — manual drag-and-drop reordering of the participants list (see
  // startParticipantsReorder/finishParticipantsReorder/onParticipantsDragEnd
  // below), same on/off-switch-IS-the-save-action pattern as AdminSetup.jsx's
  // menu reorder (v2.88). orderDraft holds registration IDs in draft order
  // while the switch is on; reset to null/false whenever the participants
  // dialog is opened for a (possibly different) competition or closed, so a
  // stale draft never leaks between competitions.
  const [reorderParticipants, setReorderParticipants] = useState(false);
  const [participantsOrderDraft, setParticipantsOrderDraft] = useState(null);
  const [savingParticipantsOrder, setSavingParticipantsOrder] = useState(false);
  // v3.09 — inline catch-results entry, right in the participants dialog:
  // one weight-per-round draft, keyed by registration id, seeded from
  // whatever's already saved whenever the dialog opens (openParticipants)
  // and edited in place by each ParticipantRow's own inputs
  // (updateResultDraft) — no separate per-participant dialog needed just to
  // record a weigh-in anymore. Nothing here touches the server until the
  // organizer presses "Запази" (saveParticipantsResults); "Отказ" just
  // discards the draft, same as closing without saving. Also the reason the
  // participants dialog itself no longer closes on an outside click/Escape
  // (see its DialogContent props below) — losing an afternoon's worth of
  // typed-in weights to a stray click was exactly the failure mode this
  // whole feature exists to prevent.
  const [resultsDraft, setResultsDraft] = useState({});
  const [savingResults, setSavingResults] = useState(false);

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
    setCompEditing(null);
    setCompForm({
      title: "", fishing_type: "", max_participants: "20", max_reserves: "5",
      conditions: "", prize_fund: "", fee: "", date: "", registration_deadline: "",
      sectors: [EMPTY_SECTOR_ROW], rounds_count: "1",
    });
    setShowCompForm(true);
  }

  // v2.83 — edit an existing competition (title, fishing type, capacity,
  // fee, dates, conditions, and its sectors/boxes config). Same dialog as
  // create, just prefilled and routed to update() on submit.
  function openEditCompForm(comp) {
    setCompFor(null);
    setCompEditing(comp);
    // parseSectorsConfig returns {name, boxes} only — boxCount is a
    // form-only convenience field, so it's derived here from boxes.length
    // for display (see updateSectorRow for how it's kept in sync afterward).
    const parsed = parseSectorsConfig(comp.sectors_config).map((s) => ({ ...s, boxCount: String(s.boxes.length) }));
    setCompForm({
      title: comp.title || "",
      fishing_type: fishingTypeLabel(comp.fishing_type, t),
      max_participants: String(comp.max_participants ?? "20"),
      max_reserves: String(comp.max_reserves ?? "5"),
      conditions: comp.conditions || "",
      prize_fund: comp.prize_fund || "",
      fee: comp.fee ? String(comp.fee) : "",
      date: toDatetimeLocal(comp.date),
      registration_deadline: toDatetimeLocal(comp.registration_deadline),
      sectors: parsed.length > 0 ? parsed : [EMPTY_SECTOR_ROW],
      rounds_count: String(comp.rounds_count || 1),
    });
    setShowCompForm(true);
  }

  // v2.85 — clone an existing competition as the starting point for a new
  // one, mainly so its sectors/boxes config doesn't have to be retyped by
  // hand. Opens the same dialog in CREATE mode (compEditing stays null, so
  // saveCompetition makes a brand-new row) prefilled from `comp` — except
  // the date/deadline, left blank on purpose: the date input is required,
  // so the organizer has to consciously pick a new date rather than risk
  // accidentally duplicating the source competition's own date. Participants
  // and any existing draw are naturally NOT copied, since this creates a
  // fresh competition with no registrations of its own.
  function openCloneCompForm(wb, comp) {
    setCompFor(wb);
    setCompEditing(null);
    const parsed = parseSectorsConfig(comp.sectors_config).map((s) => ({ ...s, boxCount: String(s.boxes.length) }));
    setCompForm({
      title: comp.title || "",
      fishing_type: fishingTypeLabel(comp.fishing_type, t),
      max_participants: String(comp.max_participants ?? "20"),
      max_reserves: String(comp.max_reserves ?? "5"),
      conditions: comp.conditions || "",
      prize_fund: comp.prize_fund || "",
      fee: comp.fee ? String(comp.fee) : "",
      date: "",
      registration_deadline: "",
      sectors: parsed.length > 0 ? parsed : [EMPTY_SECTOR_ROW],
      rounds_count: String(comp.rounds_count || 1),
    });
    setShowCompForm(true);
  }

  function addSectorRow() {
    setCompForm((f) => ({ ...f, sectors: [...f.sectors, EMPTY_SECTOR_ROW] }));
  }

  // v2.84 — changing boxCount resizes `boxes` to match: growing appends
  // default labels ("1", "2", ...) for the new slots, shrinking just
  // truncates (any custom labels already typed into the kept slots are left
  // alone). boxCount itself is kept only as the input's own display value —
  // stringifySectorsConfig never looks at it, only at `boxes`.
  function updateSectorRow(index, field, value) {
    setCompForm((f) => {
      const sectors = f.sectors.slice();
      if (field === "boxCount") {
        const n = Math.max(0, Number(value) || 0);
        const oldBoxes = sectors[index].boxes || [];
        const boxes = oldBoxes.slice(0, n);
        for (let i = boxes.length; i < n; i++) boxes.push(String(i + 1));
        sectors[index] = { ...sectors[index], boxCount: value, boxes };
      } else {
        sectors[index] = { ...sectors[index], [field]: value };
      }
      return { ...f, sectors };
    });
  }

  // v2.84 — edits one individual box's own label within a sector, e.g.
  // renaming the auto-generated "3" to "VIP-1" or leaving gaps.
  function updateBoxLabel(sectorIndex, boxIndex, value) {
    setCompForm((f) => {
      const sectors = f.sectors.slice();
      const boxes = (sectors[sectorIndex].boxes || []).slice();
      boxes[boxIndex] = value;
      sectors[sectorIndex] = { ...sectors[sectorIndex], boxes };
      return { ...f, sectors };
    });
  }

  function removeSectorRow(index) {
    setCompForm((f) => ({ ...f, sectors: f.sectors.filter((_, i) => i !== index) }));
  }

  function openEditForm(wb) {
    setEditWb(wb);
    setShowEditForm(true);
  }

  // v2.69 — printable brochure whose QR identifies this water body directly
  // (see src/lib/brochure.js / server/routes/merchantReferrals.ts).
  // v3.21 — now takes the free-text contact line collected by
  // BrochureContactDialog (may be empty — entirely optional).
  async function handleDownloadBrochure(wb, contactText) {
    setDownloadingId(wb.id);
    try {
      await downloadInviteBrochure({
        name: wb.name,
        link: getMerchantBrochureLink("water_body", wb.id),
        filename: `catchcount-broshura-${(wb.name || "vodoem").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.pdf`,
        contactText,
      });
      setBrochureTarget(null);
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
    // v3.06 — was always reset to a blank 10-box default every time; now
    // pre-fills from the water body's own last-used layout
    // (WaterBody.default_sectors_config, saved by createSectorAvailability
    // below every time a new opening is created) so an owner who reopens
    // reservations for the same water body doesn't have to re-type the same
    // sectors/boxes each time — they can still edit or replace it here
    // before saving. Falls back to the same blank 10-box default as before
    // when the water body has never had one saved yet.
    const remembered = parseSectorsConfig(wb.default_sectors_config);
    const n = 10;
    const sectors = remembered.length > 0
      ? remembered.map((s) => ({
          name: s.name || "",
          boxCount: String((s.boxes || []).length),
          boxes: [...(s.boxes || [])],
        }))
      : [{ name: "", boxCount: String(n), boxes: Array.from({ length: n }, (_, i) => String(i + 1)) }];
    setSectorForm({
      date: "",
      end_date: "",
      fee_per_person: wb.fee_per_person ? String(wb.fee_per_person) : "",
      // v3.06 — pre-filled from the water body's own working hours, editable
      // per period below.
      working_hours: wb.working_hours || "",
      sectors,
    });
    setShowSectorForm(true);
  }

  // v3.04 — same row-editing behavior as the competition form's
  // addSectorRow/updateSectorRow/updateBoxLabel/removeSectorRow above, just
  // operating on sectorForm.sectors instead of compForm.sectors (kept as
  // separate functions rather than shared, since the two forms' state lives
  // in different pieces of state and this is simpler than threading a setter
  // through).
  function addResSectorRow() {
    setSectorForm((f) => ({ ...f, sectors: [...f.sectors, EMPTY_SECTOR_ROW] }));
  }

  function updateResSectorRow(index, field, value) {
    setSectorForm((f) => {
      const sectors = f.sectors.slice();
      if (field === "boxCount") {
        const n = Math.max(0, Number(value) || 0);
        const oldBoxes = sectors[index].boxes || [];
        const boxes = oldBoxes.slice(0, n);
        for (let i = boxes.length; i < n; i++) boxes.push(String(i + 1));
        sectors[index] = { ...sectors[index], boxCount: value, boxes };
      } else {
        sectors[index] = { ...sectors[index], [field]: value };
      }
      return { ...f, sectors };
    });
  }

  function updateResBoxLabel(sectorIndex, boxIndex, value) {
    setSectorForm((f) => {
      const sectors = f.sectors.slice();
      const boxes = (sectors[sectorIndex].boxes || []).slice();
      boxes[boxIndex] = value;
      sectors[sectorIndex] = { ...sectors[sectorIndex], boxes };
      return { ...f, sectors };
    });
  }

  function removeResSectorRow(index) {
    setSectorForm((f) => ({ ...f, sectors: f.sectors.filter((_, i) => i !== index) }));
  }

  // v2.96 — uploaded once per water body and reused for every future sector
  // declaration; saves straight onto WaterBody.scheme_image_url (Postgres-
  // backed storage via UploadFile, same mechanism as ad logos/catch photos).
  async function uploadSchemeImage(file) {
    if (!file || !sectorFor) return;
    setUploadingSchemeImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.WaterBody.update(sectorFor.id, { scheme_image_url: file_url });
      setSectorFor((f) => (f ? { ...f, scheme_image_url: file_url } : f));
      toast({ title: t("wb.schemeImageUploaded") });
      await load();
    } catch (err) {
      toast({ title: t("wb.errorSaving"), description: err.message, variant: "destructive" });
    } finally {
      setUploadingSchemeImage(false);
    }
  }

  async function removeSchemeImage() {
    if (!sectorFor) return;
    try {
      await base44.entities.WaterBody.update(sectorFor.id, { scheme_image_url: "" });
      setSectorFor((f) => (f ? { ...f, scheme_image_url: "" } : f));
      await load();
    } catch (err) {
      toast({ title: t("wb.errorSaving"), description: err.message, variant: "destructive" });
    }
  }

  async function createSectorAvailability(e) {
    e.preventDefault();
    if (!sectorFor) return;
    // v3.04 — total_sectors is now DERIVED from the sector rows (it still
    // drives the free/taken count everywhere that reads it, e.g.
    // SectorReservations.jsx), not typed in directly.
    const total = totalBoxes(sectorForm.sectors);
    if (total < 1) {
      toast({ title: t("wb.errorCreating"), description: t("wb.needAtLeastOneBox"), variant: "destructive" });
      return;
    }
    try {
      await base44.entities.SectorAvailability.create({
        water_body_id: sectorFor.id,
        water_body_name: sectorFor.name,
        date: sectorForm.date,
        end_date: sectorForm.end_date || sectorForm.date,
        total_sectors: total,
        fee_per_person: sectorForm.fee_per_person ? Number(sectorForm.fee_per_person) : 0,
        sectors_config: stringifySectorsConfig(sectorForm.sectors),
        working_hours: sectorForm.working_hours || "",
        status: "open",
      });
      // v3.06 — best-effort: remember this layout on the water body itself
      // so the next time reservations are opened for it, openSectorForm
      // above pre-fills from it instead of resetting to a blank default.
      // Never blocks/fails the actual opening above if this write can't go
      // through yet (e.g. the v3.06 migration not applied on this DB yet).
      try {
        await base44.entities.WaterBody.update(sectorFor.id, {
          default_sectors_config: stringifySectorsConfig(sectorForm.sectors),
        });
      } catch (err) {
        console.error("Failed to remember sector layout on water body:", err);
      }
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

  // v3.14 — delete a CLOSED reservation period (the site owner's own
  // request, for exactly the case shown in the screenshot: an old closed
  // period with 0 reservations left cluttering the list). Only offered
  // once status is "closed" (same "closed only" safety rule as
  // deleteClosedCompetition above — a live/open period can't be destroyed
  // by mistake) AND only when it has zero active reservations left (see
  // the button's own visibility condition below, gated on sectResFor(a.id)
  // being empty). Deliberately does NOT try to cascade-delete reservations
  // first the way deleteClosedCompetition does for registrations:
  // SectorReservation's delete rule is `owner` (the customer who made it),
  // not owner_or_relation to the water body — the water body owner has no
  // permission to delete someone else's reservation row, so this is never
  // attempted against a period that still has bookings on it.
  async function deleteSectorAvailability(avail) {
    if (!window.confirm(t("wb.confirmDeletePeriod"))) return;
    setDeletingAvailId(avail.id);
    try {
      await base44.entities.SectorAvailability.delete(avail.id);
      toast({ title: t("wb.periodDeleted") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setDeletingAvailId("");
    }
  }

  function sectAvailFor(wbId) {
    return sectorAvail.filter((a) => a.water_body_id === wbId);
  }

  function sectResFor(availId) {
    return sectorRes.filter((r) => r.availability_id === availId);
  }

  // v2.83 — handles both create (compEditing === null) and edit
  // (compEditing === the competition being changed) through the one dialog.
  //
  // v2.85 — the draw is meant to be one-shot (see drawLotsFor), and editing
  // the competition is the one deliberate escape hatch: saving an edit to a
  // competition that already has a draw clears every participant's
  // assigned_sector/assigned_box, which both un-blocks drawLotsFor and makes
  // sure no one is left with a box assignment that no longer matches a
  // possibly-changed sectors/boxes config. Confirmed first since it's
  // destructive to existing assignments.
  async function saveCompetition(e) {
    e.preventDefault();
    const payload = {
      title: compForm.title,
      fishing_type: compForm.fishing_type,
      max_participants: Number(compForm.max_participants),
      max_reserves: Number(compForm.max_reserves),
      conditions: compForm.conditions,
      prize_fund: compForm.prize_fund,
      fee: compForm.fee ? Number(compForm.fee) : 0,
      date: compForm.date ? new Date(compForm.date).toISOString() : null,
      registration_deadline: compForm.registration_deadline ? new Date(compForm.registration_deadline).toISOString() : null,
      sectors_config: stringifySectorsConfig(compForm.sectors),
      rounds_count: Math.max(1, Number(compForm.rounds_count) || 1),
    };
    try {
      if (compEditing) {
        const drawnRegs = regsFor(compEditing.id).filter((r) => r.assigned_box != null);
        if (drawnRegs.length > 0 && !window.confirm(t("wb.confirmEditResetsDraw"))) return;
        await base44.entities.Competition.update(compEditing.id, payload);
        if (drawnRegs.length > 0) {
          await base44.entities.CompetitionRegistration.bulkUpdate(
            drawnRegs.map((r) => ({ id: r.id, assigned_sector: null, assigned_box: null }))
          );
        }
        toast({ title: t("wb.competitionUpdated") });
      } else {
        if (!compFor) return;
        await base44.entities.Competition.create({
          water_body_id: compFor.id,
          water_body_name: compFor.name,
          ...payload,
          status: "open",
        });
        toast({ title: t("wb.competitionCreated") });
      }
      setShowCompForm(false);
      setCompEditing(null);
      await load();
    } catch (err) {
      toast({ title: compEditing ? t("wb.errorSaving") : t("wb.errorCreating"), description: err.message, variant: "destructive" });
    }
  }

  // v2.83 — random box-per-participant draw. Only MAIN-slot registrations
  // are drawn (reserves aren't guaranteed a spot until promoted), and only
  // when the competition has at least one sector/box configured.
  //
  // v2.85 — the draw is now one-shot: once any main participant has a box
  // assigned, this refuses to run again outright (no more "confirm to
  // overwrite"). The only way to draw again is to edit the competition
  // (openEditCompForm/saveCompetition), which explicitly clears the old
  // assignments as part of saving — see saveCompetition above.
  async function drawLotsFor(comp) {
    const sectors = parseSectorsConfig(comp.sectors_config);
    const boxCount = totalBoxes(sectors);
    if (boxCount === 0) {
      toast({ title: t("wb.noBoxesConfigured"), variant: "destructive" });
      return;
    }
    const mainRegs = regsFor(comp.id).filter((r) => r.slot_type !== "reserve");
    if (mainRegs.length === 0) {
      toast({ title: t("wb.noMainParticipants"), variant: "destructive" });
      return;
    }
    const alreadyDrawn = mainRegs.some((r) => r.assigned_box != null);
    if (alreadyDrawn) {
      toast({ title: t("wb.drawAlreadyDone"), variant: "destructive" });
      return;
    }
    try {
      const assignments = drawBoxes(mainRegs, sectors);
      const assignedIds = new Set(assignments.map((a) => a.id));
      // v3.09 — a (re)draw always wipes every participant's already-entered
      // catch results, main AND reserve — the organizer's own request: once
      // boxes are drawn again, whatever weights were typed in against the
      // OLD sector layout no longer mean anything (sector penalty points
      // are computed from assigned_sector, which just changed under them),
      // so nothing stale should survive into the new draw. mainRegs get it
      // bundled with their new assigned_sector/box; anyone else (reserves,
      // or in principle any regs not in this draw) only gets touched if
      // they actually have a result to clear.
      const allRegs = regsFor(comp.id);
      const updates = [
        ...assignments.map((a) => ({ id: a.id, assigned_sector: a.sector, assigned_box: a.box, catch_results: null })),
        ...allRegs.filter((r) => !assignedIds.has(r.id) && r.catch_results).map((r) => ({ id: r.id, catch_results: null })),
      ];
      await base44.entities.CompetitionRegistration.bulkUpdate(updates);
      // Keep the inline results draft (see resultsDraft/openParticipants)
      // in sync immediately if the participants dialog happens to be open
      // for this same competition — otherwise its fields would keep
      // showing the just-cleared old weights until the next full reopen.
      if (participantsFor?.id === comp.id) {
        const roundsCount = Math.max(1, comp.rounds_count || 1);
        const blank = Array.from({ length: roundsCount }, () => "");
        setResultsDraft((d) => {
          const next = { ...d };
          for (const r of allRegs) next[r.id] = blank.slice();
          return next;
        });
      }
      toast({ title: t("wb.drawSuccess") });
      await load();
      // v3.07 — sent automatically, every time a draw runs (first draw AND
      // any re-draw after an edit) — see server/routes/functions.ts's
      // "notify-draw-results" for the full rationale. Deliberately AFTER
      // the success toast/reload above and in its own try/catch: an email
      // hiccup must never make the draw itself look like it failed, since
      // the draw already fully succeeded by this point.
      try {
        const res = await base44.functions.invoke("notify-draw-results", { competition_id: comp.id });
        if (res?.notified > 0) {
          toast({ title: t("wb.drawResultsEmailed") });
        }
      } catch { /* best-effort — the draw itself already succeeded */ }
    } catch (err) {
      if (err.message === NOT_ENOUGH_BOXES) {
        toast({ title: t("wb.notEnoughBoxes"), description: `${mainRegs.length} / ${boxCount}`, variant: "destructive" });
      } else {
        toast({ title: t("common.couldNotLoad"), description: err.message, variant: "destructive" });
      }
    }
  }

  // v3.09 — no longer takes/uses roundsCount or touches catch_results at
  // all (see resultsDraft/updateResultDraft/saveParticipantsResults above) —
  // this is purely name/phone/slot/payment status now.
  function openEditReg(r) {
    setEditingReg(r);
    setRegEditForm({
      participant_name: r.participant_name || "",
      participant_phone: r.participant_phone || "",
      slot_type: r.slot_type || "main",
      payment_status: r.payment_status || "pending",
    });
    setReassignEmail("");
  }

  async function saveRegEdit() {
    if (!editingReg) return;
    try {
      await base44.entities.CompetitionRegistration.update(editingReg.id, {
        participant_name: regEditForm.participant_name,
        participant_phone: regEditForm.participant_phone,
        slot_type: regEditForm.slot_type,
        payment_status: regEditForm.payment_status,
        // v2.94 — editing a participant used to also bump list_order_at,
        // pushing them to the end of the list (v2.90's original behavior).
        // The organizer asked for that to stop: editing name/phone/status
        // no longer touches their position — list_order_at is now ONLY
        // ever set by the manual drag-and-drop reorder below
        // (saveManualOrder), so a participant's spot in the list stays put
        // through any number of edits.
      });
      toast({ title: t("wb.participantUpdated") });
      setEditingReg(null);
      await load();
    } catch (e) {
      toast({ title: t("wb.errorSaving"), description: e.message, variant: "destructive" });
    }
  }

  // v2.90 — "assign this registration to a real system account": looks up
  // a user by the typed email and moves the registration's created_by_id to
  // them (server/routes/competitionRegistrations.ts) — from then on that
  // account, not whoever originally registered them, owns this registration
  // (can edit/cancel it, see the server's owner_or_relation rule). Doesn't
  // touch list_order_at itself — that's saveRegEdit's job, so reassigning
  // alone (without changing name/phone/etc.) still doesn't reorder the list
  // unless the organizer also presses "Запази".
  async function reassignParticipant() {
    if (!editingReg || !reassignEmail.trim()) return;
    setReassigning(true);
    try {
      const res = await base44.competitionRegistrations.reassign(editingReg.id, reassignEmail.trim());
      toast({ title: t("wb.reassignSuccess"), description: res.user?.email });
      setReassignEmail("");
      setEditingReg((prev) => (prev ? { ...prev, ...res.item } : prev));
      await load();
    } catch (e) {
      toast({ title: t("wb.reassignError"), description: e.message, variant: "destructive" });
    } finally {
      setReassigning(false);
    }
  }

  async function cancelRegistrationAsOrganizer(r) {
    if (!window.confirm(t("wb.confirmCancelRegistration"))) return;
    try {
      await base44.entities.CompetitionRegistration.update(r.id, { status: "cancelled" });
      toast({ title: t("wb.registrationCancelled") });
      setEditingReg(null);
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
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

  // v2.85 — undo of closeCompetition: reopens registration on a competition
  // the organizer closed too early or wants to accept more entries for.
  async function reopenCompetition(comp) {
    try {
      await base44.entities.Competition.update(comp.id, { status: "open" });
      toast({ title: t("wb.registrationReopened") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    }
  }

  function regsFor(compId) {
    return registrations.filter((r) => r.competition_id === compId && r.status === "active");
  }

  // v2.91 — organizer's request: permanently delete a competition that's no
  // longer accepting registrations (registration already closed — a
  // competition that's still "open" has no delete option, only close/
  // reopen, to avoid accidentally destroying a live event). Also cleans up
  // every registration under it first — competition_id on
  // competition_registrations is a plain TEXT column, not a real foreign
  // key (see schema.sql), so nothing does this automatically and an
  // orphaned participant list would otherwise be left behind with no
  // competition to belong to. Both deletes go through the existing generic
  // entity rules (Competition.delete = owner; CompetitionRegistration.delete
  // = owner_or_relation, which already covers "the competition's own
  // organizer") — no new endpoint needed.
  async function deleteClosedCompetition(comp) {
    if (!window.confirm(t("wb.confirmDeleteCompetition"))) return;
    setDeletingCompId(comp.id);
    try {
      const allRegs = registrations.filter((r) => r.competition_id === comp.id);
      for (const r of allRegs) {
        await base44.entities.CompetitionRegistration.delete(r.id);
      }
      await base44.entities.Competition.delete(comp.id);
      toast({ title: t("wb.competitionDeleted") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setDeletingCompId("");
    }
  }

  // v2.80 — one CSV cell must never break the file just because a name or
  // phone happens to contain a comma/quote/newline: wrap in quotes and
  // double up any embedded quote, the standard CSV escaping rule.
  function csvCell(value) {
    const s = value == null ? "" : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  }

  // v3.14 — moved to module scope (near ParticipantRow, which also needs
  // it) — see that component's own comment for why.
  function exportParticipantsCsv(comp) {
    const regs = regsFor(comp.id);
    const header = [
      t("wb.participantName"),
      t("wb.participantPhone"),
      t("wb.slotType"),
      t("wb.registeredByAccount"),
      t("wb.paymentStatus"),
      t("wb.competitionSector"),
      t("wb.assignedBox"),
    ];
    const rows = regs.map((r) => [
      r.participant_name || "",
      r.participant_phone || "",
      r.slot_type === "reserve" ? t("comp.reserves") : t("comp.participants"),
      r.registered_by_email ? maskEmail(r.registered_by_email) : "",
      t(PAYMENT_STATUS_LABEL_KEYS[r.payment_status] || "wb.paymentStatusPending"),
      r.assigned_sector || "",
      r.assigned_box != null ? String(r.assigned_box) : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    // — UTF-8 BOM so Excel on Windows (this app's whole userbase, per
    // the device-bridge platform: win32) opens Cyrillic text correctly
    // instead of mangling it as if it were a different encoding.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uchastnici-${(comp.title || "sastezanie").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // v3.03 — one email per registering account for this competition, listing
  // every participant that account registered, plus the organizer's own
  // free-text message — see server/routes/functions.ts's
  // "message-competition-participants" for the actual grouping/sending.
  async function sendParticipantsMessage() {
    if (!messagingFor || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      const res = await base44.functions.invoke("message-competition-participants", {
        competition_id: messagingFor.id,
        message: messageText.trim(),
      });
      // v3.16 — surface `skipped` (previously silently dropped — see
      // functions.ts's own v3.16 comment on message-competition-participants
      // for why a registration could end up here even after that fix: an
      // account whose created_by_id no longer resolves to a user at all,
      // e.g. a deleted account). The organizer sending a message now always
      // knows if someone in the list didn't actually get it, instead of a
      // plain success toast that hid the gap.
      const skippedNote = res.skipped > 0 ? ` · ${t("wb.someSkippedNoEmail").replace("{count}", res.skipped)}` : "";
      toast({ title: t("wb.messageSent"), description: `${res.notified} ${t("comp.users")}${skippedNote}` });
      setMessagingFor(null);
      setMessageText("");
    } catch (e) {
      toast({ title: t("wb.errorSending"), description: e.message, variant: "destructive" });
    } finally {
      setSendingMessage(false);
    }
  }

  // v2.94 — manual drag-and-drop reordering of the participants list. The
  // organizer's own numbers used to shift on every edit (v2.90); now the
  // ONLY way list_order_at ever changes is this explicit reorder — turning
  // the switch on drafts the current order, dragging rearranges the draft,
  // and turning the switch back off is itself the save (same "switch off =
  // save" pattern as AdminSetup.jsx's menu reorder, v2.88), writing fresh,
  // strictly increasing list_order_at timestamps (1s apart, so they always
  // sort in the intended order regardless of clock resolution) for every
  // registration via a single bulk update.
  function startParticipantsReorder(orderedRegs) {
    setParticipantsOrderDraft(orderedRegs.map((r) => r.id));
    setReorderParticipants(true);
  }

  async function finishParticipantsReorder() {
    setReorderParticipants(false);
    const toSave = participantsOrderDraft;
    setParticipantsOrderDraft(null);
    if (!toSave || toSave.length === 0) return;
    setSavingParticipantsOrder(true);
    try {
      const base = Date.now();
      const records = toSave.map((id, i) => ({ id, list_order_at: new Date(base + i * 1000).toISOString() }));
      await base44.entities.CompetitionRegistration.bulkUpdate(records);
      toast({ title: t("wb.participantsOrderSaved") });
      await load();
    } catch (e) {
      toast({ title: t("wb.errorSaving"), description: e.message, variant: "destructive" });
    } finally {
      setSavingParticipantsOrder(false);
    }
  }

  function onParticipantsDragEnd(result) {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    setParticipantsOrderDraft((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      return next;
    });
  }

  // v2.94 — opening the dialog for a (possibly different) competition
  // always starts with reorder mode off and no leftover draft, so a draft
  // built for one competition's registrations can never be saved against
  // another's.
  function openParticipants(comp) {
    setParticipantsFor(comp);
    setReorderParticipants(false);
    setParticipantsOrderDraft(null);
    // v3.09 — seed the inline results draft from what's actually saved,
    // one weight-string array per registration (blank = not weighed in
    // yet), same shape openEditReg used to build for the old per-participant
    // dialog.
    const roundsCount = Math.max(1, comp.rounds_count || 1);
    const draft = {};
    regsFor(comp.id).forEach((r) => {
      const results = parseCatchResults(r.catch_results);
      draft[r.id] = Array.from({ length: roundsCount }, (_, i) => (
        results[i] != null ? String(results[i]) : ""
      ));
    });
    setResultsDraft(draft);
  }

  function closeParticipants() {
    setParticipantsFor(null);
    setReorderParticipants(false);
    setParticipantsOrderDraft(null);
    setResultsDraft({});
  }

  // v3.09 — one round's weight input for one participant, edited in place
  // in the participants list (see ParticipantRow below). Purely local until
  // "Запази" (saveParticipantsResults) actually writes it.
  function updateResultDraft(regId, index, value) {
    setResultsDraft((d) => {
      const arr = (d[regId] || []).slice();
      arr[index] = value;
      return { ...d, [regId]: arr };
    });
  }

  // v3.09 — commits every changed inline result in one bulk call (only
  // registrations whose draft actually differs from what's saved, so an
  // organizer who only touched one participant's weight doesn't churn
  // updated_at on everyone else's row too), then closes the dialog — same
  // "Запази"/"Отказ" pair, both of which close it, since it no longer closes
  // on outside click/Escape (see the DialogContent props below).
  async function saveParticipantsResults() {
    if (!participantsFor) return;
    setSavingResults(true);
    try {
      const regs = regsFor(participantsFor.id);
      const updates = [];
      for (const r of regs) {
        const draft = resultsDraft[r.id];
        if (!draft) continue;
        const newStr = stringifyCatchResults(draft);
        const oldStr = JSON.stringify(parseCatchResults(r.catch_results));
        if (newStr !== oldStr) updates.push({ id: r.id, catch_results: newStr });
      }
      if (updates.length > 0) {
        await base44.entities.CompetitionRegistration.bulkUpdate(updates);
        toast({ title: t("wb.resultsSaved") });
        await load();
      }
      closeParticipants();
    } catch (e) {
      toast({ title: t("wb.errorSaving"), description: e.message, variant: "destructive" });
    } finally {
      setSavingResults(false);
    }
  }

  // v2.89 — "generate on request" image export for the standings dialog,
  // nothing pre-rendered or stored server-side. v2.91/v2.92 — now drawn
  // entirely by the shared src/lib/standingsImage.js (own canvas rendering
  // of the ranked list, the water body's REAL brochure embedded unchanged
  // at the bottom) instead of an html2canvas screenshot of the dialog — see
  // that module's own comment for the full design rationale.
  async function handleDownloadStandingsImage(comp) {
    setGeneratingImage(true);
    try {
      const roundsCount = Math.max(1, comp.rounds_count || 1);
      await downloadStandingsImage({
        ranked: rankByPenaltyAndWeight(regsFor(comp.id), roundsCount),
        title: comp.title,
        competition: comp,
        waterBody: wbMap[comp.water_body_id],
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
  // registration (independent of whether the competition has a draw or any
  // results yet) so a participant/organizer can show how many people have
  // joined and share it, along with the water body's own brochure, to help
  // promote the competition and the app. Same shared canvas renderer as
  // handleDownloadStandingsImage above (see standingsImage.js), just fed
  // the raw registrations instead of a ranked list — ordering/numbering by
  // registration order happens inside downloadParticipantsImage itself.
  async function handleDownloadParticipantsImage(comp) {
    setGeneratingParticipantsImage(true);
    try {
      await downloadParticipantsImage({
        registrations: regsFor(comp.id),
        title: comp.title,
        competition: comp,
        waterBody: wbMap[comp.water_body_id],
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

  // v3.07 — "who drew which box" image, downloadable once drawLotsFor has
  // run — see this module's own request/rationale on that function. Shown
  // right next to "Изтегли CSV" in the participants dialog footer, only
  // once at least one registration has a drawn box (see the button's own
  // conditional render below), so there's never an empty/pointless image.
  async function handleDownloadDrawResultsImage(comp) {
    setGeneratingDrawResultsImage(true);
    try {
      await downloadDrawResultsImage({
        registrations: regsFor(comp.id),
        title: comp.title,
        competition: comp,
        waterBody: wbMap[comp.water_body_id],
        filename: `zhrebiy-${(comp.title || "sastezanie").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.png`,
        t,
        lang,
      });
    } catch (e) {
      toast({ title: t("comp.errorGeneratingImage"), description: e.message, variant: "destructive" });
    } finally {
      setGeneratingDrawResultsImage(false);
    }
  }

  // v2.94 — "assign an owner to a water body the admin created/still owns"
  // — same pattern as AdminTraders.jsx's own reassignOwner/grantMerchantRole
  // (look a registered user up by email, PATCH created_by_id through the
  // dedicated admin-only endpoint since it's excluded from the generic
  // entity-update path, then fold "water_owner" into their roles), just
  // reachable from here too since admin already manages every water body
  // from this page (v2.78) — see this file's own isAdmin comment above.
  async function grantMerchantRole(userId) {
    if (!userId) return;
    try {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId });
      const u = users && users[0];
      if (!u) return;
      const currentRoles = effectiveRoles(u);
      const newRoles = currentRoles.includes("water_owner") ? currentRoles : [...currentRoles, "water_owner"];
      const newRole = highestRole(newRoles);
      await base44.asServiceRole.entities.User.update(u.id, { roles: newRoles, role: newRole });
    } catch (e) {
      console.error("Failed to grant merchant role:", e);
    }
  }

  async function reassignWaterBodyOwner(wb) {
    const email = (reassignOwnerEmail[wb.id] || "").trim();
    if (!email) return;
    setReassigningOwnerId(wb.id);
    try {
      const users = await base44.entities.User.filter({ email });
      const target = users && users[0];
      if (!target) {
        toast({ title: t("at.userNotFound"), variant: "destructive" });
        return;
      }
      await base44.admin.merchants.reassignOwner("water_body", wb.id, target.id);
      await grantMerchantRole(target.id);
      toast({ title: t("at.ownerChanged") });
      setReassignOwnerEmail((f) => ({ ...f, [wb.id]: "" }));
      await load();
    } catch (e) {
      toast({ title: t("wb.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setReassigningOwnerId("");
    }
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
              {/* v2.86 — name/location on its own full-width row, action
                  buttons in a SEPARATE row right below it (not beside the
                  name). Previously this was one "justify-between" row with
                  name on the left and buttons on the right, which squeezed
                  the buttons into whatever narrow space was left next to the
                  name — on a phone that meant 4 buttons fighting for ~120px,
                  wrapping into a cramped, hard-to-tap column. Stacking them
                  gives the button row the FULL card width to wrap in, same
                  pattern already used for each competition card's own button
                  row below. */}
              <div className="space-y-2">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800 dark:text-foreground break-words">{wb.name}</h2>
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
                    onClick={() => setBrochureTarget(wb)}
                    size="sm"
                    variant="outline"
                    disabled={downloadingId === wb.id}
                    className="min-h-[40px]"
                  >
                    {downloadingId === wb.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                    {t("tv.downloadBrochure")}
                  </Button>
                </div>
                {/* v2.94 — admin-only "assign an owner" control, e.g. for a
                    water body the admin created/still owns in advance
                    (before the real trader signs up) — same email-lookup +
                    reassign endpoint AdminTraders.jsx already uses, just
                    reachable here too since admin already manages every
                    water body from this page (v2.78). Not shown to a
                    non-admin owner viewing their own water body. */}
                {isAdmin && (
                  <div className="rounded-xl bg-slate-50 dark:bg-accent p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-muted-foreground flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5" /> {t("at.reassignOwner")}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder={t("at.ownerEmailPlaceholder")}
                        value={reassignOwnerEmail[wb.id] || ""}
                        onChange={(e) => setReassignOwnerEmail((f) => ({ ...f, [wb.id]: e.target.value }))}
                        className="min-h-[40px] text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reassigningOwnerId === wb.id || !reassignOwnerEmail[wb.id]}
                        onClick={() => reassignWaterBodyOwner(wb)}
                        className="min-h-[40px] shrink-0"
                      >
                        {reassigningOwnerId === wb.id ? <Loader2 className="w-4 h-4 animate-spin" /> : t("at.change")}
                      </Button>
                    </div>
                  </div>
                )}
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
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Button variant="outline" size="sm" onClick={() => openEditCompForm(c)} className="min-h-[36px] text-xs">
                            <Pencil className="w-3.5 h-3.5 mr-1" /> {t("wb.edit")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openParticipants(c)}
                            disabled={regs.length === 0}
                            className="min-h-[36px] text-xs"
                          >
                            <ClipboardList className="w-3.5 h-3.5 mr-1" /> {t("wb.participants")} ({regs.length})
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => drawLotsFor(c)} className="min-h-[36px] text-xs">
                            <Shuffle className="w-3.5 h-3.5 mr-1" /> {t("wb.drawLots")}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openCloneCompForm(wb, c)} className="min-h-[36px] text-xs">
                            <Copy className="w-3.5 h-3.5 mr-1" /> {t("wb.cloneCompetition")}
                          </Button>
                          {c.status === "open" ? (
                            <Button variant="outline" size="sm" onClick={() => closeCompetition(c)} className="min-h-[36px] text-xs">
                              {t("wb.closeRegistration")}
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => reopenCompetition(c)} className="min-h-[36px] text-xs">
                              <RotateCcw className="w-3.5 h-3.5 mr-1" /> {t("wb.reopenCompetition")}
                            </Button>
                          )}
                          {/* v2.91 — only offered once registration is
                              closed, so a live/open competition can't be
                              destroyed by mistake with one click. */}
                          {c.status === "closed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteClosedCompetition(c)}
                              disabled={deletingCompId === c.id}
                              className="min-h-[36px] text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
                            >
                              {deletingCompId === c.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                              {t("wb.deleteCompetition")}
                            </Button>
                          )}
                        </div>
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
                      // v3.14 — was formatDate (always appended a bogus
                      // hour:minute — see formatDateOnly's own comment
                      // above for why). This card's date range is a pure
                      // calendar range with no time of its own; the water
                      // body's REAL hours are a.working_hours, shown below.
                      const isMultiDay = a.end_date && a.end_date !== a.date;
                      const showCalendar = isMultiDay && calendarView[a.id];
                      return (
                        <div key={a.id} className="rounded-xl bg-slate-50 dark:bg-accent p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm text-slate-800 dark:text-foreground">{isMultiDay ? `${formatDateOnly(a.date, lang)} – ${formatDateOnly(a.end_date, lang)}` : formatDateOnly(a.date, lang)}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {sRes.length}/{a.total_sectors} {t("wb.reserved")}</span>
                                {a.fee_per_person > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">{a.fee_per_person} €</span>}
                              </div>
                              {/* v3.14 — the period's own working hours
                                  (pre-filled from the water body's default
                                  when opened, editable per period), not
                                  shown anywhere on this owner-facing card
                                  before — only the customer-facing
                                  SectorReservations.jsx had it. */}
                              {a.working_hours && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                                  <Clock className="w-3 h-3" /> {a.working_hours}
                                </div>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                              a.status === "open"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-slate-200 text-slate-600 dark:bg-accent dark:text-muted-foreground"
                            }`}>
                              {a.status === "open" ? t("wb.open") : t("wb.closed")}
                            </span>
                          </div>
                          {/* v3.14 — list/calendar toggle, multi-day periods
                              only (a single day already IS one "day view";
                              a calendar grid for it would just be one cell). */}
                          {isMultiDay && (
                            <div className="flex items-center gap-1 mt-2">
                              <Button
                                type="button"
                                variant={showCalendar ? "outline" : "secondary"}
                                size="sm"
                                onClick={() => setCalendarView((m) => ({ ...m, [a.id]: false }))}
                                className="h-7 px-2 text-xs"
                              >
                                <ListIcon className="w-3.5 h-3.5 mr-1" /> {t("wb.viewList")}
                              </Button>
                              <Button
                                type="button"
                                variant={showCalendar ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setCalendarView((m) => ({ ...m, [a.id]: true }))}
                                className="h-7 px-2 text-xs"
                              >
                                <CalendarIcon className="w-3.5 h-3.5 mr-1" /> {t("wb.viewCalendar")}
                              </Button>
                            </div>
                          )}
                          {sRes.length > 0 && !showCalendar && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {/* v3.07 — the same box number can now legitimately
                                  belong to different people on different days
                                  within a multi-day opening (see
                                  SectorReservations.jsx) — show each
                                  reservation's own date so this doesn't read
                                  as a double-booking of the same box.
                                  v3.11 — phone and approximate arrival time
                                  added: the owner's own explicit ask, so a
                                  no-show in the early hours doesn't get
                                  mistaken for a cancelled reservation when
                                  the customer simply plans to come later. */}
                              {sRes.map((r) => (
                                <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                                  {isMultiDay ? `${formatDateOnly(r.date, lang)} · ` : ""}{t("wb.sector")}.{r.sector_number} — {r.reserved_by_name}{r.reserved_by_phone ? ` · ${r.reserved_by_phone}` : ""}{r.arrival_time ? ` · 🕐 ${r.arrival_time}` : ""}{r.payment_status === "paid" ? " ✓" : " ⏳"}
                                </span>
                              ))}
                            </div>
                          )}
                          {showCalendar && (
                            <AvailabilityCalendar avail={a} reservations={sRes} t={t} lang={lang} />
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {a.status === "open" && (
                              <Button variant="outline" size="sm" onClick={() => closeSectorAvailability(a)} className="min-h-[36px] text-xs">
                                {t("wb.closeReservations")}
                              </Button>
                            )}
                            {/* v3.14 — delete an old closed period (the site
                                owner's own request) — only once it's closed
                                AND has zero active reservations left; see
                                deleteSectorAvailability's own comment for why
                                a non-empty period can't be offered this. */}
                            {a.status === "closed" && (
                              sRes.length === 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteSectorAvailability(a)}
                                  disabled={deletingAvailId === a.id}
                                  className="min-h-[36px] text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
                                >
                                  {deletingAvailId === a.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                                  {t("wb.deletePeriod")}
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-muted-foreground">{t("wb.cannotDeleteHasReservations")}</span>
                              )
                            )}
                          </div>
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

      <Dialog open={showCompForm} onOpenChange={(o) => { setShowCompForm(o); if (!o) setCompEditing(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {compEditing ? t("wb.editCompetition") : t("wb.newCompetition")} — {compEditing?.water_body_name || compFor?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveCompetition} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("wb.titleLabel")} *</Label>
              <Input value={compForm.title} onChange={(e) => setCompForm((f) => ({ ...f, title: e.target.value }))} required className="min-h-[44px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.fishingType")}</Label>
                <Input
                  value={compForm.fishing_type}
                  onChange={(e) => setCompForm((f) => ({ ...f, fishing_type: e.target.value }))}
                  placeholder={t("wb.fishingTypePlaceholder")}
                  required
                  className="min-h-[44px]"
                />
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
              <div className="space-y-1.5">
                <Label>{t("wb.roundsCount")}</Label>
                <Input type="number" min="1" value={compForm.rounds_count} onChange={(e) => setCompForm((f) => ({ ...f, rounds_count: e.target.value }))} className="min-h-[44px]" />
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

            {/* v2.83/2.84 — named sectors, each holding a list of
                INDIVIDUALLY labeled boxes. Stored as JSON on
                Competition.sectors_config (see
                src/lib/competitionSectors.js). Blank rows are silently
                dropped on save, so an unused trailing row is harmless.
                boxCount just drives how many label cells appear below each
                sector — the labels themselves (not the count) are what's
                saved, so the organizer can rename any cell to a custom
                number/name, or leave gaps, before drawing lots. */}
            <div className="space-y-1.5">
              <Label>{t("wb.sectorsBoxesConfig")}</Label>
              <div className="space-y-3">
                {compForm.sectors.map((s, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-border p-2 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        value={s.name}
                        onChange={(e) => updateSectorRow(i, "name", e.target.value)}
                        placeholder={t("wb.sectorNameLabel")}
                        className="min-h-[44px] flex-1"
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="1"
                        value={s.boxCount}
                        onChange={(e) => updateSectorRow(i, "boxCount", e.target.value)}
                        placeholder={t("wb.boxCountLabel")}
                        className="min-h-[44px] w-24"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSectorRow(i)}
                        disabled={compForm.sectors.length === 1}
                        className="min-h-[44px] shrink-0 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {s.boxes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.boxes.map((label, bi) => (
                          <Input
                            key={bi}
                            value={label}
                            onChange={(e) => updateBoxLabel(i, bi, e.target.value)}
                            title={`${t("wb.boxLabel")} ${bi + 1}`}
                            inputMode="numeric"
                            className="min-h-[40px] w-12 text-center px-1"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={addSectorRow} className="min-h-[36px] text-xs">
                  <PlusCircle className="w-3.5 h-3.5 mr-1" /> {t("wb.addSector")}
                </Button>
                <span className="text-xs text-slate-400">
                  {t("wb.totalBoxes")}: {totalBoxes(compForm.sectors)}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowCompForm(false); setCompEditing(null); }} className="min-h-[44px]">{t("wb.cancel")}</Button>
              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
                {compEditing ? t("common.save") : t("wb.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSectorForm} onOpenChange={setShowSectorForm}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
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
            <div className="space-y-1.5">
              <Label>{t("wb.feePerPerson")}</Label>
              <Input type="number" step="any" value={sectorForm.fee_per_person} onChange={(e) => setSectorForm((f) => ({ ...f, fee_per_person: e.target.value }))} className="min-h-[44px]" />
            </div>
            {/* v3.06 — pre-filled from the water body's own working_hours
                (see openSectorForm) but editable per period, since a
                specific opening (a holiday, a competition weekend) can run
                different hours than usual. Shown to whoever reserves this
                period — see SectorReservations.jsx. */}
            <div className="space-y-1.5">
              <Label>{t("common.workingHours")}</Label>
              <Input
                value={sectorForm.working_hours}
                onChange={(e) => setSectorForm((f) => ({ ...f, working_hours: e.target.value }))}
                placeholder={t("common.workingHoursPlaceholder")}
                className="min-h-[44px]"
              />
            </div>

            {/* v3.04 — was a single flat count + flat label list; now the
                same named-sectors editor the competition form uses (see
                compForm.sectors above): each sector has its own name and its
                own individually-labeled boxes. A water body that doesn't
                need groups just keeps the one default unnamed sector
                (openSectorForm's default) — nothing new to configure for
                the common case. */}
            <div className="space-y-1.5">
              <Label>{t("wb.sectorsBoxesConfig")}</Label>
              <div className="space-y-3">
                {sectorForm.sectors.map((s, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-border p-2 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        value={s.name}
                        onChange={(e) => updateResSectorRow(i, "name", e.target.value)}
                        placeholder={t("wb.sectorNameLabel")}
                        className="min-h-[44px] flex-1"
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="1"
                        value={s.boxCount}
                        onChange={(e) => updateResSectorRow(i, "boxCount", e.target.value)}
                        placeholder={t("wb.boxCountLabel")}
                        className="min-h-[44px] w-24"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeResSectorRow(i)}
                        disabled={sectorForm.sectors.length === 1}
                        className="min-h-[44px] shrink-0 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {s.boxes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.boxes.map((label, bi) => (
                          <Input
                            key={bi}
                            value={label}
                            onChange={(e) => updateResBoxLabel(i, bi, e.target.value)}
                            title={`${t("wb.boxLabel")} ${bi + 1}`}
                            inputMode="numeric"
                            className="min-h-[40px] w-12 text-center px-1"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={addResSectorRow} className="min-h-[36px] text-xs">
                  <PlusCircle className="w-3.5 h-3.5 mr-1" /> {t("wb.addSector")}
                </Button>
                <span className="text-xs text-slate-400">
                  {t("wb.totalBoxes")}: {totalBoxes(sectorForm.sectors)}
                </span>
              </div>
            </div>

            {/* v2.96 — water body layout scheme, a purely visual reference
                photo/map, uploaded once and reused across every future
                sector declaration for this water body (see
                uploadSchemeImage — saves onto WaterBody.scheme_image_url,
                not this SectorAvailability). Shown to customers in
                SectorReservations.jsx alongside the box picker. */}
            <div className="space-y-1.5">
              <Label>{t("wb.schemeImage")}</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                  {sectorFor?.scheme_image_url ? (
                    <ZoomableImage src={sectorFor.scheme_image_url} alt={t("wb.schemeImage")} className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <label className="flex-1 cursor-pointer">
                  <span className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full rounded-md border border-input bg-transparent text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                    {uploadingSchemeImage ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t("wb.uploading")}</>
                    ) : (
                      <><Upload className="w-4 h-4" /> {sectorFor?.scheme_image_url ? t("wb.changeSchemeImage") : t("wb.uploadSchemeImage")}</>
                    )}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingSchemeImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadSchemeImage(file);
                    }}
                  />
                </label>
                {sectorFor?.scheme_image_url && (
                  <button type="button" onClick={removeSchemeImage} className="text-slate-400 hover:text-red-600 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSectorForm(false)} className="min-h-[44px]">{t("wb.cancel")}</Button>
              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">{t("wb.openBtn")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* v2.80 — full participant list for one competition + CSV export.
          Each row shows the name the participant entered AND the account
          (email) that actually submitted the registration — useful when
          someone registers a family member/friend under a different name
          than their own account, so the organizer can still tell who to
          contact. */}
      {/* v3.09 — deliberately does NOT close on outside click/Escape/the
          usual corner "X" (onInteractionOutside/onEscapeKeyDown both
          preventDefault, hideCloseButton on DialogContent — see
          src/components/ui/dialog.jsx) now that this dialog holds unsaved
          inline catch-results edits (resultsDraft): a stray click used to
          silently discard whatever was just typed in. "Запази"/"Отказ" in
          the footer below are now the only way out, and onOpenChange itself
          is a no-op for the same reason — nothing should be able to close
          this from outside those two explicit actions. */}
      <Dialog open={!!participantsFor} onOpenChange={() => {}}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          hideCloseButton
          onInteractionOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-cyan-600 shrink-0" /> <span className="break-words">{t("wb.participants")} — {participantsFor?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {participantsFor && (() => {
            const regs = regsFor(participantsFor.id);
            // v2.90 — display order: whoever hasn't been manually reordered
            // yet is ordered by created_at (first to register = #1, top of
            // the list). v2.94 — editing a participant no longer bumps
            // list_order_at (that used to push them to the end on every
            // edit); the ONLY way this order changes now is the manual
            // drag-and-drop reorder below (startParticipantsReorder/
            // finishParticipantsReorder), which writes fresh list_order_at
            // values for everyone at once. Purely a display/numbering
            // concern either way — never read by
            // roundSectorPoints/rankByPenaltyAndWeight below, which only
            // ever look at assigned_sector/box/catch_results.
            const orderedRegs = regs.slice().sort((a, b) =>
              new Date(a.list_order_at || a.created_at) - new Date(b.list_order_at || b.created_at)
            );
            const seqById = new Map(orderedRegs.map((r, i) => [r.id, i + 1]));
            const regsById = new Map(regs.map((r) => [r.id, r]));
            const main = orderedRegs.filter((r) => r.slot_type !== "reserve");
            const reserve = orderedRegs.filter((r) => r.slot_type === "reserve");
            const roundsCount = Math.max(1, participantsFor.rounds_count || 1);
            // v3.09 — same live-preview trick the old per-participant editor
            // used to have (its own draftRegs, now removed along with that
            // dialog): substitute each registration's catch_results with
            // whatever's currently typed into resultsDraft (see
            // ParticipantRow's inline inputs below), falling back to the
            // saved value for anything not touched yet this session — so
            // round points and standings below update live as the organizer
            // types, not only after pressing "Запази".
            const regsWithDraft = regs.map((r) => (
              resultsDraft[r.id] ? { ...r, catch_results: stringifyCatchResults(resultsDraft[r.id]) } : r
            ));
            // v2.89 — per-round sector points (one Map per round index) and
            // the overall penalty-points ranking, both computed once here
            // from the SAME regs list every ParticipantRow reads from below,
            // so every row's numbers are always consistent with each other.
            const roundPointsMatrix = Array.from({ length: roundsCount }, (_, i) => roundSectorPoints(regsWithDraft, i));
            const rankedMap = new Map(rankByPenaltyAndWeight(regsWithDraft, roundsCount).map((x) => [x.id, x]));
            // v3.14 — ParticipantRow itself moved to module scope (see its
            // own comment there for why) — this closure only assembles the
            // per-render data it needs as props now.
            return (
              <div className="space-y-4">
                {/* v2.94 — manual drag-and-drop reordering: same
                    "switch off = save" pattern as AdminSetup.jsx's menu
                    reorder (v2.88). Only worth showing once there's more
                    than one participant to reorder. */}
                {orderedRegs.length > 1 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-accent/50">
                      <div className="text-sm text-slate-600 dark:text-muted-foreground flex items-center gap-2">
                        {savingParticipantsOrder && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
                        {t("wb.reorderParticipants")}
                      </div>
                      <Switch
                        checked={reorderParticipants}
                        onCheckedChange={(checked) => (checked ? startParticipantsReorder(orderedRegs) : finishParticipantsReorder())}
                        disabled={savingParticipantsOrder}
                      />
                    </div>
                    <p className="text-xs text-slate-400 dark:text-muted-foreground">
                      {reorderParticipants ? t("wb.reorderParticipantsHintOn") : t("wb.reorderParticipantsHintOff")}
                    </p>
                  </div>
                )}
                {reorderParticipants && participantsOrderDraft ? (
                  <DragDropContext onDragEnd={onParticipantsDragEnd}>
                    <Droppable droppableId="participants">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                          {participantsOrderDraft.map((id, index) => {
                            const r = regsById.get(id);
                            if (!r) return null;
                            return (
                              <Draggable key={id} draggableId={id} index={index}>
                                {(dragProvided, snapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                                      snapshot.isDragging
                                        ? "border-cyan-400 shadow-lg bg-white dark:bg-card"
                                        : "border-slate-100 dark:border-border bg-white dark:bg-card"
                                    }`}
                                  >
                                    <span
                                      {...dragProvided.dragHandleProps}
                                      className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-muted-foreground flex-shrink-0"
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </span>
                                    <span className="text-slate-400 dark:text-muted-foreground font-normal shrink-0">#{index + 1}</span>
                                    <span className="flex-1 min-w-0 break-words text-slate-700 dark:text-foreground">{r.participant_name}</span>
                                    {r.slot_type === "reserve" && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                                        {t("comp.reserves")}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                ) : (
                  <>
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t("comp.participants")} ({main.length}/{participantsFor.max_participants})
                      </h3>
                      {main.length === 0 ? (
                        <p className="text-xs text-slate-400">{t("wb.noParticipantsYet")}</p>
                      ) : (
                        <div className="space-y-2">
                          {main.map((r) => (
                            <ParticipantRow
                              key={r.id}
                              r={r}
                              seqById={seqById}
                              rankedMap={rankedMap}
                              roundPointsMatrix={roundPointsMatrix}
                              roundsCount={roundsCount}
                              resultsDraft={resultsDraft}
                              updateResultDraft={updateResultDraft}
                              openEditReg={openEditReg}
                              t={t}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {reserve.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {t("comp.reserves")} ({reserve.length}/{participantsFor.max_reserves})
                        </h3>
                        <div className="space-y-2">
                          {reserve.map((r) => (
                            <ParticipantRow
                              key={r.id}
                              r={r}
                              seqById={seqById}
                              rankedMap={rankedMap}
                              roundPointsMatrix={roundPointsMatrix}
                              roundsCount={roundsCount}
                              resultsDraft={resultsDraft}
                              updateResultDraft={updateResultDraft}
                              openEditReg={openEditReg}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
          <DialogFooter className="flex-wrap gap-2">
            {/* v3.09 — replaces the old plain "Затвори": since the dialog no
                longer closes on outside click (see the Dialog/DialogContent
                props above), these two are now the only way to leave it.
                "Отказ" discards resultsDraft outright (closeParticipants
                clears it); "Запази" is last in DOM order/rightmost, the
                dialog's primary action. */}
            <Button variant="outline" onClick={() => closeParticipants()} className="min-h-[44px]">{t("wb.cancel")}</Button>
            {/* v3.03 — one email per registering account, listing every
                participant they registered — see sendParticipantsMessage. */}
            <Button
              variant="outline"
              onClick={() => setMessagingFor(participantsFor)}
              className="min-h-[44px]"
            >
              <Send className="w-4 h-4 mr-1" /> {t("wb.messageParticipants")}
            </Button>
            <Button
              variant="outline"
              onClick={() => drawLotsFor(participantsFor)}
              className="min-h-[44px]"
            >
              <Shuffle className="w-4 h-4 mr-1" /> {t("wb.drawLots")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setStandingsFor(participantsFor)}
              className="min-h-[44px]"
            >
              <Trophy className="w-4 h-4 mr-1" /> {t("wb.standings")}
            </Button>
            {/* v2.94 — "who's registered so far" image, next to "Класиране"
                per the organizer's request — downloadable during
                registration, independent of any draw/results. */}
            <Button
              variant="outline"
              onClick={() => handleDownloadParticipantsImage(participantsFor)}
              disabled={generatingParticipantsImage}
              className="min-h-[44px]"
            >
              {generatingParticipantsImage ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              {t("comp.downloadParticipantsImage")}
            </Button>
            <Button
              onClick={() => exportParticipantsCsv(participantsFor)}
              className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]"
            >
              <FileDown className="w-4 h-4 mr-1" /> {t("wb.exportCsv")}
            </Button>
            {/* v3.07 — only once a draw has actually happened (at least one
                registration carries a drawn box) — no point offering an
                image that would just show everyone with no box yet.
                `participantsFor &&` guard is required here (not redundant
                with the surrounding IIFE above, which closes before this
                DialogFooter) — this whole footer renders on every page load
                regardless of whether the dialog is open, since only the
                onClick handlers above are deferred; participantsFor is null
                until a dialog is actually opened. */}
            {participantsFor && regsFor(participantsFor.id).some((r) => r.assigned_box != null) && (
              <Button
                variant="outline"
                onClick={() => handleDownloadDrawResultsImage(participantsFor)}
                disabled={generatingDrawResultsImage}
                className="min-h-[44px]"
              >
                {generatingDrawResultsImage ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                {t("wb.exportDrawResults")}
              </Button>
            )}
            {/* v3.09 — commits every inline catch-result edit at once (see
                resultsDraft/saveParticipantsResults) and closes the dialog.
                Last/rightmost — this dialog's actual primary action now that
                it can't be dismissed any other way. */}
            <Button
              onClick={saveParticipantsResults}
              disabled={savingResults}
              className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]"
            >
              {savingResults && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v3.03 — "Съобщение до участниците": one free-text message, emailed
          to every account that registered a participant for this
          competition (grouped — see sendParticipantsMessage/
          message-competition-participants). */}
      <Dialog open={!!messagingFor} onOpenChange={(o) => !o && setMessagingFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">{t("wb.messageParticipants")} — {messagingFor?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{t("wb.messageParticipantsHint")}</p>
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={5}
              className="min-h-[120px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessagingFor(null)} className="min-h-[44px]">{t("wb.cancel")}</Button>
            <Button
              onClick={sendParticipantsMessage}
              disabled={sendingMessage || !messageText.trim()}
              className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]"
            >
              {sendingMessage ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              {t("wb.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v2.87 — standings for one competition; v2.89 — ranked by penalty
          points first (fewer is better — see rankByPenaltyAndWeight),
          total catch weight only the tie-break. Read-only — weights are
          entered via the pencil icon on each ParticipantRow above
          (organizer/admin). v2.92 — this dialog is now purely for on-screen
          viewing; the downloaded PNG (see downloadStandingsImage) is drawn
          separately, straight onto a canvas, not screenshotted from here. */}
      <Dialog open={!!standingsFor} onOpenChange={(o) => !o && setStandingsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" /> <span className="break-words">{t("wb.standings")} — {standingsFor?.title}</span>
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
                  <p className="text-sm text-slate-400">{t("wb.noResultsYet")}</p>
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
                          <p className="text-[10px] text-amber-700">{r.total} {t("wb.kg")}</p>
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
            <Button variant="outline" onClick={() => setStandingsFor(null)} className="min-h-[44px]">{t("comp.close")}</Button>
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

      {/* v2.83 — edit one registration's name/phone/slot/payment status, or
          cancel it outright. Reachable from the pencil icon on each
          ParticipantRow above. */}
      <Dialog open={!!editingReg} onOpenChange={(o) => !o && setEditingReg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wb.editParticipant")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("comp.fullName")} *</Label>
              <Input value={regEditForm.participant_name} onChange={(e) => setRegEditForm((f) => ({ ...f, participant_name: e.target.value }))} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("comp.phone")}</Label>
              <Input value={regEditForm.participant_phone} onChange={(e) => setRegEditForm((f) => ({ ...f, participant_phone: e.target.value }))} className="min-h-[44px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wb.slotTypeLabel")}</Label>
                <Select value={regEditForm.slot_type} onValueChange={(v) => setRegEditForm((f) => ({ ...f, slot_type: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">{t("comp.participants")}</SelectItem>
                    <SelectItem value="reserve">{t("comp.reserves")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("wb.paymentStatus")}</Label>
                <Select value={regEditForm.payment_status} onValueChange={(v) => setRegEditForm((f) => ({ ...f, payment_status: v }))}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("wb.paymentStatusPending")}</SelectItem>
                    <SelectItem value="paid">{t("wb.paymentStatusPaid")}</SelectItem>
                    <SelectItem value="transferred">{t("wb.paymentStatusTransferred")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* v2.90 — assign this registration to a real system account
                (reassignParticipant): typing an existing account's email and
                pressing "Назначи" moves created_by_id to them, so that
                account (not whoever originally registered this participant)
                owns the registration from then on. Shown separately from
                the fields above/the main "Запази" button since it takes
                effect immediately, on its own. */}
            {editingReg && (
              <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-border">
                <Label className="flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" /> {t("wb.reassignToUser")}
                </Label>
                {editingReg.assigned_user_email && (
                  <p className="text-xs text-cyan-700 dark:text-cyan-400">
                    {t("wb.assignedToAccount")}: {maskEmail(editingReg.assigned_user_email)}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={reassignEmail}
                    onChange={(e) => setReassignEmail(e.target.value)}
                    placeholder={t("wb.reassignEmailPlaceholder")}
                    className="min-h-[44px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reassignParticipant}
                    disabled={reassigning || !reassignEmail.trim()}
                    className="min-h-[44px] shrink-0"
                  >
                    {reassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : t("wb.reassign")}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => cancelRegistrationAsOrganizer(editingReg)}
              className="min-h-[44px] text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
            >
              <X className="w-4 h-4 mr-1" /> {t("wb.cancelRegistration")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditingReg(null)} className="min-h-[44px]">{t("wb.cancel")}</Button>
            <Button type="button" onClick={saveRegEdit} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BrochureContactDialog
        open={!!brochureTarget}
        onOpenChange={(open) => { if (!open) setBrochureTarget(null); }}
        defaultValue=""
        downloading={!!brochureTarget && downloadingId === brochureTarget.id}
        onConfirm={(text) => handleDownloadBrochure(brochureTarget, text)}
      />
    </div>
  );
}
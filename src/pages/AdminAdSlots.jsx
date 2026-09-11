import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Trash2, Eye, EyeOff, Megaphone, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ALL_COUNTRIES, COUNTRY_NAME_BY_CODE } from "@/lib/countries";
import { calculateCountryPrice, getCountryMultiplier } from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";

const PLACEMENT_KEYS = [
  { value: "all", key: "nav.allPages" },
  { value: "home", key: "nav.home" },
  { value: "session", key: "nav.activeSession" },
  { value: "log_catch", key: "nav.logCatch" },
  { value: "history", key: "nav.catchHistory" },
  { value: "sessions", key: "nav.sessions" },
  { value: "statistics", key: "nav.statistics" },
  { value: "locations", key: "nav.locations" },
  { value: "personal_best", key: "nav.personalBest" },
  { value: "bait_inventory", key: "nav.tackleInventory" },
  { value: "water_bodies", key: "nav.waterBodies" },
  { value: "competitions", key: "nav.competitions" },
  { value: "sector_reservations", key: "nav.sectorReservations" },
  { value: "advertise", key: "nav.advertise" },
  { value: "profile", key: "nav.profile" },
];

function formatCountryPrices(basePrice) {
  if (!basePrice || basePrice <= 0) return null;
  return ALL_COUNTRIES.map((c) => ({
    code: c.code,
    name: c.name,
    price: calculateCountryPrice(basePrice, c.code),
    multiplier: getCountryMultiplier(c.code),
  }));
}

export default function AdminAdSlots() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const PLACEMENTS = PLACEMENT_KEYS.map((p) => ({ value: p.value, label: t(p.key) }));
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", placement: "all", price_per_month: "" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", placement: "all", price_per_month: "" });

  useEffect(() => { loadSlots(); }, []);

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("awb.noAccess")}</p>
      </div>
    );
  }

  async function loadSlots() {
    try {
      const data = await base44.entities.AdSlot.list();
      setSlots(data || []);
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!form.name || !form.price_per_month) {
      toast({ title: t("aas.fillAllFields") });
      return;
    }
    setCreating(true);
    try {
      await base44.entities.AdSlot.create({
        name: form.name,
        placement: form.placement,
        price_per_month: Number(form.price_per_month),
        is_available: true,
        status: "available",
      });
      toast({ title: t("aas.slotCreated") });
      setForm({ name: "", placement: "all", price_per_month: "" });
      await loadSlots();
    } catch (e) {
      toast({ title: "Грешка", description: e.message });
    } finally {
      setCreating(false);
    }
  }

  function startEdit(slot) {
    setEditingId(slot.id);
    setEditForm({
      name: slot.name || "",
      placement: slot.placement || "all",
      price_per_month: String(slot.price_per_month ?? ""),
    });
  }

  async function saveEdit() {
    if (!editForm.name || !editForm.price_per_month) {
      toast({ title: t("aas.fillAllFields") });
      return;
    }
    try {
      await base44.entities.AdSlot.update(editingId, {
        name: editForm.name,
        placement: editForm.placement,
        price_per_month: Number(editForm.price_per_month),
      });
      toast({ title: t("aas.slotUpdated") });
      setEditingId(null);
      await loadSlots();
    } catch (e) {
      toast({ title: "Грешка", description: e.message });
    }
  }

  async function toggleAvailable(slot) {
    try {
      await base44.entities.AdSlot.update(slot.id, { is_available: !slot.is_available });
      await loadSlots();
    } catch (e) {
      toast({ title: "Грешка", description: e.message });
    }
  }

  async function remove(id) {
    try {
      await base44.entities.AdSlot.delete(id);
      toast({ title: t("aas.slotDeleted") });
      await loadSlots();
    } catch (e) {
      toast({ title: t("aas.deleteError"), description: e.message });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("aas.title")}</h1>
      </div>

      {/* Create form */}
      <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("aas.newSlot")}</h2>
        <div className="space-y-2">
          <div>
            <Label>{t("aas.name")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("aas.namePlaceholder")}
              className="min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("aas.placement")}</Label>
              <Select value={form.placement} onValueChange={(v) => setForm({ ...form, placement: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("aas.basePrice")}</Label>
              <Input
                type="number"
                step="any"
                value={form.price_per_month}
                onChange={(e) => setForm({ ...form, price_per_month: e.target.value })}
                placeholder="9.99"
                className="min-h-[44px]"
              />
            </div>
          </div>
          {form.price_per_month > 0 && (
            <div className="rounded-lg bg-cyan-50 dark:bg-accent p-3 space-y-1">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">{t("aas.autoPrices")}:</p>
              <div className="flex flex-wrap gap-1">
                {ALL_COUNTRIES.slice(0, 8).map((c) => (
                  <span key={c.code} className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-card text-cyan-700 dark:text-cyan-400">
                    {c.name}: €{calculateCountryPrice(Number(form.price_per_month), c.code).toFixed(2)}
                  </span>
                ))}
                {ALL_COUNTRIES.length > 8 && (
                  <span className="text-[10px] px-1.5 py-0.5 text-slate-400">+{ALL_COUNTRIES.length - 8} {t("aas.more")}</span>
                )}
              </div>
            </div>
          )}
        </div>
        <Button onClick={create} disabled={creating} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px] w-full">
          <Plus className="w-4 h-4 mr-1" /> {t("aas.create")}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : slots.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">{t("aas.noSlots")}</p>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => {
            const countryList = formatCountryPrices(slot.price_per_month);
            const isEditing = editingId === slot.id;
            return (
              <div key={slot.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 space-y-2">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("aas.editing")}</p>
                      <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-accent">
                        <X className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder={t("aas.name")}
                      className="min-h-[44px]"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={editForm.placement} onValueChange={(v) => setEditForm({ ...editForm, placement: v })}>
                        <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PLACEMENTS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="any"
                        value={editForm.price_per_month}
                        onChange={(e) => setEditForm({ ...editForm, price_per_month: e.target.value })}
                        placeholder={t("aas.basePrice")}
                        className="min-h-[44px]"
                      />
                    </div>
                    {editForm.price_per_month > 0 && (
                      <div className="rounded-lg bg-cyan-50 dark:bg-accent p-3 space-y-1">
                        <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">{t("aas.autoPrices")}:</p>
                        <div className="flex flex-wrap gap-1">
                          {ALL_COUNTRIES.slice(0, 8).map((c) => (
                            <span key={c.code} className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-card text-cyan-700 dark:text-cyan-400">
                              {c.name}: €{calculateCountryPrice(Number(editForm.price_per_month), c.code).toFixed(2)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button onClick={saveEdit} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px] w-full">
                      {t("aas.save")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-foreground">{slot.name}</p>
                        <p className="text-xs text-slate-400">
                          {PLACEMENTS.find((p) => p.value === slot.placement)?.label} · €{slot.price_per_month}/мес
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {slot.status === "rented" && (
                          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{t("aas.rented")}</span>
                        )}
                        <button
                          onClick={() => startEdit(slot)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                          title="Редактирай"
                        >
                          <Pencil className="w-4 h-4 text-cyan-600" />
                        </button>
                        <button
                          onClick={() => toggleAvailable(slot)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                          title={slot.is_available ? t("aas.hideFromAdvertisers") : t("aas.showToAdvertisers")}
                        >
                          {slot.is_available ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                        </button>
                        <button
                          onClick={() => remove(slot.id)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                        >
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </button>
                      </div>
                    </div>
                    {countryList && (
                      <div className="flex flex-wrap gap-1 pt-1 max-h-20 overflow-y-auto">
                        {countryList.map((c) => (
                          <span key={c.code} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-accent text-cyan-700 dark:text-cyan-400">
                            {c.name}: €{c.price.toFixed(2)} (×{c.multiplier})
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
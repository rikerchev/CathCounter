import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Waves, Send, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentLocation } from "@/lib/geolocation";
import { useLanguage } from "@/lib/i18n";

export default function WaterBodyRequest() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    owner_name: user?.full_name || "",
    contact_phone: "",
    contact_email: user?.email || "",
    location: "",
    latitude: "",
    longitude: "",
    usage_conditions: "",
    fish_population: "",
    max_depth: "",
    capacity: "",
    fee_per_person: "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function captureLocation() {
    setLocating(true);
    try {
      const loc = await getCurrentLocation("bg");
      setForm((f) => ({
        ...f,
        latitude: loc.latitude ? String(loc.latitude) : f.latitude,
        longitude: loc.longitude ? String(loc.longitude) : f.longitude,
        location: loc.name || f.location,
      }));
      toast({ title: t("wbr.locationCaptured") });
    } catch (e) {
      toast({ title: t("wbr.locationError"), description: e.message, variant: "destructive" });
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await base44.entities.WaterBody.create({
        ...form,
        max_depth: form.max_depth ? Number(form.max_depth) : null,
        capacity: form.capacity || null,
        fee_per_person: form.fee_per_person ? Number(form.fee_per_person) : 0,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        status: "pending",
      });
      toast({ title: t("wbr.requestSent"), description: t("wbr.requestSentDesc") });
      navigate("/water-bodies");
    } catch (err) {
      toast({ title: t("wbr.sendError"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Waves className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("wbr.title")}</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-muted-foreground">
        {t("wbr.description")}
      </p>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
        <div className="space-y-1.5">
          <Label>{t("wbr.name")} *</Label>
          <Input value={form.name} onChange={set("name")} required className="min-h-[44px]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("wbr.ownerName")}</Label>
            <Input value={form.owner_name} onChange={set("owner_name")} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbr.phone")} *</Label>
            <Input value={form.contact_phone} onChange={set("contact_phone")} required className="min-h-[44px]" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("wbr.email")}</Label>
          <Input type="email" value={form.contact_email} onChange={set("contact_email")} className="min-h-[44px]" />
        </div>

        <div className="space-y-1.5">
          <Label>{t("wbr.address")} *</Label>
          <Input value={form.location} onChange={set("location")} required className="min-h-[44px]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("wbr.latitude")}</Label>
            <Input type="number" step="any" value={form.latitude} onChange={set("latitude")} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbr.longitude")}</Label>
            <Input type="number" step="any" value={form.longitude} onChange={set("longitude")} className="min-h-[44px]" />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={captureLocation} disabled={locating} className="w-full min-h-[44px]">
          <MapPin className="w-4 h-4 mr-1" /> {locating ? t("wbr.locating") : t("wbr.captureLocation")}
        </Button>

        <div className="space-y-1.5">
          <Label>{t("wbr.conditions")} *</Label>
          <Textarea value={form.usage_conditions} onChange={set("usage_conditions")} required rows={3} />
        </div>

        <div className="space-y-1.5">
          <Label>{t("wbr.fishPopulation")} *</Label>
          <Textarea
            value={form.fish_population}
            onChange={set("fish_population")}
            required
            rows={3}
            placeholder={t("wbr.fishPopulationPlaceholder")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("wbr.maxDepth")}</Label>
            <Input type="number" step="any" value={form.max_depth} onChange={set("max_depth")} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbr.capacity")}</Label>
            <Input value={form.capacity} onChange={set("capacity")} placeholder={t("wbr.capacityPlaceholder")} className="min-h-[44px]" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("wbr.feePerPerson")}</Label>
          <Input type="number" step="any" value={form.fee_per_person} onChange={set("fee_per_person")} placeholder={t("wbr.feePlaceholder")} className="min-h-[44px]" />
        </div>

        <Button type="submit" disabled={submitting} className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[48px]">
          <Send className="w-4 h-4 mr-1" /> {submitting ? t("wbr.sending") : t("wbr.submit")}
        </Button>
      </form>
    </div>
  );
}
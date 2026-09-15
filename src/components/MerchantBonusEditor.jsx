import React, { useEffect, useState } from "react";
import { Gift, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { base44 } from "@/api/base44Client";

/**
 * MerchantBonusEditor — v2.69, admin-only. Lets an admin configure how many
 * free banner-days a water body or venue earns per new account that
 * registers through its brochure QR, and WHICH banner (custom_ads row)
 * receives the extension — both 0/unset by default ("в никой банер"), and
 * nothing is applied until both are set (see server/routes/merchantReferrals.ts).
 *
 * `merchant`: { id, bonus_days_per_referral, linked_custom_ad_id }
 * `merchantType`: "water_body" | "venue"
 * `onSaved(patch)`: called after a successful save with the applied patch
 */
export default function MerchantBonusEditor({ merchant, merchantType, onSaved }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [ads, setAds] = useState([]);
  const [days, setDays] = useState(String(merchant.bonus_days_per_referral || 0));
  const [adId, setAdId] = useState(merchant.linked_custom_ad_id || "");
  const [count, setCount] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.CustomAd.list("sort_order", 200)
      .then((data) => setAds(data || []))
      .catch(() => setAds([]));
    base44.merchantReferrals
      .stats(merchantType, merchant.id)
      .then((data) => setCount(data.referral_count ?? 0))
      .catch(() => setCount(null));
  }, [merchant.id, merchantType]);

  async function save() {
    setSaving(true);
    try {
      const patch = {
        bonus_days_per_referral: Math.max(0, Number(days) || 0),
        linked_custom_ad_id: adId || null,
      };
      const entity = merchantType === "venue" ? base44.entities.Venue : base44.entities.WaterBody;
      await entity.update(merchant.id, patch);
      toast({ title: t("merchant.bonusSaved") });
      onSaved?.(patch);
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wide">
        <Gift className="w-3.5 h-3.5" />
        {t("merchant.bonusTitle")}
      </div>
      <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{t("merchant.bonusDesc")}</p>
      {count !== null && <p className="text-xs text-slate-500 dark:text-muted-foreground">{t("referral.invitedCount").replace("{count}", count)}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("merchant.bonusDays")}</Label>
          <Input type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} className="min-h-[40px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("merchant.linkedBanner")}</Label>
          <Select value={adId || "__none"} onValueChange={(v) => setAdId(v === "__none" ? "" : v)}>
            <SelectTrigger className="min-h-[40px]"><SelectValue placeholder={t("merchant.noBanner")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{t("merchant.noBanner")}</SelectItem>
              {ads.map((ad) => (
                <SelectItem key={ad.id} value={ad.id}>{ad.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700 min-h-[36px]">
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
        {t("common.save")}
      </Button>
    </div>
  );
}

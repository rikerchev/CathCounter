import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Gift, Share2, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { usePremium } from "@/hooks/usePremium";
import { base44 } from "@/api/base44Client";
import { getReferralLink } from "@/lib/referral";

/**
 * ReferralCard — Табло → "Покани приятел" (v2.68). Shows the user's own
 * invite QR code + link; sharing it and having a friend scan it and
 * register earns BOTH accounts 7 days of ad-free premium (stacking, capped
 * at 60 days — see server/routes/referrals.ts for the actual numbers/logic,
 * duplicated nowhere in this component on purpose).
 */
export default function ReferralCard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { referralPremiumActive, referralDaysLeft } = usePremium();
  const { toast } = useToast();
  const canvasRef = useRef(null);
  const [referralCount, setReferralCount] = useState(null);
  const [copying, setCopying] = useState(false);

  const link = user ? getReferralLink(user.id) : "";

  useEffect(() => {
    if (!link || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, link, {
      width: 128,
      margin: 1,
      color: { dark: "#0e7490", light: "#ffffff" }, // cyan-700 on white, matches the app's palette
    }).catch(() => {
      // non-fatal — the link/buttons below still work without the QR image
    });
  }, [link]);

  useEffect(() => {
    let cancelled = false;
    base44.referrals
      .stats()
      .then((data) => {
        if (!cancelled) setReferralCount(data.referral_count ?? 0);
      })
      .catch(() => {
        // stays null -> count line just isn't shown
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleCopy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t("referral.linkCopied") });
    } catch {
      toast({ title: t("referral.copyFailed"), variant: "destructive" });
    } finally {
      setCopying(false);
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "CatchCount", text: t("referral.shareText"), url: link });
        return;
      } catch {
        // user cancelled the native share sheet, or it's unsupported here — fall through to copy
      }
    }
    handleCopy();
  }

  if (!user) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("referral.title")}</h2>
      </div>
      <p className="text-xs text-slate-400">{t("referral.subtitle")}</p>

      <div className="flex items-center gap-4">
        <div className="w-[76px] h-[76px] rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {referralPremiumActive && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg px-2 py-1 w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              {t("referral.daysLeft").replace("{days}", referralDaysLeft)}
            </div>
          )}
          {referralCount !== null && referralCount > 0 && (
            <p className="text-xs text-slate-400">{t("referral.invitedCount").replace("{count}", referralCount)}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 min-h-[36px]" onClick={handleCopy} disabled={copying}>
              {copying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {t("referral.copyLink")}
            </Button>
            <Button size="sm" className="flex-1 min-h-[36px] bg-cyan-600 hover:bg-cyan-700" onClick={handleShare}>
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              {t("referral.share")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

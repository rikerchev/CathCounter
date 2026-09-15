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
  const [qrFailed, setQrFailed] = useState(false);

  const link = user ? getReferralLink(user.id) : "";

  // Canvas raw resolution (QR_PX) is kept EQUAL to its on-screen CSS size
  // (see the w-40 h-40 container below) on purpose — rendering at a higher
  // resolution than displayed (the old 192px canvas in a 96px box) forces
  // the browser to downscale it with anti-aliasing, which blurs the crisp
  // black/white module edges a camera needs to lock onto. 1:1 avoids that.
  const QR_PX = 160;

  useEffect(() => {
    if (!link || !canvasRef.current) return;
    setQrFailed(false);
    QRCode.toCanvas(canvasRef.current, link, {
      width: QR_PX,
      // v2.69 fix — this was 1 module, well under the spec's required ~4-module
      // "quiet zone" around the code. Most phone cameras need that blank
      // border to even detect a QR code at all, let alone decode it — with
      // margin:1 the code could render perfectly and still fail to scan for
      // basically everyone. 4 is the library's own (spec-compliant) default.
      margin: 4,
      // Level H (~30% error correction) instead of the default M (~15%) —
      // gives a phone camera much more room to still decode the code
      // correctly despite screen glare, a slightly off angle, or scanning
      // straight off a monitor instead of print.
      errorCorrectionLevel: "H",
      // Plain black/white, not the previous cyan-on-white — colored modules
      // read as lower-contrast ("gray") to some camera auto-exposure/QR
      // detectors than true black, which measurably hurts scan reliability.
      // Reliable scanning matters more here than matching the palette.
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((e) => {
      // Previously silently swallowed — if generation itself fails (e.g. a
      // canvas-not-ready timing edge case), the card would show a blank
      // canvas with no code at all, which looks identical to "the QR just
      // doesn't scan" from the user's side. Now it's both logged AND
      // surfaced (see qrFailed below) instead of failing invisibly.
      console.error("ReferralCard QR generation failed:", e);
      setQrFailed(true);
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
        <div className="w-40 h-40 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
          {qrFailed ? (
            <p className="text-[10px] text-slate-400 text-center px-2">{t("referral.qrFailed")}</p>
          ) : (
            <canvas ref={canvasRef} width={QR_PX} height={QR_PX} />
          )}
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

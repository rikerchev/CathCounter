import { BatteryCharging } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";

/**
 * v3.41 — "turn off battery optimization for CatchCount" dialog. Android
 * only (see useBatteryPrompt.js — iOS has no equivalent setting at all).
 *
 * The button below tries a real Android intent — `android.settings.
 * IGNORE_BATTERY_OPTIMIZATION_SETTINGS` — which is a genuine, long-standing
 * public Android intent action (since Doze was introduced in Android 6.0)
 * that opens the OS's own "Battery optimization" list. Triggering an
 * Android intent from a web page only works through the `intent://` URL
 * scheme, and Chrome only ever NAVIGATES to it — there is no JS callback
 * telling us whether it actually opened Settings or did nothing, so this
 * can't detect success or failure. A `S.browser_fallback_url` back to this
 * same page is included so a device that can't resolve the intent at least
 * doesn't hit a dead end.
 *
 * Two things this deliberately does NOT claim:
 * 1. It opens the general OS battery-optimization list, not a screen
 *    already scrolled/filtered to CatchCount — there's no intent action or
 *    JS API that jumps straight to one specific app's entry from a web
 *    page (that needs the app's exact Android package name, which a
 *    Chrome-installed PWA's JS never has access to). The user still has to
 *    find CatchCount (or "Риболовен Дневник") in the list themselves.
 * 2. Several phone brands (Samsung, Xiaomi/MIUI, Huawei, OnePlus, ...) ship
 *    their OWN separate battery-manager app on top of stock Android, with
 *    its own independent per-app restriction that this intent does not
 *    reach at all. The manual steps below stay visible at all times (not
 *    hidden behind "if the button doesn't work") for exactly this reason —
 *    the button is a shortcut attempt, not a guaranteed fix.
 */
export default function BatteryOptimizationPrompt({ open, onOpenChange }) {
  const { t } = useLanguage();

  const handleOpenSettings = () => {
    const fallback = encodeURIComponent(window.location.href);
    window.location.href = `intent:#Intent;action=android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS;S.browser_fallback_url=${fallback};end`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-cyan-100 dark:bg-accent flex items-center justify-center flex-shrink-0">
              <BatteryCharging className="w-4 h-4 text-cyan-600" />
            </div>
            <DialogTitle>{t("battery.title")}</DialogTitle>
          </div>
          <DialogDescription className="pt-1">{t("battery.intro")}</DialogDescription>
        </DialogHeader>

        <Button onClick={handleOpenSettings} className="bg-cyan-600 hover:bg-cyan-700 w-full">
          {t("battery.openSettings")}
        </Button>

        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("battery.manualHeading")}</p>
          <p className="text-sm text-slate-600 dark:text-muted-foreground whitespace-pre-line">{t("battery.manualSteps")}</p>
          <p className="text-xs text-slate-400">{t("battery.brandNote")}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("battery.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { X, Download, Share } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/**
 * Prompts the user to add the app to their home screen. Not sticky on
 * purpose — it just scrolls away with the page; the ad banner right below
 * it (AdBanner.jsx) is what stays pinned to the top while scrolling.
 *
 * IMPORTANT: this banner previously had no bottom margin, so its bottom
 * edge touched the ad banner's top edge with a 0px gap. AdBanner is
 * `position: sticky` with its own z-index (20) — with zero space between
 * the two, a tap aimed at the bottom of this banner (e.g. the install
 * button) very easily lands on the ad's link instead, which is exactly
 * what users reported ("have to tap ~10 times"). `mb-2` + an explicit
 * higher z-index here fixes that: real visual separation, and this banner
 * wins if anything still overlaps by a pixel.
 *
 * Why this exists: the browser's own address bar sits outside the page and
 * can never be affected by our CSS. Once installed (manifest.json already
 * declares display:standalone), the address bar disappears entirely — the
 * only fix that behaves the same on every visitor's device, rather than a
 * per-browser setting each person would have to find themselves.
 *
 * The button is always shown (not just once Chrome hands us a native
 * prompt) — see useInstallPrompt.js for why. Tapping it either triggers the
 * real native install dialog, or — on a browser that hasn't offered one —
 * shows a single short toast instead of doing nothing silently.
 *
 * The install button and the dismiss (X) button used to sit only 12px
 * apart (the flex `gap-3`), and the X's own touch target was a ~28px
 * square — well under the ~40-44px a thumb reliably hits. A user aiming
 * for "Инсталирай" would land on X instead, dismissing the banner (which
 * hides it for 14 days) rather than installing. Both targets are now
 * bigger and pushed further apart (`ml-3` on top of the row's own gap).
 *
 * v3.43 — on iOS this banner used to show only a small, non-interactive
 * gray line of text ("Tap Share, then Add to Home Screen") instead of a
 * button — reported by a user as "there's no install button on iOS".
 * Apple genuinely gives Safari no API to trigger installation from code
 * (no `beforeinstallprompt` equivalent — see useInstallPrompt.js), so
 * tapping a button still can't install the app automatically the way it
 * does on Android. But there was no reason for iOS visitors to get a
 * passive caption instead of something tappable — now they get an actual
 * pill button (`install.iosButton`) matching the Android one's visual
 * weight, which opens a small Dialog with the same "Share → Add to Home
 * Screen" steps, just presented clearly instead of in a tiny truncated
 * line of text.
 */
export default function InstallAppBanner() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { canShow, isIos, canPromptNatively, promptInstall, dismiss } = useInstallPrompt();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (!canShow) return null;

  const handleInstallClick = async () => {
    const result = await promptInstall();
    if (result === "unavailable") {
      toast({ title: t("install.unavailableToast") });
    }
  };

  return (
    <>
      <div className="relative z-30 flex items-center gap-3 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-card dark:to-card text-white rounded-xl px-3 py-2 mx-2 mt-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
          <Download className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{t("install.title")}</p>
        </div>
        {isIos ? (
          // v3.43 — iOS has no native install prompt to trigger, so this
          // button doesn't install anything itself — it opens the
          // instructions Dialog below instead. Same pill styling as the
          // Android button so it reads as equally actionable, not a
          // lesser/disabled option.
          <button
            type="button"
            onClick={() => setShowIosHelp(true)}
            className="text-xs font-semibold !bg-white text-slate-900 px-4 py-2.5 rounded-lg flex-shrink-0 min-h-[44px]"
          >
            {t("install.iosButton")}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleInstallClick}
            // `!bg-white` (Tailwind's important-modifier), not plain `bg-white`:
            // src/index.css has a global `.dark .bg-white { background-color:
            // hsl(var(--card)) }` rule (line ~110) that repaints every
            // hardcoded `bg-white` near-black in dark mode, to save OLED
            // battery on the many *light* white cards across the app. This
            // button is different — it lives inside a banner that is ALREADY
            // dark in both themes (`bg-gradient-to-r from-slate-800
            // to-slate-900 dark:from-card dark:to-card` on the wrapper above),
            // so it needs to stay a genuinely light pill for contrast
            // regardless of app theme. Without `!`, the global override still
            // matched this literal `bg-white` class name and repainted it to
            // `--card` (near-black in dark mode) while the text stayed
            // `text-slate-900` (also near-black) — invisible black-on-black
            // "Инсталирай" button that users could only tap by guessing where
            // it was (reported after switching to catchcount.app4.you, but
            // the bug was theme-related, not domain-related — it just went
            // unnoticed before because "дефолт тъмна тема" / dark-by-default
            // is what most people see, per useTheme.js).
            className="text-xs font-semibold !bg-white text-slate-900 px-4 py-2.5 rounded-lg flex-shrink-0 min-h-[44px]"
          >
            {t("install.installButton")}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("install.close")}
          className="ml-3 rounded-lg hover:bg-white/10 flex-shrink-0 w-10 h-10 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-cyan-100 dark:bg-accent flex items-center justify-center flex-shrink-0">
                <Share className="w-4 h-4 text-cyan-600" />
              </div>
              <DialogTitle>{t("install.title")}</DialogTitle>
            </div>
            <DialogDescription className="pt-1">{t("install.iosInstructions")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-muted-foreground whitespace-pre-line">
            {t("install.iosSteps")}
          </p>
          <DialogFooter>
            <Button onClick={() => setShowIosHelp(false)} className="bg-cyan-600 hover:bg-cyan-700 w-full sm:w-auto">
              {t("install.gotIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

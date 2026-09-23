import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";

/**
 * v3.39 — "Lock the app while fishing" dialog. See useAppLockPrompt.js for
 * when it's shown/eligible and ActiveSession.jsx for the trigger (first
 * cast of the session) and Profile.jsx for the "show it again" entry point.
 *
 * There's no API to actually pin/lock the app from code — Android's App
 * Pinning and iOS's Guided Access are both deliberately user-only OS
 * features. This can only walk the user through doing it themselves.
 *
 * v3.40 — was a single screen that dropped straight into numbered
 * technical steps ("Overview", "Recents"...) with no explanation of what
 * they were for — reported as unclear to most people. Now two steps: a
 * plain-language question ("this keeps the app open until you close it
 * yourself — want to see how?") with explicit Да/Не buttons, and the
 * step-by-step instructions only appear after "Да". "Не" and any other way
 * of closing the dialog both just dismiss it (see useAppLockPrompt.js) —
 * there's no way to tell "said no" apart from "closed it", and the user's
 * own ask was for exactly this shape (a yes/no question first), not a
 * three-way outcome.
 */
export default function AppLockPrompt({ open, onOpenChange, platform }) {
  const { t } = useLanguage();
  const [step, setStep] = useState("question");

  // Always start back at the question when the dialog is (re)opened —
  // otherwise reopening it from Profile after having said "Да" once before
  // would skip straight to the instructions with no context.
  useEffect(() => {
    if (open) setStep("question");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-cyan-100 dark:bg-accent flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-cyan-600" />
            </div>
            <DialogTitle>{t("applock.title")}</DialogTitle>
          </div>
          <DialogDescription className="pt-1">{t("applock.intro")}</DialogDescription>
        </DialogHeader>

        {step === "question" ? (
          <DialogFooter className="sm:justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              {t("applock.no")}
            </Button>
            <Button onClick={() => setStep("instructions")} className="bg-cyan-600 hover:bg-cyan-700 w-full sm:w-auto">
              {t("applock.yes")}
            </Button>
          </DialogFooter>
        ) : (
          <>
            {platform === "android" && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("applock.androidHeading")}</p>
                <p className="text-sm text-slate-600 dark:text-muted-foreground whitespace-pre-line">{t("applock.androidSteps")}</p>
                <p className="text-xs text-slate-400">{t("applock.androidNote")}</p>
              </div>
            )}

            {platform === "ios" && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("applock.iosHeading")}</p>
                <p className="text-sm text-slate-600 dark:text-muted-foreground whitespace-pre-line">{t("applock.iosSteps")}</p>
              </div>
            )}

            <p className="text-xs text-slate-400">{t("applock.laterHint")}</p>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="bg-cyan-600 hover:bg-cyan-700 w-full sm:w-auto">
                {t("applock.gotIt")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

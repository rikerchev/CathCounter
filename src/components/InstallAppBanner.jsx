import { X, Download } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * Prompts the user to add the app to their home screen. Not sticky on
 * purpose — it just scrolls away with the page; the ad banner right below
 * it (AdBanner.jsx) is what stays pinned to the top while scrolling.
 *
 * Why this exists: the browser's own address bar sits outside the page and
 * can never be affected by our CSS. Once installed (manifest.json already
 * declares display:standalone), the address bar disappears entirely — the
 * only fix that behaves the same on every visitor's device, rather than a
 * per-browser setting each person would have to find themselves.
 */
export default function InstallAppBanner() {
  const { t } = useLanguage();
  const { canShow, isIos, canPromptNatively, promptInstall, dismiss } = useInstallPrompt();

  if (!canShow) return null;

  return (
    <div className="relative flex items-center gap-3 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-card dark:to-card text-white rounded-xl px-3 py-2 mx-2 mt-2">
      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
        <Download className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{t("install.title")}</p>
        <p className="text-xs text-slate-300 truncate">
          {isIos && !canPromptNatively ? t("install.iosInstructions") : t("install.desc")}
        </p>
      </div>
      {canPromptNatively && (
        <button
          type="button"
          onClick={promptInstall}
          className="text-xs font-semibold bg-white text-slate-900 px-3 py-2 rounded-lg flex-shrink-0 min-h-[36px]"
        >
          {t("install.installButton")}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("install.close")}
        className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useLanguage } from "@/lib/i18n";
import { Wallet, Landmark } from "lucide-react";

/**
 * Reusable "how to pay the platform owner" card — Revolut and/or bank
 * transfer details, as configured by the admin in Настройка на
 * интеграциите → Начини на плащане (see server/lib/settings.ts /
 * GET /api/settings/payment). Renders nothing if no method is configured,
 * so pages can drop this in unconditionally.
 */
export default function PaymentInfoCard() {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    base44.settings.getPaymentInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  if (!info || (!info.revolut?.enabled && !info.bank?.enabled)) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wide">
          {t("adv.howToPay")}
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {info.revolut?.enabled && (
          <div className="rounded-xl bg-slate-50 dark:bg-accent p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">{t("adv.payRevolut")}</p>
            {info.revolut.url ? (
              <a href={info.revolut.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-cyan-700 dark:text-cyan-400 break-all">
                {info.revolut.url}
              </a>
            ) : (
              <p className="text-sm font-medium text-slate-700 dark:text-foreground">@{info.revolut.tag}</p>
            )}
          </div>
        )}
        {info.bank?.enabled && (
          <div className="rounded-xl bg-slate-50 dark:bg-accent p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground flex items-center gap-1">
              <Landmark className="w-3.5 h-3.5" /> {t("adv.payBankTransfer")}
            </p>
            {info.bank.holder && (
              <p className="text-xs text-slate-500 dark:text-muted-foreground">{t("adv.payHolder")}: <span className="text-slate-700 dark:text-foreground font-medium">{info.bank.holder}</span></p>
            )}
            <p className="text-sm font-medium text-slate-700 dark:text-foreground break-all">{info.bank.iban}</p>
            {info.bank.bic && <p className="text-xs text-slate-500 dark:text-muted-foreground">BIC/SWIFT: {info.bank.bic}</p>}
          </div>
        )}
      </div>

      {info.note && <p className="text-xs text-slate-400 whitespace-pre-line">{info.note}</p>}
      <p className="text-xs text-slate-400">{t("adv.payAfterApproval")}</p>
    </div>
  );
}

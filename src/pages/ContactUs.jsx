import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Mail, Send, CheckCircle2, Globe, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/i18n";
import { CATCHCOUNT_APP_LABEL, CATCHCOUNT_PHONE, CATCHCOUNT_EMAIL } from "@/lib/brochure";

// v2.97 — "Връзка с нас". Any logged-in user can send a message; email and
// phone are both mandatory (per the site owner's own request) so they can
// always follow up regardless of channel. See server/routes/contact.ts —
// every submission is stored (contact_messages table) AND emailed to the
// fixed site-owner address, so nothing is lost even if the email bounces.
//
// v3.87 — plus a small block of CatchCount's OWN direct contact details
// (website/phone/email), shown above the message form — "Добави мейл и
// телефон в меню Връзка с нас". Previously this page only offered the
// send-a-message form; someone who'd rather just call or email directly had
// no way to find those details here. Reuses the exact same three constants
// src/lib/brochure.js already draws onto every brochure/poster/flyer
// footer, so this page and the printed materials can never drift apart.
export default function ContactUs() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !phone.trim() || !message.trim()) {
      toast({ title: t("contact.missingFields"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await base44.contact.send(email.trim(), phone.trim(), message.trim());
      setSent(true);
      setMessage("");
      toast({ title: t("contact.sentTitle"), description: t("contact.sentDesc") });
    } catch (err) {
      toast({ title: t("contact.sendError"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("contact.title")}</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("contact.description")}</p>

      {/* v3.87 — CatchCount's own direct contact details, same three values
          shown on every printed brochure/poster/flyer footer. */}
      <div className="rounded-2xl bg-slate-50 dark:bg-accent border border-slate-100 dark:border-border p-4 space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground uppercase tracking-wide">
          {t("contact.directTitle")}
        </p>
        <a
          href={`https://${CATCHCOUNT_APP_LABEL}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-slate-700 dark:text-foreground hover:text-cyan-600"
        >
          <Globe className="w-4 h-4 text-cyan-600 shrink-0" /> {CATCHCOUNT_APP_LABEL}
        </a>
        <a
          href={`tel:${CATCHCOUNT_PHONE.replace(/\s+/g, "")}`}
          className="flex items-center gap-2 text-sm text-slate-700 dark:text-foreground hover:text-cyan-600"
        >
          <Phone className="w-4 h-4 text-cyan-600 shrink-0" /> {CATCHCOUNT_PHONE}
        </a>
        <a
          href={`mailto:${CATCHCOUNT_EMAIL}`}
          className="flex items-center gap-2 text-sm text-slate-700 dark:text-foreground hover:text-cyan-600"
        >
          <Mail className="w-4 h-4 text-cyan-600 shrink-0" /> {CATCHCOUNT_EMAIL}
        </a>
      </div>

      {sent ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-800 dark:text-emerald-300">{t("contact.sentTitle")}</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">{t("contact.sentDesc")}</p>
            <Button type="button" variant="outline" className="mt-3 min-h-[40px]" onClick={() => setSent(false)}>
              {t("contact.sendAnother")}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <Label>{t("contact.email")} *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("contact.phone")} *</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("contact.message")} *</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} placeholder={t("contact.messagePlaceholder")} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[48px]">
            <Send className="w-4 h-4 mr-1" /> {submitting ? t("contact.sending") : t("contact.send")}
          </Button>
        </form>
      )}
    </div>
  );
}

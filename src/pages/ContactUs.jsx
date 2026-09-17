import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Mail, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/i18n";

// v2.97 — "Връзка с нас". Any logged-in user can send a message; email and
// phone are both mandatory (per the site owner's own request) so they can
// always follow up regardless of channel. See server/routes/contact.ts —
// every submission is stored (contact_messages table) AND emailed to the
// fixed site-owner address, so nothing is lost even if the email bounces.
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

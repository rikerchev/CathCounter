import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { hasRole } from "@/lib/roles";
import { Settings, ExternalLink, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

// Static wizard copy — deliberately not routed through the i18n dictionary
// (admin-only, single audience), see server/lib/settings.ts for the keys.
const SECTIONS = [
  {
    id: "google",
    title: "Вход с Google",
    description: "Позволява на потребителите да влизат с Google профил вместо парола.",
    registerUrl: "https://console.cloud.google.com/apis/credentials",
    registerLabel: "Google Cloud Console → Credentials",
    note: "Създайте OAuth 2.0 Client ID (тип 'Web application') и добавете Authorized redirect URI точно като полето по-долу.",
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "Client ID", secret: false },
      { key: "GOOGLE_CLIENT_SECRET", label: "Client Secret", secret: true },
      { key: "GOOGLE_REDIRECT_URI", label: "Redirect URI", secret: false, placeholder: "https://api.вашия-домейн.com/api/auth/google/callback" },
    ],
  },
  {
    id: "storage",
    title: "Съхранение на снимки",
    description: "Всяко S3-съвместимо хранилище работи — Cloudflare R2, AWS S3, Backblaze B2, MinIO.",
    registerUrl: "https://dash.cloudflare.com/sign-up",
    registerLabel: "Cloudflare R2 (0 такса за трафик)",
    note: "Оставете 'Endpoint' празно за истински AWS S3. За R2/B2/MinIO попълнете техния endpoint адрес.",
    fields: [
      { key: "S3_ENDPOINT", label: "Endpoint (празно = AWS S3)", secret: false, placeholder: "https://<account_id>.r2.cloudflarestorage.com" },
      { key: "S3_REGION", label: "Регион", secret: false, placeholder: "auto" },
      { key: "S3_BUCKET", label: "Bucket за снимки (частни)", secret: false },
      { key: "S3_PUBLIC_BUCKET", label: "Bucket за публични файлове (по избор)", secret: false, placeholder: "оставете празно, за да ползва същия bucket" },
      { key: "S3_ACCESS_KEY_ID", label: "Access Key ID", secret: true },
      { key: "S3_SECRET_ACCESS_KEY", label: "Secret Access Key", secret: true },
      { key: "S3_PUBLIC_BASE_URL", label: "Публичен URL / CDN домейн (по избор)", secret: false, placeholder: "https://photos.вашия-домейн.com" },
    ],
  },
  {
    id: "email",
    title: "Имейли",
    description: "Нужно за регистрация (код за потвърждение), забравена парола и покани.",
    registerUrl: "https://resend.com/signup",
    registerLabel: "Resend",
    fields: [
      { key: "RESEND_API_KEY", label: "API ключ", secret: true },
      { key: "EMAIL_FROM", label: "Изпращач", secret: false, placeholder: "CatchCount <noreply@вашия-домейн.com>" },
    ],
  },
  {
    id: "stripe",
    title: "Плащания (Stripe)",
    description: "Такси за състезания, резервации на сектори и реклами.",
    registerUrl: "https://dashboard.stripe.com/register",
    registerLabel: "Stripe Dashboard",
    note: "Webhook secret-ът се взима от Stripe Dashboard → Developers → Webhooks, след като добавите endpoint: /api/functions/stripe-webhook",
    fields: [
      { key: "STRIPE_SECRET_KEY", label: "Secret key", secret: true },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", secret: true },
    ],
  },
  {
    id: "llm",
    title: "AI функции (по избор)",
    description: "В момента не се ползва активно от приложението — оставете празно, ако не Ви трябва.",
    fields: [
      { key: "LLM_PROVIDER", label: "Доставчик (anthropic / openai / none)", secret: false, placeholder: "none" },
      { key: "LLM_API_KEY", label: "API ключ", secret: true },
    ],
  },
];

export default function AdminSetup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await base44.admin.getSettingsStatus();
      setStatus(data);
      const initialDrafts = {};
      for (const section of SECTIONS) {
        for (const f of section.fields) {
          // Pre-fill non-secret fields with the current value; secret fields
          // start blank — the badge shows whether one is already saved.
          if (!f.secret) initialDrafts[f.key] = data[f.key]?.value ?? "";
        }
      }
      setDrafts(initialDrafts);
    } catch (e) {
      toast({ title: "Грешка при зареждане", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function sectionConfigured(section) {
    if (!status) return false;
    return section.fields
      .filter((f) => f.key !== "S3_PUBLIC_BUCKET" && f.key !== "S3_PUBLIC_BASE_URL" && f.key !== "EMAIL_FROM" && f.key !== "GOOGLE_REDIRECT_URI" && f.key !== "S3_REGION")
      .every((f) => status[f.key]?.configured);
  }

  async function saveSection(section) {
    setSaving(section.id);
    try {
      const patch = {};
      for (const f of section.fields) {
        const v = drafts[f.key];
        if (v !== undefined && v !== "") patch[f.key] = v;
      }
      const data = await base44.admin.updateSettings(patch);
      setStatus(data);
      // Clear secret inputs after a successful save — they're write-only.
      setDrafts((prev) => {
        const next = { ...prev };
        for (const f of section.fields) if (f.secret) next[f.key] = "";
        return next;
      });
      toast({ title: `Записано: ${section.title}` });
    } catch (e) {
      toast({ title: "Грешка при запис", description: e.message, variant: "destructive" });
    } finally {
      setSaving("");
    }
  }

  if (user && !hasRole(user, "admin")) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">Нямате достъп до тази страница.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">Настройка на интеграциите</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-muted-foreground">
        Тези ключове се записват в базата данни и влизат в сила веднага, без рестарт.
        Връзката с базата данни и JWT_SECRET остават само в <code>server/.env</code>.
      </p>

      {SECTIONS.map((section) => {
        const configured = sectionConfigured(section);
        return (
          <Card key={section.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base">
                  {section.title}
                  {configured ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Настроено
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <CircleDashed className="w-3.5 h-3.5" /> Не е настроено
                    </Badge>
                  )}
                </CardTitle>
                {section.registerUrl && (
                  <a
                    href={section.registerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1 whitespace-nowrap"
                  >
                    Регистрация: {section.registerLabel} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.note && (
                <p className="text-xs text-slate-400 bg-slate-50 dark:bg-accent/50 rounded-lg p-2">{section.note}</p>
              )}
              {section.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key} className="text-xs flex items-center gap-1.5">
                    {f.label}
                    {f.secret && status?.[f.key]?.configured && (
                      <span className="text-emerald-600 dark:text-emerald-400">(вече записан — оставете празно, за да не го променяте)</span>
                    )}
                  </Label>
                  <Input
                    id={f.key}
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    placeholder={f.placeholder}
                    value={drafts[f.key] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="min-h-[40px]"
                  />
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => saveSection(section)}
                disabled={saving !== ""}
                className="bg-cyan-600 hover:bg-cyan-700 min-h-[40px]"
              >
                {saving === section.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Запази
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

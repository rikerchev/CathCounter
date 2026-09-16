import React, { useState, useEffect, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { hasRole } from "@/lib/roles";
import { Settings, ExternalLink, CheckCircle2, CircleDashed, Loader2, Database, ListOrdered, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ALL_MENU_ITEMS } from "@/lib/menuItems";
import { GROUP_DEFS, DEFAULT_MENU_ORDER, normalizeMenuOrder, cloneOrder } from "@/lib/menuOrder";

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
    id: "email",
    title: "Имейли (SMTP)",
    description: "Нужно за регистрация (код за потвърждение), забравена парола и покани. Работи с всеки SMTP сървър — не се изисква платена услуга.",
    note: "Оставете тези полета празни, за да изпращате през собствен/безплатен SMTP сървър (напр. вашия хостинг доставчик, Brevo, SMTP2GO). Портът обичайно е 587 (STARTTLS) или 465 (SSL — тогава включете 'secure'). След „Запази“ използвайте „Изпрати тестов имейл“, за да проверите — той изпраща през вече ЗАПАЗЕНИТЕ настройки, не през това, което все още не сте запазили в полетата.",
    fields: [
      { key: "SMTP_HOST", label: "SMTP хост", secret: false, placeholder: "smtp.вашия-домейн.com" },
      { key: "SMTP_PORT", label: "Порт", secret: false, placeholder: "587" },
      { key: "SMTP_SECURE", label: "Secure (true/false)", secret: false, placeholder: "false" },
      { key: "SMTP_USER", label: "Потребител", secret: false },
      { key: "SMTP_PASSWORD", label: "Парола", secret: true },
      { key: "EMAIL_FROM", label: "Изпращач", secret: false, placeholder: "CatchCount <noreply@вашия-домейн.com>" },
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
  {
    id: "payment",
    title: "Начини на плащане",
    description: "Показва се на рекламодателите (страница „Рекламирай“), за да знаят как да платят. Може да включите Револют, банкова сметка или и двете.",
    note: "Полето „Включен“ приема стойност true или false. Оставете и двата метода изключени, ако все още не искате да показвате начин на плащане.",
    fields: [
      { key: "PAYMENT_REVOLUT_ENABLED", label: "Револют — включен (true/false)", secret: false, placeholder: "true" },
      { key: "PAYMENT_REVOLUT_TAG", label: "Револют — потребителско име", secret: false, placeholder: "напр. rkerchev" },
      { key: "PAYMENT_REVOLUT_URL", label: "Револют — линк за плащане", secret: false, placeholder: "https://revolut.me/rkerchev" },
      { key: "PAYMENT_BANK_ENABLED", label: "Банкова сметка — включена (true/false)", secret: false, placeholder: "true" },
      { key: "PAYMENT_BANK_HOLDER", label: "Банкова сметка — титуляр", secret: false },
      { key: "PAYMENT_BANK_IBAN", label: "Банкова сметка — IBAN", secret: false },
      { key: "PAYMENT_BANK_BIC", label: "Банкова сметка — BIC/SWIFT", secret: false },
      { key: "PAYMENT_INSTRUCTIONS_NOTE", label: "Допълнителна бележка (по избор)", secret: false, placeholder: "напр. В основанието посочете имейла си" },
    ],
  },
  {
    id: "storage",
    title: "Обектно хранилище (лога на реклами)",
    description: "Нужно е само за качване на файлове извън снимките на уловите — най-вече логата в „Управление на реклами“. Снимките на уловите не минават през това — те се пазят направо в базата данни.",
    registerUrl: "https://supabase.com/dashboard/projects",
    registerLabel: "Supabase → Project Settings → Storage",
    note: "В Supabase: Project Settings → Storage → раздел „S3 Connection“ — там ще видите Endpoint и Region, и бутон за създаване на нов Access key (Access Key ID + Secret Access Key — различни са от обичайните API ключове на проекта). Преди това си създайте и поне един bucket от Storage → New bucket (маркирайте го „Public“, за да се показват логата директно). „Force path style“ оставете true за Supabase.",
    fields: [
      { key: "S3_ENDPOINT", label: "Endpoint", secret: false, placeholder: "https://<project-ref>.supabase.co/storage/v1/s3" },
      { key: "S3_REGION", label: "Region", secret: false, placeholder: "напр. eu-central-1" },
      { key: "S3_ACCESS_KEY_ID", label: "Access Key ID", secret: false },
      { key: "S3_SECRET_ACCESS_KEY", label: "Secret Access Key", secret: true },
      { key: "S3_BUCKET", label: "Bucket (по подразбиране)", secret: false, placeholder: "напр. catchcount" },
      { key: "S3_PUBLIC_BUCKET", label: "Bucket за публични файлове (по избор)", secret: false, placeholder: "оставете празно, за да ползва bucket-а по-горе" },
      { key: "S3_PUBLIC_BASE_URL", label: "Публичен URL адрес на bucket-а (по избор)", secret: false, placeholder: "напр. https://<project-ref>.supabase.co/storage/v1/object/public/catchcount" },
      { key: "S3_FORCE_PATH_STYLE", label: "Force path style (true/false)", secret: false, placeholder: "true" },
    ],
  },
  {
    id: "adsense",
    title: "Google AdSense",
    description: "Показва резервни AdSense реклами (Auto ads) само на местата, където иначе би стояло празно/плейсхолдър \"рекламирай тук\" — никога не измества собствена платена реклама или слот. Изключено е за потребители с активен premium (включително спечелен чрез поканите — вижте „Покани приятел“ на Таблото).",
    registerUrl: "https://www.google.com/adsense/start/",
    registerLabel: "Регистрация в Google AdSense",
    note: "Нужен е одобрен AdSense акаунт за вашия домейн — Google трябва първо да прегледа и одобри сайта. Publisher ID-то не е тайна (винаги е видимо в html кода на страницата), затова тук не се крие като парола.",
    fields: [
      { key: "ADSENSE_ENABLED", label: "Включен (true/false)", secret: false, placeholder: "true" },
      { key: "ADSENSE_PUBLISHER_ID", label: "Publisher ID", secret: false, placeholder: "ca-pub-XXXXXXXXXXXXXXXX" },
    ],
  },
];

export default function AdminSetup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [migrations, setMigrations] = useState(null);
  const [applyingMigration, setApplyingMigration] = useState("");

  // v2.88 — admin-configurable menu order ("Режим на подреждане на
  // менюто"). `menuOrder` is the currently SAVED order (what every user's
  // own Layout.jsx is rendering right now); `orderDraft` is the working
  // copy being dragged while the switch below is on. Toggling the switch
  // OFF saves `orderDraft` as the new `menuOrder` for everyone — see
  // handleReorderToggle. The on/off state itself is purely local UI state,
  // never persisted (there's nothing to "leave on" across page loads).
  const [menuOrder, setMenuOrder] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [orderDraft, setOrderDraft] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    load();
    loadMigrations();
    loadMenuOrder();
  }, []);

  async function loadMenuOrder() {
    try {
      const data = await base44.settings.getMenuOrder();
      setMenuOrder(normalizeMenuOrder(data?.order));
    } catch {
      setMenuOrder(normalizeMenuOrder(null));
    }
  }

  function startReorder() {
    setOrderDraft(cloneOrder(menuOrder || normalizeMenuOrder(null)));
    setReorderMode(true);
  }

  async function finishReorder() {
    setReorderMode(false);
    const toSave = orderDraft;
    setOrderDraft(null);
    if (!toSave) return;
    setSavingOrder(true);
    try {
      await base44.admin.updateSettings({ MENU_ORDER: JSON.stringify(toSave) });
      setMenuOrder(toSave);
      toast({ title: "Подредбата на менюто е запазена", description: "Новият ред важи за всички потребители от сега нататък." });
    } catch (e) {
      toast({ title: "Грешка при запазване на подредбата", description: e.message, variant: "destructive" });
    } finally {
      setSavingOrder(false);
    }
  }

  function handleReorderToggle(checked) {
    if (checked) startReorder();
    else finishReorder();
  }

  async function resetMenuOrderToDefault() {
    if (!window.confirm("Да се възстанови подредбата на менюто по подразбиране за всички потребители?")) return;
    setSavingOrder(true);
    try {
      await base44.admin.updateSettings({ MENU_ORDER: JSON.stringify(DEFAULT_MENU_ORDER) });
      const normalized = normalizeMenuOrder(DEFAULT_MENU_ORDER);
      setMenuOrder(normalized);
      setOrderDraft(null);
      setReorderMode(false);
      toast({ title: "Подредбата по подразбиране е възстановена" });
    } catch (e) {
      toast({ title: "Грешка", description: e.message, variant: "destructive" });
    } finally {
      setSavingOrder(false);
    }
  }

  function onMenuDragEnd(result) {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (source.droppableId !== destination.droppableId) return; // groups have distinct dnd `type`s, so this shouldn't fire — kept as a defensive no-op

    setOrderDraft((prev) => {
      if (!prev) return prev;
      const next = cloneOrder(prev);
      if (source.droppableId === "top") {
        const [moved] = next.top.splice(source.index, 1);
        next.top.splice(destination.index, 0, moved);
      } else if (source.droppableId.startsWith("group:")) {
        const gid = source.droppableId.slice("group:".length);
        const [moved] = next.groups[gid].splice(source.index, 1);
        next.groups[gid].splice(destination.index, 0, moved);
      }
      return next;
    });
  }

  const labelByPath = useMemo(() => new Map(ALL_MENU_ITEMS.map((m) => [m.path, m.labelKey])), []);

  function slotLabel(key) {
    if (key.startsWith("group:")) {
      const gid = key.slice("group:".length);
      const def = GROUP_DEFS.find((g) => g.id === gid);
      return def ? t(def.labelKey) : gid;
    }
    return t(labelByPath.get(key)) || key;
  }

  // v2.68 — self-serve alternative to running `npm run migrate` by hand
  // (see server/routes/adminMigrations.ts for why): applies a small,
  // hand-picked, idempotent piece of server/schema/schema.sql directly
  // against the live database, with one button per pending update.
  async function loadMigrations() {
    try {
      const data = await base44.migrations.status();
      setMigrations(data);
    } catch {
      setMigrations(null);
    }
  }

  async function applyMigration(id) {
    setApplyingMigration(id);
    try {
      await base44.migrations.apply(id);
      await loadMigrations();
      toast({ title: "Обновлението е приложено успешно" });
    } catch (e) {
      toast({ title: "Грешка при обновяване на базата данни", description: e.message, variant: "destructive" });
    } finally {
      setApplyingMigration("");
    }
  }

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
    if (section.id === "payment") {
      // "Configured" here means at least one payment method is actually
      // usable — not every field filled in (BIC/note are optional, and an
      // admin may only want one of Revolut/bank, not both).
      const revolutOk = status.PAYMENT_REVOLUT_ENABLED?.value === "true" && (status.PAYMENT_REVOLUT_TAG?.configured || status.PAYMENT_REVOLUT_URL?.configured);
      const bankOk = status.PAYMENT_BANK_ENABLED?.value === "true" && status.PAYMENT_BANK_IBAN?.configured;
      return Boolean(revolutOk || bankOk);
    }
    // Optional fields (per section) that shouldn't block the "Настроено"
    // badge on their own — mirrors the SMTP/Google exclusions above.
    const OPTIONAL_KEYS = new Set([
      "SMTP_PORT", "SMTP_SECURE", "EMAIL_FROM", "GOOGLE_REDIRECT_URI",
      "S3_ENDPOINT", "S3_REGION", "S3_PUBLIC_BUCKET", "S3_PUBLIC_BASE_URL", "S3_FORCE_PATH_STYLE",
    ]);
    return section.fields
      .filter((f) => !OPTIONAL_KEYS.has(f.key))
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

  // Sends a real email through the currently SAVED SMTP settings (whatever
  // was last "Запази"-d, not the possibly-unsaved draft in the fields above)
  // to the admin's own address — so misconfigured SMTP is caught here
  // instead of silently during a real user's registration/reset email.
  async function testEmail() {
    if (!user?.email) return;
    setTestingEmail(true);
    try {
      await base44.admin.sendTestEmail(user.email);
      toast({ title: `Тестовият имейл е изпратен до ${user.email}`, description: "Проверете входящата си поща (и папка Спам)." });
    } catch (e) {
      toast({ title: "Тестовият имейл не бе изпратен", description: e.message, variant: "destructive" });
    } finally {
      setTestingEmail(false);
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
        Снимките на уловите се съхраняват директно в базата данни (компресирани на телефона/браузъра
        до ~400-500KB) — не се изисква никакво отделно (платено) файлово хранилище.
      </p>

      {migrations && Object.entries(migrations).some(([, m]) => !m.applied) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="w-4 h-4 text-cyan-600" />
              База данни
            </CardTitle>
            <CardDescription>
              Нови версии понякога добавят по едно-две малки, безопасни за пускане повторно, обновления към базата
              данни. Кодът вече стигна дотук с обикновен push през GitHub Desktop — остава само да натиснете бутона
              за всяко обновление по-долу (веднъж е достатъчно).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(migrations)
              .filter(([, m]) => !m.applied)
              .map(([id, m]) => (
                <div key={id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10">
                  <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-400">
                    <CircleDashed className="w-4 h-4 flex-shrink-0" />
                    {m.label}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => applyMigration(id)}
                    disabled={applyingMigration !== ""}
                    className="bg-cyan-600 hover:bg-cyan-700 min-h-[36px] flex-shrink-0"
                  >
                    {applyingMigration === id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Приложи обновление
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="w-4 h-4 text-cyan-600" />
            Подредба на менюто
          </CardTitle>
          <CardDescription>
            {reorderMode
              ? "Влачете елементите (или подменютата като цяло), за да зададете новия ред. Изключете превключвателя, когато сте готови — редът се запазва веднага и важи за всички потребители."
              : "Включете превключвателя, за да пренаредите менюто с влачене (мишка или пръст на телефона). Изключете го, когато подредбата ви устройва — тогава новият ред се запазва и важи за всички потребители, не само за вас."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-accent/50">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-muted-foreground">
              {savingOrder && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
              Режим на подреждане {reorderMode ? "(включен)" : "(изключен)"}
            </div>
            <Switch checked={reorderMode} onCheckedChange={handleReorderToggle} disabled={savingOrder || !menuOrder} />
          </div>

          {reorderMode && orderDraft && (
            <DragDropContext onDragEnd={onMenuDragEnd}>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">Основен ред на менюто</p>
                <Droppable droppableId="top" type="MENU_TOP">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                      {orderDraft.top.map((key, index) => (
                        <Draggable key={key} draggableId={key} index={index}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                                snapshot.isDragging
                                  ? "border-cyan-400 shadow-lg bg-white dark:bg-card"
                                  : "border-slate-100 dark:border-border bg-white dark:bg-card"
                              }`}
                            >
                              <span
                                {...dragProvided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-muted-foreground flex-shrink-0"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                              <span className="flex-1 min-w-0 break-words text-slate-700 dark:text-foreground">
                                {slotLabel(key)}
                              </span>
                              {key.startsWith("group:") && (
                                <Badge variant="secondary" className="text-[10px] flex-shrink-0">подменю</Badge>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>

              {orderDraft.top
                .filter((key) => key.startsWith("group:"))
                .map((key) => {
                  const gid = key.slice("group:".length);
                  const def = GROUP_DEFS.find((g) => g.id === gid);
                  return (
                    <div className="space-y-1.5" key={key}>
                      <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
                        Ред вътре в „{def ? t(def.labelKey) : gid}“
                      </p>
                      <Droppable droppableId={key} type={`MENU_GROUP_${gid}`}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                            {(orderDraft.groups[gid] || []).map((gKey, gIndex) => (
                              <Draggable key={gKey} draggableId={gKey} index={gIndex}>
                                {(dragProvided, snapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                      snapshot.isDragging
                                        ? "border-cyan-400 shadow bg-white dark:bg-card"
                                        : "border-slate-100 dark:border-border bg-slate-50 dark:bg-accent/30"
                                    }`}
                                  >
                                    <span
                                      {...dragProvided.dragHandleProps}
                                      className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-muted-foreground flex-shrink-0"
                                    >
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="flex-1 min-w-0 break-words text-slate-600 dark:text-muted-foreground">
                                      {slotLabel(gKey)}
                                    </span>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
            </DragDropContext>
          )}
        </CardContent>
        <CardFooter className="gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={resetMenuOrderToDefault}
            disabled={savingOrder}
            className="min-h-[40px]"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Подредба по подразбиране
          </Button>
        </CardFooter>
      </Card>

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
            <CardFooter className="gap-2 flex-wrap">
              <Button
                onClick={() => saveSection(section)}
                disabled={saving !== ""}
                className="bg-cyan-600 hover:bg-cyan-700 min-h-[40px]"
              >
                {saving === section.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Запази
              </Button>
              {section.id === "email" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={testEmail}
                  disabled={testingEmail || saving !== ""}
                  className="min-h-[40px]"
                  title={`Изпраща тестов имейл до ${user?.email || ""} през записаните SMTP настройки`}
                >
                  {testingEmail ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Изпрати тестов имейл
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

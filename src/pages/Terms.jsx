import React from "react";
import { Link } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// v2.97 — "Общи условия" (Terms & Conditions / Privacy notice). Deliberately
// a standalone route OUTSIDE the authenticated <Layout> (see App.jsx) so it
// is reachable without logging in — a visitor should be able to read it
// before registering, and it should keep working even if a session expires.
// Content is static Bulgarian text (not run through the i18n dictionary,
// unlike the rest of the app) since this is the app's one authoritative
// legal document, not UI chrome — translating it piecemeal risks the
// translated version drifting out of sync with what actually governs use
// of the app. Covers, per the site owner's request: voluntary sharing of
// sensitive data (location, photos, email, phone), plus a standard set of
// additional clauses for a small EU/Bulgaria-based consumer app.
export default function Terms() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-cyan-50 dark:from-background dark:via-background dark:to-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-600" />
            <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">Общи условия и поверителност</h1>
          </div>
          <Link
            to={isAuthenticated ? "/" : "/login"}
            className="flex items-center gap-1 text-sm text-cyan-700 dark:text-cyan-400 hover:underline min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" /> Назад
          </Link>
        </div>

        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-5 text-sm leading-relaxed text-slate-700 dark:text-muted-foreground">
          <p className="text-xs text-slate-400 dark:text-muted-foreground">
            Последна актуализация: 17.09.2026 г.
          </p>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">1. За приложението</h2>
            <p>
              CatchCount ("Риболовен Дневник", "Приложението") е мобилно уеб приложение (PWA) за
              водене на риболовен дневник, откриване на водоеми и участие в риболовни състезания,
              достъпно на catchcount.app4.you. Тези общи условия уреждат ползването на
              Приложението от негови регистрирани потребители.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">2. Доброволно споделяне на данни</h2>
            <p>
              Част от функционалностите на Приложението изискват потребителят доброволно да
              въведе или сподели определена информация, включително но не само: имейл адрес и
              телефонен номер (при регистрация, контакт с администратора или записване за
              състезание); географска локация (при отбелязване на място на риболов или улов);
              снимки (на улови, на профил, на реклами или на схема на водоем); данни за уловите
              (вид риба, тегло, оборудване, метеорологични условия) и друга подобна информация.
            </p>
            <p>
              Тази информация се споделя единствено по избор на потребителя — с цел
              функционирането на съответната функция (напр. локацията при записан улов, снимката
              при споделяне на резултат) — и не се използва извън обхвата, за който е предоставена,
              нито се продава на трети страни.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">3. Каква информация се обработва</h2>
            <p>
              Приложението съхранява: данни за регистрация (имейл, парола като хеш, роля); данни
              за уловите и риболовните сесии; локации, отбелязани от потребителя; снимки, качени
              от потребителя; съобщения, изпратени през формата "Връзка с нас" (имейл, телефон,
              текст); и техническа информация, необходима за работата на услугата (напр. IP адрес
              при заявки към сървъра, бисквитки/локално съхранение за поддържане на сесията).
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">4. Трети страни и услуги</h2>
            <p>
              Приложението може да използва вход през Google (Google Sign-In) като алтернатива на
              регистрация с парola, при което Google предоставя на Приложението основен профилен
              идентификатор (имейл, име). Приложението изпраща имейли (потвърждение на регистрация,
              възстановяване на парола, известия) през SMTP доставчик, избран от администратора.
              Приложението не споделя данни на потребители с рекламодатели извън обобщена,
              неперсонализирана статистика за показвания на реклами.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">5. Бисквитки и локално съхранение</h2>
            <p>
              Приложението използва локално съхранение на устройството (localStorage) за
              поддържане на влизането в системата, езиковите настройки, темата (светла/тъмна) и
              други предпочитания — не за проследяване на потребители извън самото приложение или
              за рекламни мрежи на трети страни.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">6. Права на потребителя</h2>
            <p>
              Всеки потребител има право да поиска преглед, корекция или изтриване на своите лични
              данни, съхранявани в Приложението, както и да оттегли съгласието си за обработка на
              доброволно споделена информация (напр. да изтрие снимка или локация от свой улов).
              Заявки се подават през формата "Връзка с нас" в менюто на Приложението.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">7. Съхранение на данните</h2>
            <p>
              Данните се съхраняват само за периода, необходим за предоставяне на услугата, или
              докато потребителят не поиска тяхното изтриване. При изтриване на акаунт свързаните
              с него лични данни се премахват или анонимизират в разумен срок.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">8. Минимална възраст</h2>
            <p>
              Приложението е предназначено за пълнолетни лица. Лица под 16-годишна възраст следва
              да ползват Приложението само със знанието и съгласието на родител или настойник.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">9. Отговорност</h2>
            <p>
              Информацията за водоеми, състезания, такси и условия се въвежда от съответните
              собственици/организатори и Приложението не носи отговорност за нейната точност или
              актуалност. Потребителите следва да проверяват детайлите директно със съответния
              организатор преди участие. Приложението се предоставя "както е", без гаранции за
              непрекъсната и безпроблемна работа.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">10. Промени в общите условия</h2>
            <p>
              Настоящите общи условия могат да бъдат актуализирани периодично. При съществени
              промени потребителите ще бъдат уведомени в самото приложение. Продължаването на
              ползването на Приложението след промяна се счита за съгласие с актуалната версия.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">11. Приложимо право</h2>
            <p>
              Настоящите общи условия се уреждат от законодателството на Република България и
              приложимото право на Европейския съюз (вкл. Общия регламент относно защитата на
              данните — GDPR).
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-semibold text-slate-800 dark:text-foreground">12. Контакт</h2>
            <p>
              За въпроси, свързани с тези общи условия или с лични данни, използвайте формата
              "Връзка с нас" в менюто на Приложението.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

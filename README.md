# CatchCount

Риболовно приложение — React/Vite фронтенд + собствен self-hosted backend
(**plain Node.js**, без Deno). Base44 вече не се използва никъде. Няма
платени услуги: базата е Postgres (Supabase free tier), имейлите вървят през
обикновен SMTP, а снимките на уловите се пазят директно в базата (компресирани
на телефона/браузъра до ~400-500KB), не в отделно (платено) файлово хранилище.

## Архитектура (един Vercel проект)

- `src/` — React фронтенд (страници, компоненти, утилити)
- `api/[...path].ts` — **единствената точка на вход за Vercel** — Vercel
  Function (Node.js runtime), catch-all за всичко под `/api/*`. Живее в
  СЪЩИЯ Vercel проект като фронтенда — едно repo, един deploy, никакъв
  отделен backend хостинг не е нужен.
- `server/` — цялата логика на API-то (auth, generic CRUD, качване/четене на
  снимки, имейли, admin настройки), написана като обикновени
  `(Request) => Response` функции. `server/router.ts` е споделеното ядро,
  което `api/[...path].ts` внася директно.
- `server/main.ts` — **опционален** самостоятелен вариант (същия
  `server/router.ts`, но пуснат като нормален Node HTTP сървър) — трябва Ви
  само ако решите да хоствате backend-а отделно (VPS, Render, Railway...)
  вместо през Vercel Functions. Не се ползва от Vercel deploy-а.
- `base44/` — оригиналните Base44 schema/functions файлове. Вече не се четат
  по време на изпълнение никъде — чисто исторически източник. Може да ги
  изтриете.

Целият flow е: GitHub repo → Vercel (build-va и фронтенда, и `/api/*`
функциите от същия push) → Supabase Postgres (през мрежата, обикновен
`DATABASE_URL`).

## Локално стартиране

Изисква се [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`) — то
пуска фронтенда И `/api` функциите заедно на един порт, точно както работят в
продукция:

```bash
npm install
cp .env.example .env.local     # DATABASE_URL, JWT_SECRET и т.н. — виж по-долу
vercel dev
```

Преди първо стартиране приложете схемата към базата:

```bash
cd server
npm install
npm run migrate                # прилага server/schema/schema.sql към DATABASE_URL
```

Ако предпочитате да ползвате `server/` като отделен процес вместо `vercel dev`
(напр. за self-host извън Vercel), вижте `server/README.md`.

## Deploy (Vercel + Supabase, безплатно)

1. **База данни** — в Supabase → Project Settings → Database вземете
   connection string-а на **connection pooler-а** (Transaction mode, порт
   `6543` — не директната връзка на порт 5432; сериите функции на Vercel са
   краткотрайни и директните връзки бързо изчерпват лимита на Postgres).
2. Приложете схемата веднъж към тази база: `cd server && npm install && npm run migrate` (с `DATABASE_URL` сочещ към стъпка 1, в `server/.env`).
3. **Vercel → Project Settings → Environment Variables**, добавете поне:
   - `DATABASE_URL` — pooler connection string-ът от стъпка 1
   - `JWT_SECRET` — произволен дълъг таен низ
   - `PUBLIC_APP_URL` — публичния адрес на самия Vercel проект (напр.
     `https://cath-counter.vercel.app`)
   - по избор: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`,
     `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`
     (всички тези може да се зададат и по-late от Admin → Настройка вътре в
     приложението, без redeploy)
   - **`VITE_API_URL` не се задава** — фронтендът вика `/api/...` на същия
     домейн по подразбиране.
4. Redeploy (push към GitHub клонa, свързан с Vercel проекта, е достатъчно).
5. Регистрирайте първия потребител през сайта — той автоматично става admin,
   без нужда от имейл потвърждение (виж `server/routes/auth.ts`).

## Инсталиране на Android (PWA)

Няма отделен `.apk` файл — приложението е **инсталируемо direct от браузъра**
(Progressive Web App), което на Android изглежда и се държи като нормално
приложение (собствена икона на началния екран, стартира в цял екран, работи
offline благодарение на `public/sw.js`).

1. Сайтът вече е на **HTTPS** през Vercel — service worker-ите го изискват.
2. Отворете сайта в Chrome на телефона.
3. Chrome сам предлага "Инсталирай приложение" / "Добави към началния екран"
   (или през менюто ⋮ → "Инсталиране на приложение").

Файлове, добавени за това: `public/manifest.json` (име, икони, цветове),
`public/sw.js` (offline кеш на shell-а — данните вече се управляват отделно
от `src/lib/localDb.js`/`syncEngine.js`), и регистрацията в `src/main.jsx`.

Ако по-късно все пак поискате истински `.apk` (напр. за Google Play), най-бързият
път е [Capacitor](https://capacitorjs.com/) върху същия build — обвива вече
готовия PWA в native Android shell, но изисква Android Studio локално, за да
се компилира.

## Какво се промени спрямо предишни версии

| Преди | Сега |
|---|---|
| Base44 SDK / платформа | `src/api/base44Client.js` говори директно с `/api/*` |
| Deno backend, два отделни процеса локално | Plain Node.js, вградено в същия Vercel проект (`api/[...path].ts`) |
| Stripe плащания | премахнато изцяло — таксите (реклами, състезания, резервации) се уреждат ръчно (виж `src/lib/payment.js`) |
| Resend (платен имейл API) | обикновен конфигурируем SMTP (`server/lib/email.ts`) |
| S3/R2/B2 хранилище за снимки | снимките се компресират на клиента (~400-500KB) и се пазят директно в Postgres (`catch_photos` таблица) |
| Ръчно "направи ме admin" | първият регистриран потребител автоматично е admin, без имейл верификация |

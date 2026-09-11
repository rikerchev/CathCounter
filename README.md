# CatchCount

Риболовно приложение — React/Vite фронтенд + собствен self-hosted backend
(Deno + PostgreSQL). Base44 вече не се използва никъде — нито SDK-то на
фронтенда, нито платформата за backend функциите.

## Структура

- `src/` — React фронтенд (страници, компоненти, утилити)
- `server/` — self-hosted Deno backend (заменя Base44 изцяло): auth, generic
  CRUD за всички entity-та, Stripe плащания, качване на снимки, имейли
- `base44/entities/*.jsonc` — оригиналните Base44 schema файлове. Вече не се
  четат по време на изпълнение — пазят се само като исторически източник, от
  който е генерирана `server/schema/`. Може да ги изтриете, ако не Ви трябват.
- `base44/functions/*/entry.ts` — оригиналните Base44 функции. Логиката им е
  пренесена в `server/routes/functions.ts`; тези файлове вече не се изпълняват.

## Инсталация и локално стартиране

Изисква се [Deno](https://deno.com) за backend-а (има Node fallback само за
командата за миграция, но не и за самия сървър — виж `server/README.md`).

**Важно:** фронтендът и backend-ът са два отделни процеса — трябват Ви
**два терминала едновременно**, не само `npm run dev`.

```bash
# Терминал 1 — Backend
cd server
cp .env.example .env       # попълнете DATABASE_URL и останалите ключове
deno task migrate          # прилага server/schema/schema.sql (или: npm install && npm run migrate)
deno task dev               # стартира API-то на :8787

# Терминал 2 — Frontend (от корена на проекта)
cp .env.example .env       # VITE_API_URL по подразбиране сочи localhost:8787
npm install
npm run dev                 # стартира Vite на :5173
```

Подробности за backend-а (нужни env променливи, локален PostgreSQL setup,
Google OAuth setup, S3 хранилище, Stripe webhook) — виж `server/README.md`.

## Инсталиране на Android (PWA)

Няма отделен `.apk` файл — приложението е **инсталируемо direct от браузъра**
(Progressive Web App), което на Android изглежда и се държи като нормално
приложение (собствена икона на началния екран, стартира в цял екран, работи
offline благодарение на `public/sw.js`).

1. Качете фронтенда някъде с **HTTPS** (Vercel/Netlify/Cloudflare Pages —
   всяко от тях работи с `npm run build`; service worker-ите изискват HTTPS,
   с изключение на `localhost` за локално тестване).
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



| Преди (Base44) | Сега |
|---|---|
| `@base44/sdk` на фронтенда | `src/api/base44Client.js` — същия интерфейс, говори с `server/` |
| `@base44/vite-plugin` | обикновен `@vitejs/plugin-react` + ръчен `@/` alias във `vite.config.js` |
| Base44 auth (email/парола, OTP, Google, забравена парола) | `server/routes/auth.ts` — собствен JWT + bcrypt + Google OAuth |
| Base44 entity storage + RLS | PostgreSQL (`server/schema/`) + `server/middleware/authorize.ts` |
| `base44/functions/*` (Deno функции на платформата) | `server/routes/functions.ts` |
| `integrations.Core.UploadFile/UploadPublicFile` | `server/lib/s3.ts` — generic S3-съвместимо хранилище (R2/S3/B2/MinIO) |
| `integrations.Core.SendEmail` | `server/lib/email.ts` (Resend) |
| `integrations.Core.InvokeLLM` | `server/lib/llm.ts` — работещ stub; сложете `LLM_API_KEY`, за да го включите истински |
| MCP OAuth consent (`src/pages/OAuthConsent.jsx`) | премахнато — Base44-специфична платформена функция без self-host еквивалент |

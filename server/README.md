# CatchCount backend (plain Node.js + PostgreSQL)

No Deno anywhere. The whole backend is written as plain
`(Request) => Response` functions (`server/router.ts` + `server/routes/*`),
so it can run two different ways without any code changes:

1. **As Vercel Functions** (the actual deployment) — `api/[...path].ts` at
   the repo root imports `server/router.ts` directly. Same Vercel project as
   the frontend, no separate hosting account needed. This is what `npm run
   build`/the Vercel deploy actually uses.
2. **As a standalone process** (`server/main.ts`) — only if you want to
   self-host outside Vercel (a VPS, Render, Railway, ...). Wraps the same
   `router.ts` in a plain `node:http` server.

## 0. Local development

Use the Vercel CLI so the frontend and `/api/*` run together on one port,
exactly like production:

```bash
npm i -g vercel     # once
npm install         # repo root — installs the deps api/[...path].ts needs too
vercel dev
```

If you'd rather run the backend as its own process (option 2 above) instead
of `vercel dev`:

```bash
cd server
npm install
npm run dev          # tsx --watch main.ts, listens on :8787
```

## 1. Database (Supabase, or any Postgres)

1. Create a project at https://supabase.com (free tier).
2. Project Settings → Database → copy the **connection pooler** string
   (Transaction mode, port `6543`) — not the direct connection on port 5432.
   Vercel Functions are short-lived and spin up many of them; the pooler
   (PgBouncer) is what keeps that from exhausting Postgres's connection
   limit. `server/db.ts` already sets `prepare: false`, which is required
   for PgBouncer transaction-mode pooling.
3. `cd server && cp .env.example .env`, paste it in as `DATABASE_URL`, plus a
   random `JWT_SECRET`.
4. Apply the schema once:
   ```bash
   npm install
   npm run migrate    # runs scripts/migrate.mjs against DATABASE_URL
   ```
   Re-running it on an already-migrated database will error on
   `CREATE TABLE` — expected and harmless (means it already ran).

Any other Postgres (Neon, RDS, local) works identically — just skip the
pooler-string step and use the plain connection string.

`schema/schema.sql` and `schema/entities.generated.ts` were originally
generated from `base44/entities/*.jsonc` (kept only as a historical
reference now, not read at runtime). To add fields to an entity later, edit
`schema/entities.generated.ts` and write the matching `ALTER TABLE` by hand.

## 2. Deploying (Vercel)

Set these in Vercel → Project Settings → Environment Variables (no
`server/.env` file exists in production — Vercel injects them directly):

- `DATABASE_URL` — the Supabase pooler string from step 1
- `JWT_SECRET` — a random long string
- `PUBLIC_APP_URL` — the Vercel project's own public URL (used for CORS and
  for building links in emails)
- optional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`,
  `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`

`VITE_API_URL` is **not** needed — the frontend calls `/api/...` on the same
origin by default (see `src/api/base44Client.js`).

Any of the optional integrations above can also be set later from **Admin →
Настройка на интеграциите** in the running app instead of as env vars — they
save to the `app_settings` table (`server/lib/settings.ts`) and apply
immediately, no redeploy needed.

## 3. Google OAuth (social login, optional)

1. Create OAuth 2.0 credentials at
   https://console.cloud.google.com/apis/credentials
2. Add an **Authorized redirect URI** matching `GOOGLE_REDIRECT_URI` exactly,
   e.g. `https://your-app.vercel.app/api/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

Without these, `loginWithProvider("google")` returns a 501 instead of
crashing — email/password, OTP, and reset flows all work independently of
Google being configured.

## 4. Email (plain SMTP — no paid API)

Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/
`EMAIL_FROM` (`server/lib/email.ts`, via `nodemailer`). Any SMTP server
works — your own mail server, a free-tier transactional sender, or Gmail
SMTP for local testing. Without `SMTP_HOST` set, emails are skipped with a
console warning instead of throwing — fine for local dev, not for
production (registration/reset flows depend on these emails arriving).

## 5. Photos (stored in Postgres, not S3)

`server/routes/catchPhotos.ts` stores catch photos directly as `BYTEA` in
the `catch_photos` table — no object storage account (S3/R2/B2/...) needed
at all. The client compresses every photo to ~400-500KB first
(`src/lib/imageCompression.js`) specifically so a large number of catches
still fit inside a free-tier Postgres database.

`server/lib/s3.ts` and `server/routes/uploads.ts` are leftover/unused code
from an earlier S3-based version — nothing imports them anymore, safe to
delete.

## 6. Payments

Stripe has been removed entirely — no payment processor is wired in. Paid
features (ad slots, competition fees, sector reservations) are settled
manually (bank transfer / Revolut, see `src/lib/payment.js`); an admin marks
the relevant record as paid by hand via the admin screens.

## 7. LLM (optional)

Off by default (`LLM_PROVIDER=none`) — `invokeLLM` returns a clearly-marked
placeholder instead of pretending to call a model. Set `LLM_PROVIDER` to
`anthropic` or `openai` plus `LLM_API_KEY` when/if you actually need it.

## Adding a new entity

1. Add a column set + access rule to `schema/entities.generated.ts`.
2. Write the matching `CREATE TABLE` in a new migration file (or by hand
   against your DB) — `schema.sql` is the initial migration, not re-run
   automatically.
3. `routes/entities.ts` is fully generic — no route code needed for new
   entities, and the frontend's `base44.entities.<Name>` works immediately
   since it's a lazy proxy over whatever entity name you ask for.

## Authorization model

`middleware/authorize.ts` mirrors each entity's original `rls` string from
`base44/entities/*.jsonc`:

- `public` — anyone, no auth required
- `authenticated` — any logged-in user
- `admin_only` — only `role = 'admin'` (admins bypass every rule anyway)
- `owner` — row's `created_by_id` (or a named field, e.g. `user_id`) must
  match the requester
- `relation_owner` — requester must own a *related* row (e.g. creating a
  `Competition` requires owning the `WaterBody` it points to)
- `owner_or_relation` — either of the above

An admin account always passes every check, matching how the original app's
admin pages (e.g. data export) read/write every entity regardless of RLS.

## The first account is admin automatically

`server/routes/auth.ts` checks whether the `users` table is empty on every
registration (and on the first Google sign-in). If it is, that account is
created as `role = 'admin'` with `email_verified = TRUE` and logged straight
in — no OTP step, no manual `UPDATE users SET role='admin'` needed. Every
account registered after that first one goes through the normal flow
(`user` role, email verification required).

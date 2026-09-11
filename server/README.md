# CatchCount backend (Deno + PostgreSQL)

Platform-independent by design: plain `Deno.serve`, no Deno Deploy–only or
Docker-only APIs. Runs the same way locally, in a container, on a VPS behind
systemd, or on Deno Deploy.

## 0. Two separate processes — this trips people up

The frontend (`npm run dev`, port 5173) and this backend (port 8787) are two
independent services. There's no single command that starts both — you need
**two terminal windows**:

```
# Terminal 1 — from the project root
npm run dev

# Terminal 2 — from server/
deno task dev
```

If you only run the first one, every API call in the browser console fails
with `ERR_CONNECTION_REFUSED` on `:8787` — that's not a bug, it just means
the second terminal hasn't been started yet.

## 1. Database

Any PostgreSQL works — a managed free tier (Neon, Supabase) or a local
install both work identically. Pick one:

### Option A — local PostgreSQL (Windows)

1. Download the installer from https://www.postgresql.org/download/windows/
   and run it (remember the password you set for the `postgres` user).
2. Or, if you have Docker Desktop: `docker run --name catchcount-db -e POSTGRES_PASSWORD=yourpassword -p 5432:5432 -d postgres`
3. Create a database for the app — easiest via pgAdmin (installed alongside
   Postgres) or:
   ```
   psql -U postgres -c "CREATE DATABASE catchcount;"
   ```
4. Your connection string is:
   ```
   DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/catchcount
   ```

### Option B — managed (Neon, generous free tier, zero local install)

1. https://neon.tech → sign up → **Create a project**.
2. Copy the connection string from the dashboard.

### Applying the schema

You need `server/.env` set up first either way:
```
cd server
cp .env.example .env       # paste DATABASE_URL in, plus a JWT_SECRET
```

Then apply `schema/schema.sql` — **pick whichever runtime you already have,
you don't need both**:

```bash
# With Deno (recommended — same runtime the server itself uses):
deno task migrate

# With Node instead, if you don't want to install Deno just for this:
npm install
npm run migrate
```

Either one does the same thing: creates every table once. Re-running it on
an already-migrated database will error on `CREATE TABLE` — that's expected
and harmless (it means it already ran).

`schema/schema.sql` and `schema/entities.generated.ts` were generated from
`base44/entities/*.jsonc`. If you need to change an entity's fields later,
edit `schema/entities.generated.ts` and write the matching `ALTER TABLE` by
hand — it's no longer auto-regenerated from the `.jsonc` files.

## 2. Run the server

**Running the server itself (`main.ts`) needs Deno** — it uses `Deno.serve`,
`Deno.env`, and `npm:` import specifiers directly, none of which exist in
Node. The migration script above is the one piece that has a Node fallback;
the API server does not. Install Deno from https://deno.com if you don't
have it yet — one installer, no separate runtime config needed.

```bash
deno task dev      # --watch, for local development
deno task start    # plain run, for production
```

Listens on `PORT` (default 8787). All routes are under `/api/*`.


## 3. Google OAuth (social login)

1. Create OAuth 2.0 credentials at
   https://console.cloud.google.com/apis/credentials
2. Add an **Authorized redirect URI** matching `GOOGLE_REDIRECT_URI` exactly,
   e.g. `https://api.yourdomain.com/api/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

Without these set, `loginWithProvider("google")` on the frontend returns a 501
rather than crashing — every other auth flow (email/password, OTP, reset)
works independently of Google being configured.

## 4. Photo storage (generic S3-compatible)

`server/lib/s3.ts` doesn't hardcode a provider — it talks to any S3-compatible
endpoint. You said you don't have an account yet, so nothing will upload until
you set these:

- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` — from whichever provider you pick
- `S3_ENDPOINT` — leave empty for real AWS S3; set it for anything else, e.g.:
  - Cloudflare R2: `https://<account_id>.r2.cloudflarestorage.com`
  - Backblaze B2: `https://s3.<region>.backblazeb2.com`
  - MinIO (self-hosted): `http://localhost:9000`
- `S3_BUCKET` — bucket name (create it on the provider first)
- `S3_PUBLIC_BASE_URL` — if the bucket sits behind a public domain/CDN, photo
  URLs are built directly from it; otherwise the server falls back to signed
  URLs valid for 7 days (fine to start with, but re-fetch before they expire
  if you display old photos)

Until these are set, uploads fail with a clear "Object storage is not
configured yet" error rather than silently no-op-ing.

## 5. Email (Resend)

Set `RESEND_API_KEY` and `EMAIL_FROM` (must be a domain you've verified with
Resend). Without a key, emails are skipped with a console warning instead of
throwing — useful for local dev, not for production (registration/reset flows
depend on these emails arriving).

## 6. Stripe

Same keys as before (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Point your
Stripe webhook endpoint at `https://api.yourdomain.com/api/functions/stripe-webhook`.

`create-stripe-connect-account` writes `water_bodies.stripe_account_id` — a
column added manually in `schema.sql` since Base44 tracked it as an internal
field not present in `WaterBody.jsonc`.

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

## Setup Wizard (configure integrations through the UI)

Instead of editing `server/.env` and restarting, an admin can go to
**Admin → Настройка на интеграциите** (`/admin-setup`) in the app and paste
in Google OAuth, S3, Resend, and Stripe credentials directly — they're saved
to the `app_settings` table (`server/lib/settings.ts`) and take effect
immediately. `DATABASE_URL` and `JWT_SECRET` still have to live in `.env`
(you need a DB connection before that table is even readable); everything
else can go through the wizard instead.

**Bootstrapping the first admin:** the wizard is admin-only, and a brand new
database has no admin yet. Register a normal account through the app first,
then promote it once, directly in the database (Neon/Supabase both have a
SQL editor in their dashboard):

```sql
UPDATE users SET role = 'admin', roles = ARRAY['admin'] WHERE email = 'you@example.com';
```

After that, every optional integration can be configured from `/admin-setup`
without ever touching `.env` again.


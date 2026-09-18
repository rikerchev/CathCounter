import { sql } from "../db.js";
import { env } from "../env.js";
import { sendEmail } from "../lib/email.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Dispatch table mirroring `base44.functions.invoke(name, payload)` from the
 * frontend — same function names, same request/response shape, just backed
 * by our own DB instead of the base44 SDK / `base44:runtime` secrets.
 *
 * Note: the paid Stripe checkout/webhook/Connect functions that used to live
 * here have been removed — no paid payment processor is required to run
 * this app. Any paid feature (ad slots, competition fees, sector
 * reservations) is settled manually (e.g. bank transfer / Revolut, see
 * src/lib/payment.js) and an admin marks the relevant record as paid by hand
 * via the admin screens instead of an automatic webhook.
 */
export async function handleFunctionsRoute(
  req: Request,
  path: string[], // [functionName]
  user: AuthUser | null,
): Promise<Response> {
  const [name] = path;

  if (name === "notify-competition-users" && req.method === "POST") {
    try {
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { competition_id } = await req.json();
      if (!competition_id) return json({ error: "Missing competition_id" }, 400);

      const comps = await sql`SELECT * FROM competitions WHERE id = ${competition_id}`;
      if (!comps.length) return json({ error: "Competition not found" }, 404);
      const competition = comps[0];

      let waterBody = null;
      if (competition.water_body_id) {
        const wbs = await sql`SELECT * FROM water_bodies WHERE id = ${competition.water_body_id}`;
        waterBody = wbs[0] ?? null;
      }

      const isAuthorized = isAdmin(user) ||
        (waterBody && waterBody.created_by_id === user.id);
      if (!isAuthorized) return json({ error: "Forbidden" }, 403);

      const targetCountry = waterBody?.country || "";
      const fee = competition.fee ?? waterBody?.fee_per_person ?? 0;

      const targetUsers = targetCountry
        ? await sql`SELECT * FROM users WHERE country = ${targetCountry}`
        : await sql`SELECT * FROM users`;

      if (!targetUsers.length) return json({ notified: 0, message: "No users found" });

      const registrationUrl = `${env.PUBLIC_APP_URL}/competitions?comp=${competition.id}`;

      // Fire-and-forget, same as base44's `waitUntil` — respond immediately,
      // keep sending in the background. `EdgeRuntime`/`waitUntil` doesn't
      // exist as a plain Deno API, so this just lets the promise run
      // detached; the process needs to stay alive until it settles (true for
      // a long-running server, unlike a one-shot edge function).
      (async () => {
        for (const u of targetUsers) {
          try {
            await sendEmail({
              to: u.email,
              subject: `Ново състезание: ${competition.title}`,
              html: `<p>Ново състезание "${competition.title}" очаква регистрация.</p><p><a href="${registrationUrl}">Регистрирай се</a></p>`,
            });
          } catch { /* best-effort */ }
          try {
            await sql`
              INSERT INTO notifications (user_id, type, title, message, link, read, created_by_id)
              VALUES (${u.id}, 'competition', ${`Ново състезание: ${competition.title}`},
                      ${`Състезанието "${competition.title}" вече е отворено за регистрация.`},
                      ${`/competitions?comp=${competition.id}`}, FALSE, ${user.id})
            `;
          } catch { /* best-effort */ }
        }
      })();

      return json({ notified: targetUsers.length, country: targetCountry || "all", fee });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  // v3.03 — "message everyone who's registered", grouped so a single
  // account that registered several participants (family/friends under one
  // login, see Competitions.jsx's handleRegister) gets exactly ONE email
  // listing all of them, not one per participant. Distinct from
  // notify-competition-users above, which announces a brand-new competition
  // to everyone in the water body's country — this one only reaches people
  // who already registered, with a custom message from the organizer.
  // Authorization mirrors competitionRegistrations.ts's reassign endpoint:
  // admin, or the competition's own organizer (competitions.created_by_id).
  if (name === "message-competition-participants" && req.method === "POST") {
    try {
      if (!user) return json({ error: "Unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      const competitionId = body?.competition_id;
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!competitionId) return json({ error: "Missing competition_id" }, 400);
      if (!message) return json({ error: "Съобщението е задължително" }, 400);

      const comps = await sql`SELECT * FROM competitions WHERE id = ${competitionId}`;
      if (!comps.length) return json({ error: "Competition not found" }, 404);
      const competition = comps[0];

      const isAuthorized = isAdmin(user) || competition.created_by_id === user.id;
      if (!isAuthorized) return json({ error: "Forbidden" }, 403);

      const regs = await sql`
        SELECT participant_name, registered_by_email FROM competition_registrations
        WHERE competition_id = ${competitionId} AND status = 'active'
      `;

      // One email per registering ACCOUNT (registered_by_email), not per
      // participant row — see the comment above.
      const groups = new Map<string, string[]>();
      let skipped = 0;
      for (const r of regs) {
        const email = (r.registered_by_email || "").trim().toLowerCase();
        if (!email) { skipped++; continue; }
        if (!groups.has(email)) groups.set(email, []);
        groups.get(email)!.push(r.participant_name);
      }

      if (!groups.size) return json({ notified: 0, skipped });

      // Fire-and-forget, same pattern as notify-competition-users above —
      // respond immediately, keep sending in the background.
      (async () => {
        for (const [email, names] of groups) {
          try {
            await sendEmail({
              to: email,
              subject: `Съобщение от организатора — ${competition.title}`,
              html: `<p>Съобщение от организатора на състезание „${competition.title}“, относно записан(и) от Вас участник(ци): <b>${names.join(", ")}</b>.</p><p>${message.replace(/\n/g, "<br>")}</p>`,
            });
          } catch { /* best-effort */ }
        }
      })();

      return json({ notified: groups.size, skipped });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  // v3.07 — "the draw's results are emailed to everyone immediately, every
  // time it runs" — the organizer's own stated reason: without this, a
  // draw could be re-run (edit competition -> resets it, see
  // WaterBodyManagement.jsx's saveCompetition/drawLotsFor) any number of
  // times before anyone notices, whether by an honest mistake or not. An
  // immediate email, sent automatically the moment `drawLotsFor` finishes
  // (both the first draw and every re-draw, never just the first), gives
  // every registered account durable, independent proof of what the draw
  // actually produced at that moment — the same trust problem
  // message-competition-participants above doesn't need to solve, since
  // that one is just the organizer's own free-text message, not a result
  // that needs to be tamper-evident.
  //
  // Grouped the same way as message-competition-participants — one email
  // per registering ACCOUNT (registered_by_email), listing every
  // participant that account registered along with their own drawn
  // sector/box, not one email per participant row. Authorization mirrors it
  // too: admin, or the competition's own organizer.
  if (name === "notify-draw-results" && req.method === "POST") {
    try {
      if (!user) return json({ error: "Unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      const competitionId = body?.competition_id;
      if (!competitionId) return json({ error: "Missing competition_id" }, 400);

      const comps = await sql`SELECT * FROM competitions WHERE id = ${competitionId}`;
      if (!comps.length) return json({ error: "Competition not found" }, 404);
      const competition = comps[0];

      const isAuthorized = isAdmin(user) || competition.created_by_id === user.id;
      if (!isAuthorized) return json({ error: "Forbidden" }, 403);

      const regs = await sql<{
        participant_name: string; registered_by_email: string | null;
        assigned_sector: string | null; assigned_box: string | null;
      }[]>`
        SELECT participant_name, registered_by_email, assigned_sector, assigned_box
        FROM competition_registrations
        WHERE competition_id = ${competitionId} AND status = 'active' AND assigned_box IS NOT NULL
      `;

      // One email per registering ACCOUNT, listing every one of their
      // participants' own drawn sector/box — same grouping rationale as
      // message-competition-participants above.
      const groups = new Map<string, { name: string; sector: string | null; box: string | null }[]>();
      let skipped = 0;
      for (const r of regs) {
        const email = (r.registered_by_email || "").trim().toLowerCase();
        if (!email) { skipped++; continue; }
        if (!groups.has(email)) groups.set(email, []);
        groups.get(email)!.push({ name: r.participant_name, sector: r.assigned_sector, box: r.assigned_box });
      }

      if (!groups.size) return json({ notified: 0, skipped });

      // Fire-and-forget, same pattern as the functions above — respond
      // immediately (drawLotsFor's own toast shouldn't wait on email
      // delivery), keep sending in the background.
      (async () => {
        for (const [email, entries] of groups) {
          try {
            const rows = entries
              .map((e) => `<li><b>${e.name}</b>: ${e.sector ? `${e.sector}/` : ""}${e.box}</li>`)
              .join("");
            await sendEmail({
              to: email,
              subject: `Резултати от жребий — ${competition.title}`,
              html: `<p>Жребият за състезание „${competition.title}“ беше изтеглен. Изпратените по-долу резултати за записан(и) от Вас участник(ци) са получени автоматично, веднага след тегленето:</p><ul>${rows}</ul><p>Това автоматично известие гарантира, че резултатите от жребия не могат да бъдат променени незабелязано.</p>`,
            });
          } catch { /* best-effort */ }
        }
      })();

      return json({ notified: groups.size, skipped });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  // v3.03 — "a registered participant can email the organizer" (the other
  // direction from the function above). Resolved via
  // competitions.created_by_id -> users.email; replyTo is set to the
  // sender's own email so the organizer can just hit reply.
  if (name === "contact-competition-organizer" && req.method === "POST") {
    try {
      if (!user) return json({ error: "Unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      const competitionId = body?.competition_id;
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!competitionId) return json({ error: "Missing competition_id" }, 400);
      if (!message) return json({ error: "Съобщението е задължително" }, 400);

      const comps = await sql`SELECT * FROM competitions WHERE id = ${competitionId}`;
      if (!comps.length) return json({ error: "Competition not found" }, 404);
      const competition = comps[0];

      const myRegs = await sql<{ participant_name: string }[]>`
        SELECT participant_name FROM competition_registrations
        WHERE competition_id = ${competitionId} AND created_by_id = ${user.id} AND status = 'active'
      `;
      if (!myRegs.length && !isAdmin(user)) {
        return json({ error: "Трябва да сте записани за това състезание" }, 403);
      }

      if (!competition.created_by_id) return json({ error: "Организаторът не е намерен" }, 404);
      const orgRows = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${competition.created_by_id}`;
      const organizerEmail = orgRows[0]?.email;
      if (!organizerEmail) return json({ error: "Организаторът не е намерен" }, 404);

      const names = myRegs.map((r: { participant_name: string }) => r.participant_name).join(", ") || user.full_name || user.email;

      await sendEmail({
        to: organizerEmail,
        replyTo: user.email,
        subject: `Съобщение от участник — ${competition.title}`,
        html: `<p>Съобщение от <b>${names}</b> (${user.email}), записан(и) за „${competition.title}“:</p><p>${message.replace(/\n/g, "<br>")}</p>`,
      });

      return json({ success: true });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  return json({ error: `Unknown function: ${name}` }, 404);
}

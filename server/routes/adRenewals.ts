import { sql } from "../db.js";
import { sendEmail } from "../lib/email.js";
import { env } from "../env.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type CustomAdRow = {
  id: string;
  title: string | null;
  placement: string | null;
  advertiser_email: string | null;
  expires_at: string | null;
};

/**
 * GET/POST /api/cron/ad-renewals — hit daily by Vercel Cron (see
 * vercel.json). Sends the two renewal notices confirmed with the site
 * owner (Sep 2026):
 *   - 7 days before an ad's paid period (custom_ads.expires_at, computed
 *     via src/lib/adBilling.js and stored on the row) runs out.
 *   - on/after the day it actually runs out.
 * Recipients are every admin user plus the ad's own advertiser_email, if
 * set. Each notice fires at most once per billing period, tracked by the
 * renewal_notice_sent / expiry_notice_sent flags — src/pages/CustomAds.jsx
 * resets both to false whenever an ad's period is renewed (starts_at or
 * duration_months changes), so the next period gets its own notices.
 *
 * Deliberately does NOT deactivate the ad on expiry — same "admin settles
 * it by hand" philosophy as the rest of this app's paid features (ad slot
 * requests, competition fees, sector reservations — see server/README.md).
 */
export async function handleAdRenewalsCron(req: Request): Promise<Response> {
  if (env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return json({ error: "Forbidden" }, 403);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const admins = await sql<{ email: string | null }[]>`
    SELECT email FROM users WHERE role = 'admin' OR 'admin' = ANY(roles)
  `;
  const adminEmails = admins.map((a) => a.email).filter((e): e is string => Boolean(e));

  async function notify(ad: CustomAdRow, subject: string, text: string) {
    const recipients = [...adminEmails];
    if (ad.advertiser_email) recipients.push(ad.advertiser_email);
    if (!recipients.length) return;
    try {
      await sendEmail({ to: recipients, subject, text });
    } catch (e) {
      // A failed email (SMTP not configured, transient error, ...) must not
      // stop the rest of the batch or leave the loop half-processed.
      console.error("[ad-renewals] email failed for ad", ad.id, e);
    }
  }

  // Ads whose paid period ends within 7 days — including ones already
  // past that point, so a missed cron run still catches up instead of
  // silently skipping the notice forever.
  const dueSoon = await sql<CustomAdRow[]>`
    SELECT id, title, placement, advertiser_email, expires_at FROM custom_ads
    WHERE is_active = true
      AND expires_at IS NOT NULL
      AND expires_at <= ${sevenDaysOut}
      AND (renewal_notice_sent IS NOT TRUE)
  `;
  for (const ad of dueSoon) {
    await notify(
      ad,
      `Наближава изтичане на реклама: ${ad.title || "(без заглавие)"}`,
      `Платеният период на рекламния банер "${ad.title || ""}" (${ad.placement || "?"}) изтича на ${ad.expires_at}.\n\nАко желаете подновяване, свържете се навреме — банерът НЕ се спира автоматично.`,
    );
    await sql`UPDATE custom_ads SET renewal_notice_sent = true WHERE id = ${ad.id}`;
  }

  // Ads that have actually reached (or passed) their expiry date.
  const dueToday = await sql<CustomAdRow[]>`
    SELECT id, title, placement, advertiser_email, expires_at FROM custom_ads
    WHERE is_active = true
      AND expires_at IS NOT NULL
      AND expires_at <= ${today}
      AND (expiry_notice_sent IS NOT TRUE)
  `;
  for (const ad of dueToday) {
    await notify(
      ad,
      `Рекламата "${ad.title || "(без заглавие)"}" изтече`,
      `Платеният период на рекламния банер "${ad.title || ""}" (${ad.placement || "?"}) изтече на ${ad.expires_at}.\n\nБанерът остава активен, докато администраторът не го спре или поднови ръчно в „Управление на реклами“.`,
    );
    await sql`UPDATE custom_ads SET expiry_notice_sent = true WHERE id = ${ad.id}`;
  }

  return json({ ok: true, renewalNoticesSent: dueSoon.length, expiryNoticesSent: dueToday.length });
}

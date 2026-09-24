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
 * vercel.json). Sends the three renewal notices confirmed with the site
 * owner (Sep 2026):
 *   - 7 days before an ad's paid period (custom_ads.expires_at, computed
 *     via src/lib/adBilling.js and stored on the row) runs out.
 *   - ~24 hours before it runs out (added v3.67 — see below).
 *   - on/after the day it actually runs out.
 * Recipients are every admin user plus the ad's own advertiser_email, if
 * set. Each notice fires at most once per billing period, tracked by the
 * renewal_notice_sent / final_notice_sent / expiry_notice_sent flags —
 * src/pages/CustomAds.jsx resets all three to false whenever an ad's
 * period is renewed (starts_at or duration_months changes), so the next
 * period gets its own notices.
 *
 * v3.67 — the 24h-before notice was added specifically for merchants on
 * the referral bonus program (water_bodies/venues.bonus_days_per_referral,
 * see merchantReferrals.ts's "redeem" handler): each new QR referral only
 * extends THIS SAME expires_at by a handful of days, so an ad living off
 * bonus days can have just 2-3 days of total runway — the existing 7-day
 * notice then fires immediately on creation/extension and gives no real
 * day-before warning. This third notice fires once the ad is within its
 * last 24h, telling the recipient exactly when it expires and inviting
 * them to request fresh banner time (on whichever page they'd like) from
 * the team, with a direct link to /advertise.
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
  const oneDayOut = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
  const advertiseUrl = `${env.PUBLIC_APP_URL}/advertise`;

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

  // v3.67 — ads within their last ~24 hours (still not expired). See the
  // doc comment above for why this exists alongside the 7-day-out notice.
  const dueFinal = await sql<CustomAdRow[]>`
    SELECT id, title, placement, advertiser_email, expires_at FROM custom_ads
    WHERE is_active = true
      AND expires_at IS NOT NULL
      AND expires_at <= ${oneDayOut}
      AND expires_at >= ${today}
      AND (final_notice_sent IS NOT TRUE)
  `;
  for (const ad of dueFinal) {
    await notify(
      ad,
      `Рекламата "${ad.title || "(без заглавие)"}" изтича след 24 часа`,
      `Рекламният банер "${ad.title || ""}" (${ad.placement || "?"}) изтича на ${ad.expires_at} — след около 24 часа.\n\nАко желаете да продължите да рекламирате при нас, включително в банер на друга, предпочитана от Вас страница, свържете се с нашия екип и заявете ново рекламно време: ${advertiseUrl}`,
    );
    await sql`UPDATE custom_ads SET final_notice_sent = true WHERE id = ${ad.id}`;
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

  return json({
    ok: true,
    renewalNoticesSent: dueSoon.length,
    finalNoticesSent: dueFinal.length,
    expiryNoticesSent: dueToday.length,
  });
}

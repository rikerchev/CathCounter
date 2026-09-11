import Stripe from "stripe";
import { sql } from "../db.ts";
import { env } from "../env.ts";
import { sendEmail } from "../lib/email.ts";
import { getConfig } from "../lib/settings.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { isAdmin } from "../middleware/auth.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function stripeClient() {
  const key = await getConfig("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not configured yet (Admin \u2192 Setup, or STRIPE_SECRET_KEY in the environment)");
  return new Stripe(key);
}

const PRICE_IDS: Record<string, string> = {
  premium: "price_1U4SBzBhZOkmj6VhXJDO2zeK",
  advertiser: "price_1U4SBzBhZOkmj6VhDTYgpIqb",
};

/**
 * Dispatch table mirroring `base44.functions.invoke(name, payload)` from the
 * frontend — same function names, same request/response shape, just backed
 * by our own DB instead of the base44 SDK / `base44:runtime` secrets.
 */
export async function handleFunctionsRoute(
  req: Request,
  path: string[], // [functionName]
  user: AuthUser | null,
): Promise<Response> {
  const [name] = path;

  if (name === "create-checkout-session" && req.method === "POST") {
    try {
      const body = await req.json();
      const { client_reference_id, success_url, cancel_url, plan = "premium" } = body;
      if (!client_reference_id || !success_url || !cancel_url) {
        return json({ error: "Missing required parameters" }, 400);
      }
      const stripe = await stripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: PRICE_IDS[plan] || PRICE_IDS.premium, quantity: 1 }],
        client_reference_id,
        success_url,
        cancel_url,
        metadata: { client_reference_id },
      });
      return json({ url: session.url });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  if (name === "create-ad-checkout-session" && req.method === "POST") {
    try {
      const body = await req.json();
      const { request_id, slot_name, price_per_month, months, success_url, cancel_url } = body;
      if (!request_id || !slot_name || !price_per_month || !months || !success_url || !cancel_url) {
        return json({ error: "Missing required parameters" }, 400);
      }
      const totalAmount = Math.round(price_per_month * months * 100);
      const stripe = await stripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: { name: `Реклама: ${slot_name} (${months} мес.)` },
            unit_amount: totalAmount,
          },
          quantity: 1,
        }],
        success_url,
        cancel_url,
        metadata: { ad_slot_request_id: request_id },
      });
      return json({ url: session.url });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  if (name === "create-competition-checkout" && req.method === "POST") {
    try {
      const body = await req.json();
      const {
        competition_id, registration_id, fee, competition_title,
        water_body_id, success_url, cancel_url,
      } = body;
      if (!competition_id || !registration_id || fee == null || !success_url || !cancel_url) {
        return json({ error: "Missing required parameters" }, 400);
      }
      const totalAmount = Math.round(fee * 100);
      const platformShare = Math.round(totalAmount * 0.25);
      const ownerShare = totalAmount - platformShare;

      let ownerStripeAccountId: string | null = null;
      if (water_body_id) {
        const rows = await sql`SELECT stripe_account_id FROM water_bodies WHERE id = ${water_body_id}`;
        ownerStripeAccountId = rows[0]?.stripe_account_id ?? null;
      }

      const stripe = await stripeClient();
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: { name: `Състезание: ${competition_title}` },
            unit_amount: totalAmount,
          },
          quantity: 1,
        }],
        success_url,
        cancel_url,
        metadata: {
          competition_id,
          registration_id,
          fee_amount: String(totalAmount),
          platform_share: String(platformShare),
          owner_share: String(ownerShare),
        },
      };
      if (ownerStripeAccountId) {
        sessionParams.payment_intent_data = {
          transfer_data: { destination: ownerStripeAccountId, amount: ownerShare },
        };
      }
      const session = await stripe.checkout.sessions.create(sessionParams);
      return json({ url: session.url });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  if (name === "create-reservation-checkout" && req.method === "POST") {
    try {
      const body = await req.json();
      const {
        reservation_id, fee, water_body_id, water_body_name,
        sector_number, date, success_url, cancel_url,
      } = body;
      if (!reservation_id || fee == null || !water_body_id || !success_url || !cancel_url) {
        return json({ error: "Missing required parameters" }, 400);
      }
      const totalAmount = Math.round(fee * 100);
      const platformShare = Math.round(totalAmount * 0.25);
      const ownerShare = totalAmount - platformShare;

      const rows = await sql`SELECT stripe_account_id FROM water_bodies WHERE id = ${water_body_id}`;
      const ownerStripeAccountId = rows[0]?.stripe_account_id ?? null;

      const stripe = await stripeClient();
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: {
              name: `Резервация: ${water_body_name || ""} - Сектор ${sector_number || ""} (${date || ""})`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        }],
        success_url,
        cancel_url,
        metadata: {
          reservation_id,
          water_body_id,
          fee_amount: String(totalAmount),
          platform_share: String(platformShare),
          owner_share: String(ownerShare),
        },
      };
      if (ownerStripeAccountId) {
        sessionParams.payment_intent_data = {
          transfer_data: { destination: ownerStripeAccountId, amount: ownerShare },
        };
      }
      const session = await stripe.checkout.sessions.create(sessionParams);
      return json({ url: session.url });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  if (name === "create-stripe-connect-account" && req.method === "POST") {
    try {
      const body = await req.json();
      const { water_body_id, return_url, email, country } = body;
      if (!water_body_id || !return_url) {
        return json({ error: "Липсват задължителни параметри" });
      }
      const stripe = await stripeClient();
      let account;
      try {
        account = await stripe.accounts.create({
          type: "express",
          email: email || undefined,
          country: country || "BG",
          business_type: "individual",
          metadata: { water_body_id },
        });
      } catch (createErr) {
        const msg = (createErr as Error).message || "";
        if (msg.includes("signed up for Connect")) {
          return json({ error: "Stripe Connect не е активиран.", needs_connect: true });
        }
        return json({ error: "Грешка при създаване на Stripe профил: " + msg });
      }
      await sql`UPDATE water_bodies SET stripe_account_id = ${account.id} WHERE id = ${water_body_id}`;
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: return_url,
        return_url,
        type: "account_onboarding",
      });
      return json({ account_id: account.id, onboarding_url: accountLink.url });
    } catch (error) {
      return json({ error: (error as Error).message });
    }
  }

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

  if (name === "stripe-webhook" && req.method === "POST") {
    try {
      const stripe = await stripeClient();
      const body = await req.text();
      const signature = req.headers.get("stripe-signature");
      const webhookSecret = await getConfig("STRIPE_WEBHOOK_SECRET");
      if (!signature || !webhookSecret) {
        return json({ error: "Missing signature or webhook secret" }, 400);
      }
      const event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata || {};

        if (meta.ad_slot_request_id) {
          const rows = await sql`
            UPDATE ad_slot_requests SET status = 'paid', updated_at = now()
            WHERE id = ${meta.ad_slot_request_id} RETURNING *
          `;
          const reqRow = rows[0];
          if (reqRow) {
            const created = await sql`
              INSERT INTO custom_ads (title, description, cta, link, logo_url, ad_slot_id,
                                       advertiser_id, is_active, placement, created_by_id)
              VALUES (${reqRow.ad_title}, ${reqRow.ad_description}, ${reqRow.ad_cta},
                      ${reqRow.website_url}, ${reqRow.logo_url}, ${reqRow.ad_slot_id},
                      ${reqRow.created_by_id}, TRUE, ${reqRow.placement}, ${reqRow.created_by_id})
              RETURNING id
            `;
            if (reqRow.ad_slot_id) {
              await sql`UPDATE ad_slots SET status = 'rented' WHERE id = ${reqRow.ad_slot_id}`;
            }
            void created;
          }
        } else if (meta.reservation_id) {
          await sql`
            UPDATE sector_reservations SET payment_status = 'paid', updated_at = now()
            WHERE id = ${meta.reservation_id}
          `;
        } else if (meta.registration_id) {
          await sql`
            UPDATE competition_registrations SET payment_status = 'paid', updated_at = now()
            WHERE id = ${meta.registration_id}
          `;
        } else if (meta.client_reference_id) {
          const existing = await sql`
            SELECT id FROM subscriptions WHERE client_reference_id = ${meta.client_reference_id}
          `;
          if (existing.length) {
            await sql`
              UPDATE subscriptions SET status = 'active',
                stripe_customer_id = ${session.customer as string},
                stripe_subscription_id = ${session.subscription as string},
                updated_at = now()
              WHERE client_reference_id = ${meta.client_reference_id}
            `;
          } else {
            await sql`
              INSERT INTO subscriptions (client_reference_id, stripe_customer_id,
                                          stripe_subscription_id, status)
              VALUES (${meta.client_reference_id}, ${session.customer as string},
                      ${session.subscription as string}, 'active')
            `;
          }
        }
      }

      return json({ received: true });
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
  }

  return json({ error: `Unknown function: ${name}` }, 404);
}

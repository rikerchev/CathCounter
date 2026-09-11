import Stripe from "npm:stripe";
import { secrets } from "base44:runtime";

const PRICE_IDS = {
  premium: "price_1U4SBzBhZOkmj6VhXJDO2zeK",
  advertiser: "price_1U4SBzBhZOkmj6VhDTYgpIqb",
};

export default async function(req) {
  try {
    const body = await req.json();
    const clientId = body.client_reference_id;
    const successUrl = body.success_url;
    const cancelUrl = body.cancel_url;
    const plan = body.plan || "premium";

    const priceId = PRICE_IDS[plan] || PRICE_IDS.premium;

    if (!clientId || !successUrl || !cancelUrl) {
      return Response.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const stripe = new Stripe(secrets.get("STRIPE_SECRET_KEY"));

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: clientId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        client_reference_id: clientId,
      },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
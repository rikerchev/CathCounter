import Stripe from "npm:stripe";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

export default async function(req) {
  try {
    const body = await req.json();
    const requestId = body.request_id;
    const slotName = body.slot_name;
    const pricePerMonth = body.price_per_month;
    const months = body.months;
    const successUrl = body.success_url;
    const cancelUrl = body.cancel_url;

    if (!requestId || !slotName || !pricePerMonth || !months || !successUrl || !cancelUrl) {
      return Response.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const totalAmount = Math.round(pricePerMonth * months * 100);
    const stripe = new Stripe(secrets.get("STRIPE_SECRET_KEY"));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `Реклама: ${slotName} (${months} мес.)` },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        ad_slot_request_id: requestId,
      },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Ad checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
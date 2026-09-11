import Stripe from "npm:stripe";
import { secrets } from "base44:runtime";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

export default async function(req) {
  try {
    const body = await req.json();
    const competitionId = body.competition_id;
    const registrationId = body.registration_id;
    const fee = body.fee;
    const competitionTitle = body.competition_title;
    const waterBodyId = body.water_body_id;
    const successUrl = body.success_url;
    const cancelUrl = body.cancel_url;

    if (!competitionId || !registrationId || fee == null || !successUrl || !cancelUrl) {
      return Response.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const totalAmount = Math.round(fee * 100);
    const platformShare = Math.round(totalAmount * 0.25);
    const ownerShare = totalAmount - platformShare;

    const stripe = new Stripe(secrets.get("STRIPE_SECRET_KEY"));
    const base44 = createClientFromRequest(req);

    let ownerStripeAccountId = null;
    if (waterBodyId) {
      try {
        const waterBodies = await base44.asServiceRole.entities.WaterBody.filter({ id: waterBodyId });
        if (waterBodies.length > 0) {
          ownerStripeAccountId = waterBodies[0].stripe_account_id;
        }
      } catch (e) {
        console.error("Error fetching water body:", e.message);
      }
    }

    const sessionParams = {
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `Състезание: ${competitionTitle}` },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        competition_id: competitionId,
        registration_id: registrationId,
        fee_amount: String(totalAmount),
        platform_share: String(platformShare),
        owner_share: String(ownerShare),
      },
    };

    if (ownerStripeAccountId) {
      sessionParams.transfer_data = {
        destination: ownerStripeAccountId,
        amount: ownerShare,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Competition checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
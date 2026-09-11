import Stripe from "npm:stripe";
import { secrets } from "base44:runtime";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

export default async function(req) {
  try {
    const body = await req.json();
    const reservationId = body.reservation_id;
    const fee = body.fee;
    const waterBodyId = body.water_body_id;
    const waterBodyName = body.water_body_name;
    const sectorNumber = body.sector_number;
    const date = body.date;
    const successUrl = body.success_url;
    const cancelUrl = body.cancel_url;

    if (!reservationId || fee == null || !waterBodyId || !successUrl || !cancelUrl) {
      return Response.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const totalAmount = Math.round(fee * 100);
    const platformShare = Math.round(totalAmount * 0.25);
    const ownerShare = totalAmount - platformShare;

    const stripe = new Stripe(secrets.get("STRIPE_SECRET_KEY"));
    const base44 = createClientFromRequest(req);

    let ownerStripeAccountId = null;
    try {
      const waterBodies = await base44.asServiceRole.entities.WaterBody.filter({ id: waterBodyId });
      if (waterBodies.length > 0) {
        ownerStripeAccountId = waterBodies[0].stripe_account_id;
      }
    } catch (e) {
      console.error("Error fetching water body:", e.message);
    }

    const sessionParams = {
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `Резервация: ${waterBodyName || ""} - Сектор ${sectorNumber || ""} (${date || ""})` },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        reservation_id: reservationId,
        water_body_id: waterBodyId,
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
    console.error("Reservation checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
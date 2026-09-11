import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import Stripe from "npm:stripe";
import { secrets } from "base44:runtime";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(secrets.get("STRIPE_SECRET_KEY"));

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = secrets.get("STRIPE_WEBHOOK_SECRET");

    if (!signature || !webhookSecret) {
      return Response.json({ error: "Missing signature or webhook secret" }, { status: 400 });
    }

    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const adRequestId = session.metadata?.ad_slot_request_id;

      if (adRequestId) {
        // Ad payment → mark request as paid, create CustomAd, mark slot as rented
        // ...
      } else if (session.metadata?.reservation_id) {
        // Sector reservation payment → mark as paid
        // ...
      } else if (session.metadata?.registration_id) {
        // Competition registration payment → mark as paid
        // ...
      } else {
        // Subscription → create/update Subscription record
        // ...
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
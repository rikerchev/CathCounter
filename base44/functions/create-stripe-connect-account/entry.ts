import Stripe from "npm:stripe";
import { secrets } from "base44:runtime";

export default async function(req) {
  try {
    const body = await req.json();
    const waterBodyId = body.water_body_id;
    const returnUrl = body.return_url;

    if (!waterBodyId || !returnUrl) {
      return Response.json({ error: "Липсват задължителни параметри" }, { status: 200 });
    }

    const stripe = new Stripe(secrets.get("STRIPE_SECRET_KEY"));

    let account;
    try {
      account = await stripe.accounts.create({
        type: "express",
        email: body.email || undefined,
        country: body.country || "BG",
        business_type: "individual",
        metadata: {
          base44_app_id: Deno.env.get("BASE44_APP_ID"),
          water_body_id: waterBodyId,
        },
      });
    } catch (createErr) {
      console.error("Stripe Connect account creation error:", createErr.message);
      const msg = createErr.message || "";
      if (msg.includes("signed up for Connect")) {
        return Response.json({
          error: "Stripe Connect не е активиран.",
          needs_connect: true,
        }, { status: 200 });
      }
      return Response.json({
        error: "Грешка при създаване на Stripe профил: " + msg,
      }, { status: 200 });
    }

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return Response.json({
      account_id: account.id,
      onboarding_url: accountLink.url,
    });
  } catch (error) {
    console.error("Stripe Connect onboarding error:", error.message);
    return Response.json({ error: error.message }, { status: 200 });
  }
}
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { waitUntil } from "base44:runtime";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const competitionId = body.competition_id;
    if (!competitionId) return Response.json({ error: "Missing competition_id" }, { status: 400 });

    const competitions = await base44.asServiceRole.entities.Competition.filter({ id: competitionId });
    if (competitions.length === 0) return Response.json({ error: "Competition not found" }, { status: 404 });
    const competition = competitions[0];

    let waterBody = null;
    if (competition.water_body_id) {
      const wbs = await base44.asServiceRole.entities.WaterBody.filter({ id: competition.water_body_id });
      waterBody = wbs[0] || null;
    }

    const userRoles = user.roles || [user.role];
    const isAuthorized = userRoles.includes("admin") || (waterBody && waterBody.created_by_id === user.id);
    if (!isAuthorized) return Response.json({ error: "Forbidden" }, { status: 403 });

    const targetCountry = waterBody?.country || "";
    const fee = competition.fee != null ? competition.fee : (waterBody?.fee_per_person || 0);

    const appOrigin = "https://daring-catch-count-crew.base44.app";
    const registrationUrl = `${appOrigin}/competitions?comp=${competition.id}`;

    let allUsers = [];
    let hasMore = true;
    let skip = 0;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.User.list("-created_date", 200, skip);
      allUsers.push(...batch);
      hasMore = batch.length === 200;
      skip += 200;
    }

    const targetUsers = targetCountry
      ? allUsers.filter((u) => u.country === targetCountry)
      : allUsers;

    if (targetUsers.length === 0) {
      return Response.json({ notified: 0, message: "No users found" });
    }

    waitUntil((async () => {
      for (const u of targetUsers) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: u.email,
            subject: `Ново състезание: ${competition.title}`,
            body: `...`,
          });
        } catch (e) {}
        try {
          await base44.asServiceRole.entities.Notification.create({
            user_id: u.id,
            type: "competition",
            title: `Ново състезание: ${competition.title}`,
            message: `...`,
            link: `/competitions?comp=${competition.id}`,
            read: false,
          });
        } catch (e) {}
      }
    })());

    return Response.json({ notified: targetUsers.length, country: targetCountry || "all", fee });
  } catch (error) {
    console.error("Notify competition error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
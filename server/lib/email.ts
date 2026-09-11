import { getConfig } from "./settings.ts";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  const [apiKey, from] = await Promise.all([
    getConfig("RESEND_API_KEY"),
    getConfig("EMAIL_FROM"),
  ]);

  if (!apiKey) {
    // Fail loudly in production, but don't block local dev / a fresh
    // deployment that hasn't gone through the Setup Wizard yet.
    console.warn(
      `[email] Resend is not configured yet (Admin → Setup) — skipping send to ${opts.to}: "${opts.subject}"`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from || "CatchCount <noreply@example.com>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}

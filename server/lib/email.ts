import nodemailer from "nodemailer";
import { getConfig } from "./settings.ts";

/**
 * Sends email via a plain SMTP server — no paid third-party email API
 * required. Works with any SMTP provider (your own mail server, a
 * self-hosted one, or a free-tier transactional sender), configured either
 * through server/.env or Admin → Настройка на интеграциите (no restart
 * needed — see settings.ts).
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  const [host, port, secure, user, password, from] = await Promise.all([
    getConfig("SMTP_HOST"),
    getConfig("SMTP_PORT"),
    getConfig("SMTP_SECURE"),
    getConfig("SMTP_USER"),
    getConfig("SMTP_PASSWORD"),
    getConfig("EMAIL_FROM"),
  ]);

  if (!host) {
    // Fail loudly in production, but don't block local dev / a fresh
    // deployment that hasn't gone through the Setup Wizard yet.
    console.warn(
      `[email] SMTP не е конфигуриран (Admin → Настройка) — пропускам изпращане до ${opts.to}: "${opts.subject}"`,
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: secure === "true", // true for port 465, false for 587/25 (STARTTLS)
    auth: user ? { user, pass: password } : undefined,
  });

  await transporter.sendMail({
    from: from || "CatchCount <noreply@example.com>",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

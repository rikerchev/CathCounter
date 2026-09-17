import nodemailer from "nodemailer";
import { getConfig } from "./settings.js";

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
  // v3.03 — lets a reply from the recipient's own mail client go straight to
  // a real person (e.g. the participant who triggered a
  // "contact-competition-organizer" email) instead of the platform's
  // no-reply sender address.
  replyTo?: string;
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
    // nodemailer's own default timeouts are very generous (multiple
    // minutes). A wrong host/port, a firewall silently dropping the
    // connection, or a slow mail server can then leave sendMail() hanging
    // far longer than any caller expects — e.g. it blocked user
    // registration entirely, well past the frontend's own request timeout.
    // Fail fast instead so callers can decide what to do (see auth.ts,
    // which no longer lets a registration succeed-or-fail hinge on SMTP).
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });

  await transporter.sendMail({
    from: from || "CatchCount <noreply@example.com>",
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

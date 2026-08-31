/**
 * send-mail — Netlify serverless function.
 * Sends transactional email (password-reset links, test mails) via SMTP
 * using nodemailer. Credentials come from Netlify environment variables
 * (preferred) or the request payload (Super Admin config fallback).
 *
 * Required (either source): SMTP_HOST, SMTP_USER, SMTP_PASS
 * Optional: SMTP_PORT (465), SMTP_SECURE ("true"), SMTP_FROM_NAME
 */
import nodemailer from "nodemailer";

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { to, subject, html, text, config } = body ?? {};
  if (!to || !subject) return json(400, { error: "Fields 'to' and 'subject' are required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(to))) return json(400, { error: "Invalid recipient address" });
  if (String(subject).length > 200) return json(400, { error: "Subject too long" });

  const env = process.env;
  const host = env.SMTP_HOST || config?.host;
  const port = Number(env.SMTP_PORT || config?.port || 465);
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : config?.secure ?? port === 465;
  const user = env.SMTP_USER || config?.user;
  const pass = env.SMTP_PASS || config?.pass;
  const fromName = env.SMTP_FROM_NAME || config?.fromName || "Vittoria HR";

  if (!host || !user || !pass) {
    return json(503, {
      error: "SMTP not configured. Set SMTP_HOST / SMTP_USER / SMTP_PASS in Netlify environment variables, or enable SMTP in Super Admin → Master Data.",
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 9000,
      greetingTimeout: 9000,
    });
    await transporter.sendMail({
      from: `"${String(fromName).replace(/"/g, "")}" <${user}>`,
      to,
      subject,
      text,
      html,
    });
    return json(200, { ok: true, via: env.SMTP_HOST ? "env" : "config" });
  } catch (e) {
    return json(502, { error: `SMTP send failed: ${String(e?.message ?? e)}` });
  }
};

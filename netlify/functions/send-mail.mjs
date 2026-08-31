/**
 * Vittoria HR — transactional email (Gmail SMTP via nodemailer).
 * Deployed automatically alongside the static site; endpoint:
 *   POST /.netlify/functions/send-mail
 *
 * Credentials resolution: Netlify env vars first (recommended), then the
 * request body (Super Admin's in-app SMTP config). Never log the password.
 */
import nodemailer from "nodemailer";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export default async (req) => {
  if (req.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(req.body ?? "{}");
  } catch {
    return json(400, { error: "Body JSON tidak valid." });
  }

  const { to, subject, html, text, config = {} } = payload;
  if (!to || !subject) return json(400, { error: "Field 'to' dan 'subject' wajib." });

  const host = process.env.SMTP_HOST || config.host || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || config.port || 465);
  const secure = (process.env.SMTP_SECURE ?? String(config.secure ?? "true")) !== "false";
  const user = process.env.SMTP_USER || config.user;
  const pass = process.env.SMTP_PASS || config.pass;
  const fromName = process.env.SMTP_FROM_NAME || config.fromName || "Vittoria HR";

  if (!user || !pass) {
    return json(400, { error: "SMTP belum dikonfigurasi (isi di Master Data → Email & SMTP, atau set env vars)." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 12_000,
    });
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to,
      subject,
      text: text || subject,
      html: html || undefined,
    });
    return json(200, { ok: true, via: `${host}:${port}` });
  } catch (e) {
    const msg = String(e?.message ?? e);
    // strip credentials if nodemailer echoes them
    const safe = msg.replace(pass, "••••").replace(user, "[user]");
    console.error("send-mail failed:", safe);
    return json(500, { error: `Gagal mengirim: ${safe.slice(0, 220)}` });
  }
};

export const config = { path: "/.netlify/functions/send-mail" };

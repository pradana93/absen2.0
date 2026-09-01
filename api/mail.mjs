/**
 * Vercel route: POST https://<project>.vercel.app/api/mail
 * Node runtime → real TCP → Gmail SMTP works natively (App Password).
 * Env vars (optional, preferred): SMTP_HOST, SMTP_PORT, SMTP_SECURE,
 * SMTP_USER, SMTP_PASS, SMTP_FROM_NAME. Falls back to the in-app config.
 */
import nodemailer from "nodemailer";

export const runtime = "nodejs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-vittoria-session");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  if (!req.headers["x-vittoria-session"]) return res.status(401).json({ error: "Sesi tidak ditemukan." });

  const { to, subject, html, text, config = {} } = req.body ?? {};
  if (!to || !subject) return res.status(400).json({ error: "Field 'to' dan 'subject' wajib." });

  const host = process.env.SMTP_HOST || config.host || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || config.port || 465);
  const secure = (process.env.SMTP_SECURE ?? String(config.secure ?? "true")) !== "false";
  const user = process.env.SMTP_USER || config.user;
  const pass = process.env.SMTP_PASS || config.pass;
  const fromName = process.env.SMTP_FROM_NAME || config.fromName || "Vittoria HR";
  if (!user || !pass) return res.status(400).json({ error: "SMTP belum dikonfigurasi (env SMTP_USER/SMTP_PASS atau Master Data → Email & SMTP)." });

  try {
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    await transporter.sendMail({ from: `"${fromName}" <${user}>`, to, subject, html, text });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message ?? e).slice(0, 250) });
  }
}

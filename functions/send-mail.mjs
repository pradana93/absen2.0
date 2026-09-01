/**
 * Vittoria HR — email via Cloudflare Pages Function.
 * Route: POST https://<project>.pages.dev/send-mail
 *
 * Workers can't open TCP sockets, so Gmail SMTP isn't possible here.
 * Set RESEND_API_KEY (free tier: 100 emails/day at resend.com) and this
 * function sends through Resend's HTTP API. Without the key it returns a
 * clear error and the app falls back to its in-app simulated inbox.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    "content-type": "application/json",
    "access-control-allow-headers": "content-type, x-vittoria-session",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": request.headers.get("origin") || "*",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only." }), { status: 405, headers });

  let payload;
  try { payload = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Body JSON tidak valid." }), { status: 400, headers });
  }
  const { to, subject, html, text, config = {} } = payload;
  if (!to || !subject) return new Response(JSON.stringify({ error: "Field 'to' dan 'subject' wajib." }), { status: 400, headers });

  const fromName = env.SMTP_FROM_NAME || config.fromName || "Vittoria HR";

  if (env.RESEND_API_KEY) {
    const from = env.SMTP_FROM || `${fromName} <onboarding@resend.dev>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Resend: ${j?.message ?? res.status}` }), { status: 502, headers });
    }
    return new Response(JSON.stringify({ ok: true, id: j.id }), { status: 200, headers });
  }

  return new Response(JSON.stringify({
    error: "Email belum dikonfigurasi di host ini. Tambahkan env RESEND_API_KEY (gratis: resend.com), atau pakai host Vercel/Netlify/PythonAnywhere untuk SMTP Gmail langsung. Aplikasi otomatis memakai inbox simulasi.",
  }), { status: 501, headers });
}

/**
 * Vercel edge route: POST https://<project>.vercel.app/api/db
 * Reuses the exact same Web-standard handler as the Netlify function —
 * one codebase, three hosts.
 */
export const runtime = "edge";
export { default } from "../netlify/functions/api.mjs";

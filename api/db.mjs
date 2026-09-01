/**
 * Vercel route: POST https://<project>.vercel.app/api/db
 * Reuses the exact same handler as the Netlify function — one codebase,
 * every host. Node runtime (not edge): the `pg` driver needs real TCP
 * sockets to reach Supabase / any Postgres.
 */
export const runtime = "nodejs";
export const maxDuration = 30;
export { default } from "../netlify/functions/api.mjs";

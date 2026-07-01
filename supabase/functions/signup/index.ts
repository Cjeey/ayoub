// Reckon — public signup endpoint (verify_jwt = false).
// Creates a pre-confirmed account with the service-role admin API so
// email/password login works instantly without a confirmation email.
// Deployed to project `reckon` as the `signup` edge function.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { email?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (String(password).length < 8) return json({ error: "weak_password" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) return json({ error: "exists" }, 409);
    return json({ error: "signup_failed", detail: error.message }, 400);
  }
  return json({ ok: true, id: data.user?.id ?? null }, 200);
});

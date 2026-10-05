const roles = new Set(["viewer", "editor", "soundcreator", "admin"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function passwordRedirectUrl(configured) {
  const fallback = "https://tastenbraille.com/mpop/reset-password.html";
  try {
    const url = new URL(configured || fallback);
    if (url.protocol !== "https:" || !["tastenbraille.com", "www.tastenbraille.com"].includes(url.hostname)
      || url.port || url.username || url.password) return fallback;
    return `${url.origin}/mpop/reset-password.html`;
  } catch { return fallback; }
}

export function createUserAdminHandler({ createClient, env }) {
  return async (req) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json(405, { error: "Gebruik POST." });
    const token = (req.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json(401, { error: "Log eerst in als admin." });
    try {
      const url = env("SUPABASE_URL");
      const anonKey = env("SUPABASE_ANON_KEY");
      const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !anonKey || !serviceKey) return json(503, { error: "Supabase-configuratie ontbreekt op de server." });
      const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
      const caller = createClient(url, anonKey, {
        ...authOptions, global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: auth, error: authError } = await caller.auth.getUser(token);
      if (authError || !auth.user) return json(401, { error: "Je sessie is verlopen. Log opnieuw in." });
      const { data: profile, error: profileError } = await caller.from("profiles").select("role").eq("user_id", auth.user.id).single();
      if (profileError || profile?.role !== "admin") return json(403, { error: "Alleen admins mogen gebruikers beheren." });
      const text = await req.text();
      if (text.length > 8192) return json(413, { error: "Verzoek is te groot." });
      let body;
      try { body = JSON.parse(text); } catch { return json(400, { error: "Ongeldig verzoek." }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Ongeldig verzoek." });
      const admin = createClient(url, serviceKey, authOptions);
      const redirectTo = passwordRedirectUrl(env("MPOP_AUTH_REDIRECT_URL"));

      if (body.action === "list") {
        const page = body.page ?? 1;
        if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return json(400, { error: "Ongeldig paginanummer." });
        const perPage = 50;
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json(502, { error: "Gebruikers ophalen mislukt." });
        const ids = data.users.map((user) => user.id);
        let profiles = [];
        if (ids.length) {
          const result = await admin.from("profiles").select("user_id, role, display_name").in("user_id", ids);
          if (result.error) return json(502, { error: "Gebruikersrollen ophalen mislukt." });
          profiles = result.data || [];
        }
        const byId = new Map(profiles.map((p) => [p.user_id, p]));
        return json(200, { ok: true, hasMore: data.users.length === perPage, users: data.users.map((user) => ({
          id: user.id, email: user.email || "", confirmed: Boolean(user.email_confirmed_at),
          display_name: byId.get(user.id)?.display_name || "", role: byId.get(user.id)?.role || "viewer",
        })) });
      }

      if (body.action === "invite") {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length > 100 || !roles.has(body.role)) {
          return json(400, { error: "Vul een geldig e-mailadres, naam en rol in." });
        }
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { display_name: name } });
        if (error || !data.user) return json(400, { error: "Uitnodigen mislukt. Bestaat dit account al? Gebruik dan de gebruikerslijst en Herstelmail versturen. Controleer anders de Supabase-mailinstellingen." });
        const assigned = await admin.rpc("mpop_admin_set_user_role", { target_user_id: data.user.id, new_role: body.role });
        if (assigned.error) return json(502, { error: "De uitnodiging is verstuurd, maar de rol is niet opgeslagen. Zoek de gebruiker op en sla de rol opnieuw op. Controleer of de gebruikersbeheer-migratie is geïnstalleerd." });
        return json(200, { ok: true, message: `Uitnodiging verstuurd naar ${email}. De gebruiker stelt via de mail zelf een wachtwoord in.` });
      }

      if (!["set_role", "reset_password", "delete_user"].includes(body.action)) return json(400, { error: "Onbekende actie." });
      if (typeof body.userId !== "string" || !uuid.test(body.userId)) return json(400, { error: "Ongeldige gebruiker." });
      if (body.action === "delete_user" && body.userId === auth.user.id) {
        return json(409, { error: "Je kunt je eigen account niet verwijderen." });
      }
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(body.userId);
      if (targetError || !target.user?.email) return json(404, { error: "Gebruiker niet gevonden." });
      if (body.action === "delete_user") {
        const guard = await admin.rpc("mpop_admin_check_user_delete", { target_user_id: body.userId });
        if (guard.error) return json(409, { error: "Gebruiker niet verwijderd. De laatste admin moet blijven; controleer ook of de gebruikersverwijdering-migratie is geïnstalleerd." });
        const { error } = await admin.auth.admin.deleteUser(body.userId);
        if (error) return json(409, { error: "Gebruiker niet verwijderd. De laatste admin moet blijven. Gekoppelde gegevens of bestanden kunnen verwijderen ook blokkeren." });
        return json(200, { ok: true, message: `Gebruiker ${target.user.email} verwijderd.` });
      }
      if (body.action === "set_role") {
        if (!roles.has(body.role)) return json(400, { error: "Ongeldige rol." });
        if (body.userId === auth.user.id && body.role !== "admin") return json(409, { error: "Je kunt je eigen adminrechten niet verwijderen." });
        const { error } = await admin.rpc("mpop_admin_set_user_role", { target_user_id: body.userId, new_role: body.role });
        if (error) return json(409, { error: "Rol niet gewijzigd. De laatste admin moet admin blijven; controleer ook of de gebruikersbeheer-migratie is geïnstalleerd." });
        return json(200, { ok: true, message: "Rol opgeslagen." });
      }
      const mailClient = createClient(url, anonKey, authOptions);
      const { error } = await mailClient.auth.resetPasswordForEmail(target.user.email, { redirectTo });
      if (error) return json(502, { error: "Herstelmail versturen mislukt. Controleer de Supabase-mailinstellingen of probeer later opnieuw." });
      return json(200, { ok: true, message: `Herstelmail aangevraagd voor ${target.user.email}. Vraag de gebruiker ook de spammap te controleren.` });
    } catch {
      return json(500, { error: "Gebruikersbeheer is tijdelijk niet beschikbaar. Probeer later opnieuw." });
    }
  };
}

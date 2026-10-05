import { supabaseConfig } from "./supabase-config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const sb = createClient(supabaseConfig.url, supabaseConfig.anonKey);
const $ = (id) => document.getElementById(id);
const roles = { viewer: "Viewer", editor: "Editor", soundcreator: "Soundcreator", admin: "Admin" };
let currentAdminId = "";
let page = 1;
let hasMore = false;
let busy = false;
let authorized = false;

function message(text, ok = true) {
  $("adminMessage").textContent = text;
  $("adminMessage").style.color = ok ? "var(--fg)" : "#ffb4b4";
}

function updateButtons() {
  for (const el of $("adminContent").querySelectorAll("button, input, select")) {
    el.disabled = busy || el.dataset.locked === "true";
  }
  $("btnPreviousUsers").disabled = busy || page === 1;
  $("btnNextUsers").disabled = busy || !hasMore;
}

async function request(body) {
  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error("Je sessie is verlopen. Log opnieuw in als admin.");
  const { data, error } = await sb.functions.invoke("user-admin", { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || "Gebruikersbeheer is niet bereikbaar. Controleer of de Supabase-functie user-admin is geïnstalleerd.");
  }
  if (!data?.ok) throw new Error(data?.error || "De actie is niet uitgevoerd.");
  return data;
}

async function run(action) {
  if (busy || !authorized) return;
  busy = true;
  updateButtons();
  try { await action(); }
  catch (error) { message(error.message || String(error), false); }
  finally { busy = false; updateButtons(); }
}

function renderUsers(users) {
  $("userRows").replaceChildren();
  for (const user of users) {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    identity.textContent = user.display_name ? `${user.display_name} (${user.email})` : user.email;
    const status = document.createElement("td");
    status.textContent = user.confirmed ? "Bevestigd" : "Nog niet bevestigd";
    const roleCell = document.createElement("td");
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Rol van ${user.email}`);
    for (const [value, label] of Object.entries(roles)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = user.role || "viewer";
    const self = user.id === currentAdminId;
    select.dataset.locked = String(self);
    roleCell.append(select);
    const actions = document.createElement("td");
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Rol opslaan";
    save.dataset.locked = String(self);
    save.onclick = () => run(async () => {
      if (select.value === "admin" && !window.confirm(`${user.email} adminrechten geven?`)) return;
      await request({ action: "set_role", userId: user.id, role: select.value });
      await loadUsers();
      message(`Rol opgeslagen voor ${user.email}. De gebruiker moet opnieuw inloggen om de nieuwe knoppen te zien.`);
    });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Herstelmail versturen";
    reset.onclick = () => run(async () => {
      if (!window.confirm(`Een wachtwoordherstelmail versturen naar ${user.email}?`)) return;
      message("Herstelmail versturen...");
      const result = await request({ action: "reset_password", userId: user.id });
      message(result.message);
    });
    const buttons = document.createElement("div");
    buttons.className = "btnrow";
    buttons.append(save, reset);
    actions.append(buttons);
    row.append(identity, status, roleCell, actions);
    $("userRows").append(row);
  }
}

async function loadUsers(targetPage = page) {
  const data = await request({ action: "list", page: targetPage });
  page = targetPage;
  hasMore = data.hasMore;
  renderUsers(data.users);
  $("userPage").textContent = `Pagina ${page}`;
}

$("inviteForm").onsubmit = (event) => {
  event.preventDefault();
  void run(async () => {
    if ($("inviteRole").value === "admin" && !window.confirm("Deze nieuwe gebruiker adminrechten geven?")) return;
    message("Uitnodiging versturen...");
    const result = await request({ action: "invite", email: $("inviteEmail").value.trim(),
      displayName: $("inviteName").value.trim(), role: $("inviteRole").value });
    $("inviteForm").reset();
    message(result.message);
    await loadUsers(1);
  });
};
$("btnReloadUsers").onclick = () => run(() => loadUsers());
$("btnPreviousUsers").onclick = () => run(() => loadUsers(page - 1));
$("btnNextUsers").onclick = () => run(() => loadUsers(page + 1));
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    authorized = false;
    $("adminContent").hidden = true;
    message("Je bent uitgelogd. Log in de editor opnieuw in als admin.", false);
  }
});

try {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Log eerst in de editor in als admin.");
  const { data: profile, error: profileError } = await sb.from("profiles").select("role").eq("user_id", data.user.id).single();
  if (profileError || profile?.role !== "admin") throw new Error("Alleen admins hebben toegang tot gebruikersbeheer.");
  currentAdminId = data.user.id;
  authorized = true;
  $("adminContent").hidden = false;
  message("Je kunt gebruikers uitnodigen, rollen wijzigen en herstelmails versturen.");
  await run(() => loadUsers());
} catch (error) { message(error.message || String(error), false); }

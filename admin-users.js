import { loadSupabaseClient } from "./supabase-client.js";

let sb = null;
const $ = (id) => document.getElementById(id);
const roles = { viewer: "Viewer", editor: "Editor", soundcreator: "Soundcreator", admin: "Admin" };
let currentAdminId = "";
let page = 1;
let hasMore = false;
let busy = false;
let authorized = false;

/* Lucide v0.468.0, ISC License.
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
 * as part of Feather (MIT). All other copyright (c) for Lucide are held
 * by Lucide Contributors 2022.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const actionIcons = {
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
};

function actionButton(icon, label, email) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", `${label}: ${email}`);
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${actionIcons[icon]}</svg>`;
  return button;
}

function message(text, ok = true) {
  $("adminMessage").textContent = text;
  $("adminMessage").style.color = ok ? "var(--fg)" : "#ffb4b4";
  if (!ok) $("adminMessage").scrollIntoView({ block: "center", behavior: "smooth" });
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
    if (error.context?.status === 404) {
      throw new Error("De Supabase-beheerfunctie user-admin is nog niet geïnstalleerd. Installeer deze functie en de gebruikersbeheer-migratie voordat je gebruikers kunt beheren.");
    }
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
    const save = actionButton("save", "Rol opslaan", user.email);
    save.dataset.locked = String(self);
    save.onclick = () => run(async () => {
      if (select.value === "admin" && !window.confirm(`${user.email} adminrechten geven?`)) return;
      await request({ action: "set_role", userId: user.id, role: select.value });
      await loadUsers();
      message(`Rol opgeslagen voor ${user.email}. De gebruiker moet opnieuw inloggen om de nieuwe knoppen te zien.`);
    });
    const reset = actionButton("mail", "Herstelmail versturen", user.email);
    reset.onclick = () => run(async () => {
      if (!window.confirm(`Een wachtwoordherstelmail versturen naar ${user.email}?`)) return;
      message("Herstelmail versturen...");
      const result = await request({ action: "reset_password", userId: user.id });
      message(result.message);
    });
    const remove = actionButton("trash", "Gebruiker definitief verwijderen", user.email);
    remove.className = "delete-user";
    remove.setAttribute("aria-label", `Gebruiker ${user.email} verwijderen`);
    remove.dataset.locked = String(self);
    remove.title = self ? "Je kunt je eigen account niet verwijderen." : "Gebruiker definitief verwijderen";
    remove.onclick = () => run(async () => {
      if (!window.confirm(`${user.email} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
      message("Gebruiker verwijderen...");
      const result = await request({ action: "delete_user", userId: user.id });
      message(result.message);
      await loadUsers();
      if (!$("userRows").children.length && page > 1) await loadUsers(page - 1);
    });
    const buttons = document.createElement("div");
    buttons.className = "btnrow user-actions";
    buttons.append(save, reset, remove);
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
try {
  sb = await loadSupabaseClient();
  sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    authorized = false;
    $("adminContent").hidden = true;
    message("Je bent uitgelogd. Log in de editor opnieuw in als admin.", false);
  }
  });
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

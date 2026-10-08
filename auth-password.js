import { loadSupabaseClient } from './supabase-client.js';
import { readPasswordLink, validatePassword } from './password-link.js';

const $ = (id) => document.getElementById(id);
let sb = null;
let ready = false;
let saving = false;
function message(text, ok = true) {
  $('resetMsg').textContent = text;
  $('resetMsg').style.color = ok ? 'var(--fg)' : '#ffb4b4';
}
function enabled(value) {
  for (const input of $('resetForm').querySelectorAll('input, button')) input.disabled = !value;
}
enabled(false);
$('resetForm').onsubmit = async (event) => {
  event.preventDefault();
  if (!ready || saving) return;
  try {
    validatePassword($('newPassword').value, $('confirmPassword').value);
    saving = true;
    enabled(false);
    message('Wachtwoord opslaan...');
    const { error } = await sb.auth.updateUser({ password: $('newPassword').value });
    if (error) throw error;
    ready = false;
    $('resetForm').reset();
    $('resetForm').hidden = true;
    $('introText').hidden = true;
    $('passwordHeading').textContent = 'Wachtwoord opgeslagen';
    await sb.auth.signOut({ scope: 'local' });
    message('Je wachtwoord is opgeslagen. Ga terug naar de editor en log in met je e-mailadres en nieuwe wachtwoord.');
  } catch (error) {
    message(error.message || String(error), false);
    enabled(ready);
  } finally { saving = false; }
};
try {
  sb = await loadSupabaseClient({ auth: { detectSessionInUrl: false } });
  const link = readPasswordLink(window.location);
  window.history.replaceState({}, document.title, new URL('./reset-password.html', window.location.href).href);
  const invitation = link.type === 'invite';
  $('passwordHeading').textContent = invitation ? 'Welkom! Stel je wachtwoord in' : 'Nieuw wachtwoord instellen';
  $('introText').textContent = invitation
    ? 'Je bent uitgenodigd voor MPOP. Je e-mailadres is je inlognaam. Kies hieronder je eigen wachtwoord.'
    : 'Kies hieronder een nieuw wachtwoord voor je MPOP-account.';
  let result;
  if (link.mode === 'session') result = await sb.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
  else if (link.mode === 'otp') result = await sb.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  else result = await sb.auth.exchangeCodeForSession(link.code);
  if (result.error) throw result.error;
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error('De link is verlopen. Vraag een nieuwe mail aan.');
  $('accountEmail').textContent = `Inlognaam: ${data.user.email}`;
  ready = true;
  enabled(true);
  message('De link is geldig. Vul twee keer je nieuwe wachtwoord in.');
  $('newPassword').focus();
} catch (error) {
  message(error.message || String(error), false);
}

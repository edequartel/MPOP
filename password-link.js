export function readPasswordLink(location) {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const error = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error');
  if (error) throw new Error(`De link is ongeldig of verlopen: ${error}`);
  const type = hash.get('type') || query.get('type');
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  const tokenHash = query.get('token_hash');
  const code = query.get('code');
  if (type && type !== 'invite' && type !== 'recovery') throw new Error('Dit is geen uitnodigings- of herstellink.');
  if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) {
    return { mode: 'session', type, accessToken, refreshToken };
  }
  if (tokenHash && (type === 'invite' || type === 'recovery')) return { mode: 'otp', type, tokenHash };
  if (code) return { mode: 'code', type: type || 'recovery', code };
  throw new Error('Open deze pagina via de nieuwste uitnodigings- of herstelmail.');
}

export function validatePassword(password, confirmation) {
  if (password.length < 8) throw new Error('Gebruik een wachtwoord van minimaal 8 tekens.');
  if (password !== confirmation) throw new Error('De wachtwoorden komen niet overeen.');
}

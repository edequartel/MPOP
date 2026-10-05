import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserAdminHandler } from '../supabase/functions/user-admin/handler.js';
import { readPasswordLink, validatePassword } from '../password-link.js';

const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const target = { id: targetId, email: 'user@example.org', email_confirmed_at: '2026-10-05' };
function fixture({ role = 'admin', authenticated = true, rpcError = null, inviteError = null } = {}) {
  const calls = [];
  const caller = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: adminId } : null }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }),
  };
  const admin = {
    auth: { admin: {
      listUsers: async (options) => { calls.push(['list', options]); return { data: { users: [target] } }; },
      getUserById: async (id) => { calls.push(['get', id]); return { data: { user: { ...target, id } } }; },
      inviteUserByEmail: async (...args) => {
        calls.push(['invite', ...args]); return { data: { user: target }, error: inviteError };
      },
    } },
    from: () => ({ select: () => ({ in: async () => ({ data: [{ user_id: targetId, role: 'editor', display_name: 'Test' }] }) }) }),
    rpc: async (...args) => { calls.push(['rpc', ...args]); return { error: rpcError }; },
  };
  const mail = { auth: { resetPasswordForEmail: async (...args) => { calls.push(['mail', ...args]); return {}; } } };
  const env = (key) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server-only' })[key];
  const handler = createUserAdminHandler({ env, createClient: (url, key, options) => {
    if (key === 'server-only') return admin;
    return options.global ? caller : mail;
  } });
  const send = (body, withToken = true) => handler(new Request('https://example.org', {
    method: 'POST', headers: withToken ? { Authorization: 'Bearer valid' } : {}, body: JSON.stringify(body),
  }));
  return { send, calls, handler };
}

test('unauthenticated requests cannot list or send mail', async () => {
  const f = fixture();
  assert.equal((await f.send({ action: 'list' }, false)).status, 401);
  assert.deepEqual(f.calls, []);
  assert.equal((await fixture({ authenticated: false }).send({ action: 'list' })).status, 401);
});
test('non-admin roles cannot use any action', async () => {
  for (const role of ['viewer', 'editor', 'soundcreator', 'unknown']) {
    for (const action of ['list', 'invite', 'set_role', 'reset_password']) {
      const f = fixture({ role });
      assert.equal((await f.send({ action, role: 'admin', userId: targetId })).status, 403);
      assert.deepEqual(f.calls, []);
    }
  }
});
test('list returns only the permitted account fields and profile roles', async () => {
  const data = await (await fixture().send({ action: 'list', page: 2 })).json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.users, [{ id: targetId, email: target.email, confirmed: true, display_name: 'Test', role: 'editor' }]);
  assert.equal(data.hasMore, false);
});
test('invalid inputs have no administrative side effects', async () => {
  for (const body of [null, [], {action:'invalid'}, {action:'list',page:0},
    {action:'invite',email:'bad',role:'admin'}, {action:'invite',email:target.email,role:'root'},
    {action:'set_role',userId:'invalid',role:'editor'}]) {
    const f = fixture();
    assert.equal((await f.send(body)).status, 400);
    assert.deepEqual(f.calls, []);
  }
});
test('invitation sends email and assigns role through server-only RPC', async () => {
  const f = fixture();
  const response = await f.send({ action: 'invite', email: ' USER@example.org ', displayName:' Test ', role:'editor', redirectTo:'https://attacker.example' });
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls[0], ['invite', 'user@example.org', {
    redirectTo:'https://tastenbraille.com/mpop/reset-password.html', data:{ display_name:'Test' },
  }]);
  assert.deepEqual(f.calls[1], ['rpc', 'mpop_admin_set_user_role', { target_user_id:targetId, new_role:'editor' }]);
});
test('failed invitation does not assign a role', async () => {
  const f = fixture({ inviteError: { message: 'existing user' } });
  assert.equal((await f.send({action:'invite',email:target.email,role:'viewer'})).status, 400);
  assert.equal(f.calls.length, 1);
});
test('partial invitation failure reports that mail was sent but role was not saved', async () => {
  const f = fixture({ rpcError: { message: 'migration missing' } });
  const response = await f.send({action:'invite',email:target.email,role:'editor'});
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /uitnodiging is verstuurd, maar de rol/);
});
test('admin cannot demote themselves', async () => {
  const f = fixture();
  assert.equal((await f.send({action:'set_role',userId:adminId,role:'viewer'})).status, 409);
  assert.ok(!f.calls.some(([name]) => name === 'rpc'));
});
test('role change uses validated RPC', async () => {
  const f = fixture();
  assert.equal((await f.send({action:'set_role',userId:targetId,role:'soundcreator'})).status, 200);
  assert.deepEqual(f.calls[1], ['rpc', 'mpop_admin_set_user_role', {target_user_id:targetId,new_role:'soundcreator'}]);
});
test('reset sends mail to account email, ignoring client email and redirect', async () => {
  const f = fixture();
  assert.equal((await f.send({action:'reset_password',userId:targetId,email:'wrong@example.org',redirectTo:'https://attacker.example'})).status, 200);
  assert.deepEqual(f.calls[1], ['mail', target.email, {redirectTo:'https://tastenbraille.com/mpop/reset-password.html'}]);
});
test('password links support invitations, recovery, OTP and PKCE', () => {
  for (const type of ['invite', 'recovery']) {
    assert.equal(readPasswordLink({hash:`#type=${type}&access_token=access&refresh_token=refresh`,search:''}).mode, 'session');
    assert.equal(readPasswordLink({hash:'',search:`?type=${type}&token_hash=hash`}).mode, 'otp');
  }
  assert.equal(readPasswordLink({hash:'',search:'?code=test'}).mode, 'code');
  assert.throws(() => readPasswordLink({hash:'',search:''}));
  assert.throws(() => readPasswordLink({hash:'#type=signup&access_token=access&refresh_token=refresh',search:''}));
  assert.throws(() => readPasswordLink({hash:'#error_description=Expired',search:''}), /Expired/);
});
test('passwords require minimum length and matching confirmation', () => {
  assert.throws(() => validatePassword('short','short'));
  assert.throws(() => validatePassword('long-enough','different'));
  assert.doesNotThrow(() => validatePassword('long-enough','long-enough'));
});

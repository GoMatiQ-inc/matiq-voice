const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {Connections, EncryptedTokenStore, pkce, meetingURL} = require('../src/oauth.cjs');

const fixtureCrypto = {isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async text => Buffer.from(`fixture:${Buffer.from(text).toString('base64')}`), decryptStringAsync: async data => ({result: Buffer.from(data.toString().slice(8), 'base64').toString()})};
async function fixture(t, behavior = 'allow') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-oauth-test-'));
  const store = new EncryptedTokenStore(directory, fixtureCrypto);
  let challenge = '', refreshCount = 0, stateRejected = false;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/authorize') {
      challenge = url.searchParams.get('code_challenge'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      const callback = new URL(url.searchParams.get('redirect_uri')); callback.searchParams.set('state', url.searchParams.get('state'));
      if (behavior === 'deny') callback.searchParams.set('error', 'access_denied'); else callback.searchParams.set('code', 'one-time-code');
      res.writeHead(302, {Location: callback.href}); res.end(); return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/token') {
      let input = ''; for await (const chunk of req) input += chunk;
      const body = new URLSearchParams(input);
      if (body.get('grant_type') === 'authorization_code') assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), challenge);
      else refreshCount++;
      res.end(JSON.stringify({access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_in: 3600})); return;
    }
    if (url.pathname === '/profile') { res.end(JSON.stringify({name: 'Fixture User', email: 'fixture@example.test'})); return; }
    if (url.pathname === '/events') { res.end(JSON.stringify({items: [{id: 'meeting', summary: 'Planning', start: {dateTime: new Date().toISOString()}, hangoutLink: 'https://meet.google.com/abc-defg-hij'}, {id: 'ordinary', summary: 'No conference'}]})); return; }
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const endpoints = {authorize: `${base}/authorize`, token: `${base}/token`, profile: `${base}/profile`, events: `${base}/events`, revoke: `${base}/revoke`};
  const connection = new Connections({config: {google: {clientId: 'fixture-client'}}, store, testEndpoints: {google: endpoints}, openBrowser: async value => {
    const url = new URL(value), wrong = new URL(url.searchParams.get('redirect_uri'));
    wrong.search = '?code=malicious&state=wrong';
    stateRejected = (await fetch(wrong)).status === 400;
    if (behavior !== 'pending') await fetch(value);
  }});
  t.after(async () => { connection.cancel('google'); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, {recursive: true, force: true}); });
  return {connection, store, directory, metrics: () => ({refreshCount, stateRejected})};
}
test('PKCE uses a unique S256 verifier and state per sign-in', () => { const a = pkce(), b = pkce(); assert.notEqual(a.state, b.state); assert.notEqual(a.verifier, b.verifier); assert.equal(a.challenge, createHash('sha256').update(a.verifier).digest('base64url')); });
test('OAuth callback rejects bad state, exchanges PKCE and stores only protected tokens', async t => {
  const f = await fixture(t); const result = await f.connection.connect('google');
  assert.equal(result.google.connected, true); assert.equal(result.google.email, 'fixture@example.test'); assert.equal(f.metrics().stateRejected, true);
  assert.equal(JSON.stringify(result).includes('fixture-access-token'), false);
  assert.equal((await fs.readFile(path.join(f.directory, 'google.bin'), 'utf8')).includes('fixture-access-token'), false);
  assert.equal((await f.connection.events('google')).length, 1);
  const account = await f.store.read('google'); await f.store.write('google', {...account, expiresAt: 0});
  await Promise.all([f.connection.accessToken('google'), f.connection.accessToken('google')]); assert.equal(f.metrics().refreshCount, 1);
  await f.connection.disconnect('google'); assert.equal((await f.connection.status()).google.connected, false);
});
test('consent denial never persists a connected account', async t => { const f = await fixture(t, 'deny'); await assert.rejects(f.connection.connect('google'), /declined/); assert.equal(await f.store.read('google'), null); });
test('OAuth cancellation closes its pending flow', async t => { const f = await fixture(t, 'pending'); const pending = f.connection.connect('google'); const reject = assert.rejects(pending, /cancelled/); await new Promise(resolve => setTimeout(resolve, 30)); f.connection.cancel('google'); await reject; assert.equal(f.connection.pending.size, 0); });
test('credential storage fails closed when OS encryption is unavailable', async t => { const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-locked-')); t.after(() => fs.rm(directory, {recursive: true, force: true})); const store = new EncryptedTokenStore(directory, {isAsyncEncryptionAvailable: async () => false}); await assert.rejects(store.write('google', {accessToken: 'do-not-write'}), /unavailable/); assert.deepEqual(await fs.readdir(directory), []); });
test('meeting links exclude executable, credential-bearing and unrelated URLs', () => { assert.equal(meetingURL('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij'); for (const url of ['javascript:alert(1)', 'https://evil.test/meet', 'https://meet.google.com.evil.test/x', 'https://user:pass@meet.google.com/x', 'http://teams.microsoft.com/x']) assert.throws(() => meetingURL(url)); });
test('disconnect removes unreadable credentials even when the OS key store is locked', async t => {
  const f = await fixture(t); await f.connection.connect('google');
  f.store.crypto = {isAsyncEncryptionAvailable: async () => false};
  assert.equal((await f.connection.status()).google.hasCredentials, true);
  assert.match((await f.connection.disconnect('google')).message, /could not be read/);
  await assert.rejects(fs.access(path.join(f.directory, 'google.bin')), {code: 'ENOENT'});
});
test('disconnect during a token refresh cannot recreate credentials', async t => {
  const f = await fixture(t); await f.connection.connect('google');
  const account = await f.store.read('google'); await f.store.write('google', {...account, expiresAt: 0});
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const originalFetch = f.connection.fetch;
  f.connection.fetch = async (url, options) => { if (String(url).endsWith('/token')) { entered(); await blocked; } return originalFetch(url, options); };
  const refresh = f.connection.accessToken('google'); const rejected = assert.rejects(refresh, /connection changed/);
  await started; await f.connection.disconnect('google'); release(); await rejected;
  assert.equal(await f.store.read('google'), null);
});
test('credential deletion waits for an in-progress encrypted write', async t => {
  const f = await fixture(t); let entered, release;
  const started = new Promise(resolve => { entered = resolve; }); const blocked = new Promise(resolve => { release = resolve; });
  f.store.crypto = {...fixtureCrypto, encryptStringAsync: async text => { entered(); await blocked; return fixtureCrypto.encryptStringAsync(text); }};
  const write = f.store.write('google', {accessToken: 'temporary'}); await started;
  const remove = f.store.remove('google'); release(); await Promise.all([write, remove]);
  assert.equal(await f.store.read('google'), null);
});

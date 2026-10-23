const http = require('node:http');
const {randomBytes, createHash, timingSafeEqual} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PROVIDERS = Object.freeze({
  microsoft: {authorize: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token', profile: 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', scope: 'openid profile offline_access User.Read Calendars.Read'},
  google: {authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://www.googleapis.com/oauth2/v3/userinfo', revoke: 'https://oauth2.googleapis.com/revoke', scope: 'openid email profile https://www.googleapis.com/auth/calendar.events.readonly'}
});
function providerFor(id) { if (!Object.hasOwn(PROVIDERS, id)) throw new Error('Choose Microsoft or Google.'); return PROVIDERS[id]; }
function pkce() { const verifier = randomBytes(48).toString('base64url'); return {verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), state: randomBytes(32).toString('base64url')}; }
function equal(a, b) { return typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function meetingURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'].includes(url.hostname)) throw new Error('Use a valid Google Meet or Microsoft Teams meeting link.');
  return url.href;
}

class EncryptedTokenStore {
  constructor(directory, crypto) { this.directory = directory; this.crypto = crypto; this.writes = new Map(); }
  async read(provider) {
    providerFor(provider);
    let encrypted;
    try { encrypted = await fs.readFile(path.join(this.directory, `${provider}.bin`)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!await this.crypto.isAsyncEncryptionAvailable()) throw new Error('Unlock your operating-system key store to reconnect your account.');
    const decrypted = await this.crypto.decryptStringAsync(encrypted);
    return JSON.parse(decrypted.result);
  }
  serialize(provider, operation) {
    providerFor(provider);
    const task = (this.writes.get(provider) || Promise.resolve()).catch(() => {}).then(operation);
    this.writes.set(provider, task);
    return task.finally(() => { if (this.writes.get(provider) === task) this.writes.delete(provider); });
  }
  write(provider, value) { return this.serialize(provider, async () => {
    if (!await this.crypto.isAsyncEncryptionAvailable()) throw new Error('Secure credential storage is unavailable. Unlock the operating-system key store; no tokens were saved.');
    await fs.mkdir(this.directory, {recursive: true, mode: 0o700});
    const destination = path.join(this.directory, `${provider}.bin`);
    await fs.writeFile(`${destination}.tmp`, await this.crypto.encryptStringAsync(JSON.stringify(value)), {mode: 0o600});
    await fs.rename(`${destination}.tmp`, destination);
  }); }
  remove(provider) { return this.serialize(provider, async () => { for (const suffix of ['.bin', '.bin.tmp']) await fs.rm(path.join(this.directory, `${provider}${suffix}`), {force: true}); }); }
}

class Connections {
  constructor({config = {}, store, openBrowser, fetchImpl = fetch, testEndpoints = null}) {
    this.config = config; this.store = store; this.openBrowser = openBrowser; this.fetch = fetchImpl;
    // Dependency injection is used by the test entry point, never read from user settings.
    this.testEndpoints = testEndpoints; this.pending = new Map(); this.refreshing = new Map(); this.versions = new Map();
  }
  provider(id) { const standard = providerFor(id); return {...standard, ...(this.testEndpoints?.[id] || {})}; }
  async json(url, options = {}) {
    const response = await this.fetch(url, {...options, signal: options.signal || AbortSignal.timeout(30000), redirect: 'error'});
    let data;
    try { data = await response.json(); } catch { throw new Error('The account service returned an invalid response. Retry or reconnect your account.'); }
    if (!response.ok || data.error) {
      const code = typeof data.error === 'string' && /^[a-z_]{1,50}$/.test(data.error) ? data.error : `http_${response.status}`;
      throw new Error(`Account service rejected the request (${code}). Reconnect your account or contact your organization’s administrator.`);
    }
    return data;
  }
  async status() {
    const result = {};
    for (const id of Object.keys(PROVIDERS)) {
      try {
        const account = await this.store.read(id);
        result[id] = {configured: Boolean(this.config[id]?.clientId), connected: Boolean(account), email: account?.email || '', name: account?.name || ''};
      } catch {
        result[id] = {configured: Boolean(this.config[id]?.clientId), connected: false, hasCredentials: true, email: '', name: '', error: 'Unlock the operating-system key store to access this connection.'};
      }
    }
    return result;
  }
  cancel(id) { providerFor(id); this.pending.get(id)?.abort(); }
  async connect(id) {
    const provider = this.provider(id), config = this.config[id];
    if (!config?.clientId) throw new Error('This build has no OAuth registration for this provider. Install a configured MatiQ Voice build or contact MatiQ support.');
    if (this.pending.has(id)) throw new Error('A sign-in is already open. Finish or cancel it first.');
    this.versions.set(id, (this.versions.get(id) || 0) + 1);
    const controller = new AbortController(); this.pending.set(id, controller);
    const proof = pkce(); let server, timeout;
    try {
      let resolveCode, rejectCode;
      const callback = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
      callback.catch(() => {});
      server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const reply = (status, text) => { res.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"}); res.end(text); };
        if (req.method !== 'GET' || url.pathname !== '/' || !equal(url.searchParams.get('state'), proof.state)) { reply(400, 'Invalid sign-in response. Return to MatiQ Voice.'); return; }
        if (url.searchParams.has('error')) { reply(200, 'Sign-in was declined. Return to MatiQ Voice.'); rejectCode(new Error('Sign-in was declined. No account was connected.')); return; }
        const code = url.searchParams.get('code');
        if (!code || code.length > 4096) { reply(400, 'Missing sign-in code.'); return; }
        reply(200, 'Sign-in received. You can close this tab and return to MatiQ Voice.'); resolveCode(code);
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const redirect = `http://${id === 'microsoft' ? 'localhost' : '127.0.0.1'}:${server.address().port}/`;
      const authorization = new URL(provider.authorize);
      authorization.search = new URLSearchParams({client_id: config.clientId, response_type: 'code', redirect_uri: redirect, scope: provider.scope,
        state: proof.state, code_challenge: proof.challenge, code_challenge_method: 'S256', prompt: id === 'google' ? 'consent' : 'select_account', ...(id === 'google' ? {access_type: 'offline'} : {})});
      controller.signal.addEventListener('abort', () => rejectCode(new Error('Sign-in cancelled.')), {once: true});
      timeout = setTimeout(() => rejectCode(new Error('Sign-in timed out. Try connecting again.')), 180000);
      Promise.resolve(this.openBrowser(authorization.href)).catch(rejectCode);
      const code = await callback;
      const body = new URLSearchParams({client_id: config.clientId, grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: proof.verifier,
        ...(id === 'google' && config.desktopClientSecret ? {client_secret: config.desktopClientSecret} : {})});
      const tokens = await this.json(provider.token, {method: 'POST', body, signal: controller.signal});
      if (!tokens.access_token || !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0) throw new Error('The account service returned unusable credentials. Connect again.');
      const profile = await this.json(provider.profile, {headers: {Authorization: `Bearer ${tokens.access_token}`}, signal: controller.signal});
      if (controller.signal.aborted) throw new Error('Sign-in cancelled.');
      await this.store.write(id, {accessToken: tokens.access_token, refreshToken: tokens.refresh_token || '', expiresAt: Date.now() + Number(tokens.expires_in) * 1000,
        name: profile.name || profile.displayName || '', email: profile.email || profile.mail || profile.userPrincipalName || ''});
      if (controller.signal.aborted) { await this.store.remove(id); throw new Error('Sign-in cancelled.'); }
      return this.status();
    } finally { clearTimeout(timeout); server?.closeAllConnections(); server?.close(); this.pending.delete(id); }
  }
  async accessToken(id) {
    const version = this.versions.get(id) || 0;
    const account = await this.store.read(id);
    if (!account) throw new Error('Connect your account before loading meetings.');
    if (account.expiresAt > Date.now() + 60000) return account.accessToken;
    if (!account.refreshToken) throw new Error('Your account session expired. Connect it again.');
    if (!this.refreshing.has(id)) {
      const task = (async () => {
        const provider = this.provider(id), config = this.config[id];
        if (!config?.clientId) throw new Error('This build is missing its account registration.');
        const tokens = await this.json(provider.token, {method: 'POST', body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: account.refreshToken, client_id: config.clientId,
          ...(id === 'google' && config.desktopClientSecret ? {client_secret: config.desktopClientSecret} : {})})});
        if (!tokens.access_token || !(Number(tokens.expires_in) > 0)) throw new Error('Account refresh failed. Reconnect your account.');
        if ((this.versions.get(id) || 0) !== version) throw new Error('The account connection changed. Reconnect before loading meetings.');
        await this.store.write(id, {...account, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || account.refreshToken, expiresAt: Date.now() + Number(tokens.expires_in) * 1000});
        return tokens.access_token;
      })().finally(() => this.refreshing.delete(id));
      this.refreshing.set(id, task);
    }
    return this.refreshing.get(id);
  }
  async disconnect(id) {
    this.cancel(id);
    this.versions.set(id, (this.versions.get(id) || 0) + 1);
    let account, unreadable = false;
    try { account = await this.store.read(id); } catch { unreadable = true; }
    await this.store.remove(id);
    if (unreadable) return {message: 'Disconnected on this computer. Remove the app’s consent in your account settings because stored credentials could not be read for remote revocation.'};
    if (id === 'google' && account) {
      try {
        const response = await this.fetch(this.provider(id).revoke, {method: 'POST', body: new URLSearchParams({token: account.refreshToken || account.accessToken}), signal: AbortSignal.timeout(15000), redirect: 'error'});
        if (!response.ok) throw new Error();
      } catch { return {message: 'Disconnected on this computer. Remote revocation failed; remove access in your Google account settings.'}; }
    }
    return {message: id === 'microsoft' ? 'Disconnected on this computer. You can remove the app’s consent in your Microsoft account.' : 'Disconnected and Google access revoked.'};
  }
  async events(id) {
    const token = await this.accessToken(id);
    const start = new Date().toISOString(), end = new Date(Date.now() + 7 * 86400000).toISOString();
    const api = id === 'microsoft' ? new URL('https://graph.microsoft.com/v1.0/me/calendarView') : new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    api.search = id === 'microsoft' ? new URLSearchParams({startDateTime: start, endDateTime: end, '$top': '50', '$select': 'id,subject,start,end,onlineMeeting,isCancelled'}) : new URLSearchParams({timeMin: start, timeMax: end, singleEvents: 'true', orderBy: 'startTime', maxResults: '50'});
    const data = await this.json(this.testEndpoints?.[id]?.events || api.href, {headers: {Authorization: `Bearer ${token}`, ...(id === 'microsoft' ? {Prefer: 'outlook.timezone="UTC"'} : {})}});
    const events = id === 'microsoft' ? data.value : data.items;
    if (!Array.isArray(events)) throw new Error('The calendar service returned an invalid meeting list. Retry.');
    return events.filter(event => !event.isCancelled && event.status !== 'cancelled').flatMap(event => {
      const link = id === 'microsoft' ? event.onlineMeeting?.joinUrl : event.hangoutLink || event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === 'video')?.uri;
      try { return [{id: `${id}:${event.id}`, provider: id, title: event.subject || event.summary || 'Untitled meeting', start: event.start?.dateTime || event.start?.date || '', url: meetingURL(link)}]; }
      catch { return []; } // Non-conference calendar entries are intentionally excluded.
    });
  }
}
module.exports = {PROVIDERS, pkce, meetingURL, EncryptedTokenStore, Connections};

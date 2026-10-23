import {_electron as electron, chromium} from 'playwright';
import {expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {encodeWav} from '../src/ui/audio.mjs';
const require = createRequire(import.meta.url), {prepare} = require('./prepare-e2e.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = process.env.MATIQ_E2E_FIXTURES || path.join(root, '.validation');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-e2e-'));
const profile = path.join(temporary, 'profile'), authorizeFile = path.join(temporary, 'authorization-url.txt');
const results = [], pageErrors = [], proof = new Map();
let desktop, browser, server, failedDownload = true;
function canonicalWav(wav) {
  let offset = 12;
  while (wav.toString('ascii', offset, offset + 4) !== 'data') { const size = wav.readUInt32LE(offset + 4); offset += 8 + size + size % 2; }
  const pcm = wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 16000); assert.equal(wav.readUInt16LE(34), 16);
  return Array.from(new Uint8Array(encodeWav([Float32Array.from({length: pcm.length / 2}, (_, i) => pcm.readInt16LE(i * 2) / 32768)])));
}
async function scenario(name, action) { console.log('E2E:', name); await action(); results.push(name); }
async function boot() {
  const entry = path.join(temporary, 'bootstrap.cjs');
  const base = `http://127.0.0.1:${server.address().port}`;
  const endpoints = Object.fromEntries(['microsoft', 'google'].map(id => [id, Object.fromEntries(['authorize', 'token', 'profile', 'events', 'revoke'].map(key => [key, `${base}/${id}/${key}`]))]));
  await fs.writeFile(entry, `const {app}=require('electron');const fs=require('node:fs/promises');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root, 'src/main.cjs'))}).launch({oauthConfig:{microsoft:{clientId:'fixture-microsoft'},google:{clientId:'fixture-google'}},testEndpoints:${JSON.stringify(endpoints)},openBrowser:async url=>fs.writeFile(${JSON.stringify(authorizeFile)},url),inspectHardware:async(directory,engine)=>{const h=await require(${JSON.stringify(path.join(root, 'src/hardware.cjs'))}).inspectHardware(directory,engine);const recommend=require(${JSON.stringify(path.join(root, 'src/hardware.cjs'))}).recommendModel;return {...h,memoryBytes:4*1024**3,cores:2,recommendation:recommend({platform:process.platform,arch:process.arch,memoryBytes:4*1024**3,cores:2})};},downloadAsset:async(asset,...rest)=>require(${JSON.stringify(path.join(root, 'src/assets.cjs'))}).downloadAsset({...asset,url:${JSON.stringify(base)}+'/models/'+asset.file},...rest)});`);
  desktop = await electron.launch({executablePath: require('electron'), cwd: root, args: [entry, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']});
  await expect.poll(() => desktop.windows().some(page => page.url().endsWith('/index.html')), {timeout: 15000}).toBe(true);
  const page = desktop.windows().find(value => value.url().endsWith('/index.html'));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.locator('#model option').first().waitFor({state: 'attached'});
  await page.evaluate(() => {
    const originalMicrophone = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__e2eAudio = [];
    async function syntheticAudio(frequency) {
      const context = new AudioContext({sampleRate: 16000}); const oscillator = context.createOscillator();
      const gain = context.createGain(); const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = frequency; gain.gain.value = .2; oscillator.connect(gain); gain.connect(destination); oscillator.start(); await context.resume();
      window.__e2eAudio.push({context, oscillator, destination}); return destination.stream;
    }
    navigator.mediaDevices.getUserMedia = async options => window.__e2eMeeting ? syntheticAudio(440) : originalMicrophone(options);
    navigator.mediaDevices.getDisplayMedia = async () => {
      // Independent, deterministic sources avoid sharing Chrome's fake mic driver.
      const audio = await syntheticAudio(660); const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
      canvas.getContext('2d').fillRect(0, 0, 8, 8); window.__e2eCanvas = canvas;
      const video = canvas.captureStream(1); return new MediaStream([...audio.getAudioTracks(), ...video.getVideoTracks()]);
    };
  });
  return page;
}
async function consent(page, provider, decision) {
  await fs.rm(authorizeFile, {force: true});
  await page.locator(`#setup-connections button[data-provider="${provider}"], #connections button[data-provider="${provider}"]`).filter({visible: true}).click();
  await expect.poll(async () => { try { return await fs.readFile(authorizeFile, 'utf8'); } catch { return ''; } }, {timeout: 10000}).not.toBe('');
  const url = await fs.readFile(authorizeFile, 'utf8');
  const tab = await browser.newPage();
  try { await tab.goto(url); await tab.getByRole('button', {name: decision, exact: true}).click(); }
  finally { await tab.close(); }
}
try {
  await fs.access(path.join(root, 'engine', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'));
  const assets = await prepare(fixtures);
  const files = new Map(assets.map(asset => [asset.file, path.join(fixtures, asset.file)]));
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/models/')) {
        if (failedDownload) { failedDownload = false; res.writeHead(503); res.end('fixture interrupted download'); return; }
        const file = files.get(decodeURIComponent(url.pathname.slice(8))); if (!file) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': (await fs.stat(file)).size}); createReadStream(file).pipe(res); return;
      }
      const [, provider, route] = url.pathname.split('/');
      if (!['google', 'microsoft'].includes(provider)) { res.writeHead(404); res.end(); return; }
      if (route === 'authorize') {
        const key = randomBytes(12).toString('hex'); proof.set(key, {provider, state: url.searchParams.get('state'), callback: url.searchParams.get('redirect_uri'), challenge: url.searchParams.get('code_challenge')});
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        res.setHeader('Content-Type', 'text/html'); res.end(`<html><body><h1>Fixture ${provider} consent</h1><p>Local test provider, not a real account.</p><form action="/${provider}/allow"><input type="hidden" name="key" value="${key}"><button name="decision" value="allow">Allow read-only calendar access</button><button name="decision" value="deny">Decline</button></form></body></html>`); return;
      }
      if (route === 'allow') {
        const record = proof.get(url.searchParams.get('key')); const callback = new URL(record.callback); callback.searchParams.set('state', record.state);
        if (url.searchParams.get('decision') === 'deny') callback.searchParams.set('error', 'access_denied'); else callback.searchParams.set('code', url.searchParams.get('key'));
        res.writeHead(302, {Location: callback.href}); res.end(); return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (route === 'token') {
        let raw = ''; for await (const chunk of req) raw += chunk; const body = new URLSearchParams(raw);
        if (body.get('grant_type') === 'authorization_code') { const record = proof.get(body.get('code')); assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), record.challenge); proof.delete(body.get('code')); }
        res.end(JSON.stringify({access_token: `fixture-access-${provider}`, refresh_token: `fixture-refresh-${provider}`, expires_in: 3600})); return;
      }
      if (route === 'revoke') { res.end('{}'); return; }
      if (req.headers.authorization !== `Bearer fixture-access-${provider}`) { res.writeHead(401); res.end('{"error":"invalid_token"}'); return; }
      if (route === 'profile') { res.end(JSON.stringify({name: 'E2E User', displayName: 'E2E User', email: `${provider}@example.test`, mail: `${provider}@example.test`})); return; }
      if (route === 'events') { res.end(JSON.stringify(provider === 'microsoft' ? {value: [{id: 'teams', subject: 'Teams fixture planning', start: {dateTime: new Date().toISOString()}, onlineMeeting: {joinUrl: 'https://teams.microsoft.com/l/meetup-join/fixture'}}]} : {items: [{id: 'meet', summary: 'Google fixture planning', start: {dateTime: new Date().toISOString()}, hangoutLink: 'https://meet.google.com/abc-defg-hij'}]})); return; }
      res.writeHead(404); res.end('{}');
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({error: 'fixture_error'})); console.error('Fixture assertion:', error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({channel: process.env.MATIQ_E2E_BROWSER_CHANNEL || 'chrome', headless: true});
  let page = await boot();
  await scenario('fresh install checks hardware and recommends an English model', async () => {
    await expect(page.locator('#setup-dialog')).toBeVisible(); await expect(page.locator('#setup-title')).toHaveText('Check this computer');
    await expect(page.locator('#setup-content')).toContainText('4.0 GB');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.locator('#setup-next').click(); await expect(page.locator('#setup-model')).toHaveValue('base.en');
  });
  await scenario('failed model download is visible, retry verifies real model bytes', async () => {
    await page.locator('#setup-download').click(); await expect(page.locator('#setup-error')).toContainText('503'); await expect(page.locator('#setup-next')).toBeDisabled();
    await page.locator('#setup-download').click(); await expect(page.locator('#setup-download-label')).toContainText('All required models', {timeout: 120000});
    const status = await page.evaluate(() => window.matiqVoice.status()); assert.equal(status.modelReady && status.speakerReady, true); await page.locator('#setup-next').click();
  });
  await scenario('microphone check captures synthetic audio before setup completes', async () => {
    await page.locator('#setup-test-microphone').click(); await expect(page.locator('#setup-content')).toContainText('Audio signal detected', {timeout: 15000});
    await page.locator('#setup-next').click(); await page.locator('#setup-copy-only').check(); await expect(page.locator('#setup-next')).toBeEnabled(); await page.locator('#setup-next').click();
  });
  await scenario('OAuth denial stays disconnected; Microsoft and Google PKCE consent succeeds', async () => {
    await consent(page, 'google', 'Decline'); await expect(page.locator('#setup-error')).toContainText('declined');
    assert.equal((await page.evaluate(() => window.matiqVoice.status())).connections.google.connected, false);
    for (const provider of ['microsoft', 'google']) { await consent(page, provider, 'Allow read-only calendar access'); await expect.poll(async () => (await page.evaluate(() => window.matiqVoice.status())).connections[provider].connected, {timeout: 20000}).toBe(true); }
    for (const provider of ['microsoft', 'google']) { const encrypted = await fs.readFile(path.join(profile, 'credentials', `${provider}.bin`)); assert.equal(encrypted.includes(Buffer.from('fixture-access-')), false); }
    await page.locator('#setup-next').click(); await page.locator('#setup-next').click(); await expect(page.locator('#setup-dialog')).not.toBeVisible();
  });
  await scenario('verbatim recognition and copy use the bundled real speech engine', async () => {
    const wav = canonicalWav(await fs.readFile(path.join(fixtures, 'jfk.wav')));
    await page.evaluate(async bytes => { await window.matiqVoice.begin(); await window.matiqVoice.recordingReady(); await window.matiqVoice.transcribe(new Uint8Array(bytes)); }, wav);
    await expect(page.locator('#transcript')).toHaveValue(/ask not/i, {timeout: 60000}); await page.locator('#copy').click();
    assert.match(await desktop.evaluate(({clipboard}) => clipboard.readText()), /ask not/i);
    await page.locator('#record').click(); await expect(page.locator('#status')).toContainText('Listening'); await page.locator('#cancel').click(); await expect(page.locator('#status')).toHaveText('Ready when you are.');
  });
  await scenario('calendar cards come from authenticated Microsoft and Google API calls', async () => {
    await page.getByRole('button', {name: 'Meetings', exact: true}).click(); await page.locator('.upcoming summary').click(); await page.locator('#calendar-refresh').click();
    await expect(page.locator('#calendar-list')).toContainText('Teams fixture planning'); await expect(page.locator('#calendar-list')).toContainText('Google fixture planning');
  });
  await scenario('meeting capture saves synthetic microphone/system audio and processes locally', async () => {
    await page.evaluate(() => { window.__e2eMeeting = true; });
    await page.locator('#new-meeting').click(); await page.locator('#meeting-title').fill('Synthetic capture E2E'); await page.locator('#meeting-consent').check(); await page.locator('#meeting-start').click();
    await expect.poll(async () => (await page.evaluate(() => window.matiqVoice.status())).state).toBe('meeting-recording');
    await expect.poll(async () => Number(await page.locator('#mic-meter').getAttribute('value'))).toBeGreaterThan(0);
    await page.getByRole('button', {name: 'Pause', exact: true}).click(); await expect(page.getByRole('button', {name: 'Resume', exact: true})).toBeVisible(); await page.getByRole('button', {name: 'Resume', exact: true}).click();
    await page.getByRole('button', {name: 'Stop & process', exact: true}).click(); await expect.poll(async () => (await page.evaluate(() => window.matiqVoice.status())).state, {timeout: 120000}).toBe('idle');
    await expect(page.locator('#notice')).toContainText('ready', {timeout: 120000});
  });
  let actualMeeting;
  await scenario('English two-speaker fixture produces real diarization, editable labels and linked notes', async () => {
    const wav = canonicalWav(await fs.readFile(path.join(fixtures, 'two-speakers-en.wav')));
    actualMeeting = await page.evaluate(async bytes => { const api = window.matiqVoice; const meeting = await api.beginMeeting({title: 'English speaker E2E', provider: 'google'}); await api.meetingReady(); await api.appendMeeting(meeting.id, 'system', 0, new Uint8Array(bytes)); await api.stopMeeting(meeting.id); return meeting.id; }, wav);
    await page.getByRole('button', {name: 'Dictation', exact: true}).click(); await page.getByRole('button', {name: 'Meetings', exact: true}).click(); await page.locator('.meeting-item').filter({hasText: 'English speaker E2E'}).click();
    await page.getByRole('button', {name: 'Process saved audio', exact: true}).click(); await expect(page.locator('#meeting-detail .turn').first()).toBeVisible({timeout: 120000});
    const meeting = await page.evaluate(id => window.matiqVoice.getMeeting(id), actualMeeting);
    assert.equal(meeting.status, 'ready'); assert.ok(Object.keys(meeting.speakers).filter(key => key.startsWith('remote-')).length >= 2, 'English fixture must produce at least two anonymous speaker clusters');
    await page.locator('#speaker-remote-0').fill('Alex'); await page.locator('.speaker-row').filter({has: page.locator('#speaker-remote-0')}).getByRole('button', {name: 'Save name'}).click();
    await expect(page.locator('#speaker-remote-0')).toHaveValue('Alex'); await page.getByRole('button', {name: 'Notes', exact: true}).click();
    await expect(page.locator('#meeting-content')).toContainText('Extracted passages'); await page.locator('#personal-notes').fill('E2E personal note retained locally.'); await page.getByRole('button', {name: 'Save notes', exact: true}).click(); await expect(page.locator('#notice')).toContainText('notes saved');
    await page.getByRole('button', {name: /View transcript/}).first().click(); await expect(page.locator('#meeting-content .turn').first()).toBeVisible();
  });
  await scenario('closing hides the window; restart preserves setup, credentials, speakers and notes', async () => {
    await desktop.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'MatiQ Voice').close());
    assert.equal(await desktop.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'MatiQ Voice').isVisible()), false);
    await desktop.close(); desktop = null; page = await boot(); await expect(page.locator('#setup-dialog')).not.toBeVisible();
    assert.equal((await page.evaluate(() => window.matiqVoice.status())).connections.google.connected, true);
    await page.getByRole('button', {name: 'Meetings', exact: true}).click(); await page.locator('.meeting-item').filter({hasText: 'English speaker E2E'}).click(); await expect(page.locator('#speaker-remote-0')).toHaveValue('Alex');
    await page.getByRole('button', {name: 'Notes', exact: true}).click(); await expect(page.locator('#personal-notes')).toHaveValue('E2E personal note retained locally.');
    await page.screenshot({path: path.join(fixtures, 'matiq-voice-e2e.png'), fullPage: true});
  });
  await scenario('disconnect removes protected local credentials', async () => {
    await page.getByRole('button', {name: 'Settings', exact: true}).click(); await page.locator('#connections button[data-provider="google"]').click(); await expect.poll(async () => (await page.evaluate(() => window.matiqVoice.status())).connections.google.connected).toBe(false); await assert.rejects(fs.access(path.join(profile, 'credentials', 'google.bin')));
  });
  assert.deepEqual(pageErrors, []);
  await fs.writeFile(path.join(fixtures, 'e2e-results.json'), JSON.stringify({result: 'passed', journeys: results, providers: 'Local fixtures', audio: 'Synthetic capture plus real English inference fixtures'}, null, 2));
  console.log(JSON.stringify({result: 'passed', journeys: results.length, scenarios: results, limitations: ['OAuth uses local fixture providers; real provider consent is not tested.', 'Microphone and system audio use synthetic devices, not a real Teams/Meet call.', 'Actual English models, native inference, callback HTTP, OS-protected credential storage and persistence are exercised.']}, null, 2));
} catch (error) {
  if (desktop) { const page = desktop.windows().find(value => value.url().endsWith('/index.html')); if (page) { console.error('Visible failure:', await page.locator('#notice').textContent()); console.error('Setup failure:', await page.locator('#setup-error').textContent()); await page.screenshot({path: path.join(fixtures, 'e2e-failure.png'), fullPage: true}).catch(() => {}); } }
  console.error('E2E FAILED after', results.length, 'journeys:', error); process.exitCode = 1;
} finally {
  if (desktop) await desktop.close().catch(() => {});
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.rm(temporary, {recursive: true, force: true});
}

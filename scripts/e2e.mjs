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
if (!process.env.MATIQ_COMPANION_SOURCE) throw new Error('Set MATIQ_COMPANION_SOURCE to the qualified Companion checkout before running the family integration suite.');
const companionRoot = path.resolve(process.env.MATIQ_COMPANION_SOURCE);
const {ModelStore, sharedRoot: companionSharedRoot} = require(path.join(companionRoot,'src/models.cjs'));
const lifecycle = require('./fixture-lifecycle.cjs');
const {sharedRoot, speechAsset, adoptExistingAssets} = require('../src/shared-models.cjs');
const {SPEAKER_MODELS} = require('../src/assets.cjs');
const familyRoot = path.join(temporary,'family-models'), familyStore = new ModelStore(familyRoot);
const familyAssets = [speechAsset('base.en'),...SPEAKER_MODELS];
const ownedDesktops = [];
let browserServer, ownedBrowser, fixturePort, modelRequests = 0;
const watchdog = setTimeout(()=>{ desktop?.process().kill(); browserServer?.process().kill(); server?.closeAllConnections(); server?.close(); process.exitCode=1; },12*60*1000);

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
  await fs.writeFile(entry, `const {app}=require('electron');const fs=require('node:fs/promises');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root, 'src/main.cjs'))}).launch({updater:(()=>{const u=new(require('node:events').EventEmitter)();u.setFeedURL=()=>{};u.checkForUpdates=async()=>({cancellationToken:{},updateInfo:{version:'99.0.0'}});u.downloadUpdate=async()=>u.emit('update-downloaded',{version:'99.0.0'});u.quitAndInstall=()=>{globalThis.__updateInstalled=true;setTimeout(()=>{const {autoUpdater,BrowserWindow}=require('electron');autoUpdater.emit('before-quit-for-update');BrowserWindow.getAllWindows().find(w=>w.getTitle()==='MatiQ Voice').close();},100);};return u;})(),keyboardSpawn:()=>{const child=new(require('node:events').EventEmitter)();const Stream=require('node:stream').PassThrough;child.stdout=new Stream();child.stderr=new Stream();child.stdin=new Stream();child.stdin.once('finish',()=>queueMicrotask(()=>child.emit('close',0)));child.kill=()=>child.emit('close',0);globalThis.__keyboardFixture=child;queueMicrotask(()=>child.stdout.write(JSON.stringify({ready:true})+'\\n'));return child;},oauthConfig:{microsoft:{clientId:'fixture-microsoft'},google:{clientId:'fixture-google'}},testEndpoints:${JSON.stringify(endpoints)},openBrowser:async url=>fs.writeFile(${JSON.stringify(authorizeFile)},url),inspectHardware:async(directory,engine)=>{const h=await require(${JSON.stringify(path.join(root, 'src/hardware.cjs'))}).inspectHardware(directory,engine);const recommend=require(${JSON.stringify(path.join(root, 'src/hardware.cjs'))}).recommendModel;return {...h,memoryBytes:4*1024**3,cores:2,recommendation:recommend({platform:process.platform,arch:process.arch,memoryBytes:4*1024**3,cores:2})};},sharedModelRoot:${JSON.stringify(familyRoot)},downloadAsset:async(asset,directory,progress,signal)=>require(${JSON.stringify(path.join(root, 'src/shared-models.cjs'))}).sharedDownloadAsset({...asset,url:${JSON.stringify(base)}+'/models/'+asset.file},directory,progress,signal,${JSON.stringify(familyRoot)})});`);
  desktop = await electron.launch({executablePath: require('electron'), cwd: root, args: [entry, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']});
  ownedDesktops.push(lifecycle.capture(desktop.process()));
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
        modelRequests++;
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
  fixturePort = server.address().port;
  browserServer = await chromium.launchServer({channel: process.env.MATIQ_E2E_BROWSER_CHANNEL || 'chrome', headless: true});
  ownedBrowser = lifecycle.capture(browserServer.process());
  browser = await chromium.connect(browserServer.wsEndpoint());
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
  await scenario('Voice and Companion share verified speech assets without confusing them with LLMs',async()=>{
    assert.equal(sharedRoot(),companionSharedRoot());
    const inventory=await familyStore.inventory();
    assert.equal(inventory.length,3);
    assert.deepEqual(inventory.map(m=>m.kind).sort(),['asr','speaker','speaker']);
    const before=modelRequests, secondProfile=path.join(temporary,'second-voice-models');
    assert.equal((await adoptExistingAssets(familyAssets,secondProfile,familyRoot)).length,3);
    for(const asset of familyAssets) {
      const model={...asset,kind:asset.file.startsWith('ggml-')?'asr':'speaker'};
      assert.equal(await familyStore.verify(model),true);
      const original=await fs.stat(path.join(profile,'models',asset.file),{bigint:true});
      const reused=await fs.stat(path.join(secondProfile,asset.file),{bigint:true});
      assert.equal(original.ino,reused.ino); assert.equal(original.dev,reused.dev);
    }
    assert.equal(modelRequests,before);
    assert.equal((await page.evaluate(()=>window.matiqVoice.status())).sharedModels.length,3);
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
  await scenario('floating indicator follows live levels, stays top-centered and never takes focus', async () => {
    const hud = desktop.windows().find(window => window.url().endsWith('/hud.html'));
    hud.on('pageerror', error => pageErrors.push(error.message));
    await expect(hud.locator('#waveform span')).toHaveCount(19);
    await page.evaluate(async () => { await window.matiqVoice.begin(); await window.matiqVoice.recordingReady(); await window.matiqVoice.meter({level: 0, seconds: 2}); });
    await expect(hud.locator('#time')).toHaveText('0:02');
    await expect.poll(() => hud.locator('#waveform span').evaluateAll(bars => bars.every(bar => Math.abs(bar.getBoundingClientRect().height - 3) < .1))).toBe(true);
    await hud.screenshot({path: path.join(fixtures, 'hud-silent.png')});
    await page.evaluate(() => window.matiqVoice.meter({level: .7, seconds: 3}));
    await expect.poll(() => hud.locator('#waveform span').nth(9).evaluate(bar => bar.getBoundingClientRect().height)).toBeGreaterThan(20);
    await expect(hud.locator('#time')).toHaveText('0:03');
    assert.deepEqual(await desktop.evaluate(({BrowserWindow, screen}) => {
      const hud = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/hud.html'));
      const bounds = hud.getBounds(), area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      return {centered: Math.abs(bounds.x + bounds.width / 2 - area.x - area.width / 2) <= 1, top: bounds.y === area.y + 10, focused: hud.isFocused(), focusable: hud.isFocusable()};
    }), {centered: true, top: true, focused: false, focusable: false});
    await hud.screenshot({path: path.join(fixtures, 'hud-recording.png')});
    await page.evaluate(() => window.matiqVoice.meter({level: 0, seconds: 4}));
    await expect.poll(() => hud.locator('#waveform span').evaluateAll(bars => bars.every(bar => Math.abs(bar.getBoundingClientRect().height - 3) < .1))).toBe(true);
    await page.evaluate(() => window.matiqVoice.cancel());
    assert.equal(await desktop.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/hud.html')).isVisible()), false);
  });
  await scenario('close runs in the tray and reopening restores the Mac Dock icon', async () => {
    await desktop.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'MatiQ Voice').close());
    assert.equal(await desktop.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'MatiQ Voice').isVisible()), false);
    if (process.platform === 'darwin') await expect.poll(() => desktop.evaluate(({app}) => app.dock.isVisible())).toBe(false);
    await desktop.evaluate(({app}) => app.emit('activate'));
    await expect.poll(() => desktop.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'MatiQ Voice').isVisible())).toBe(true);
    if (process.platform === 'darwin') await expect.poll(() => desktop.evaluate(({app}) => app.dock.isVisible())).toBe(true);
  });
  async function keys(events) {
    const map=require('../src/key-bindings.cjs').keyMap(process.platform);
    await desktop.evaluate((_,events)=>{
      for(const [key,down] of events)globalThis.__keyboardFixture.stdout.write(JSON.stringify({key,down})+'\n');
    },events.map(([key,down])=>[map[key],down]));
  }
  await scenario('record physical left/right bindings, cancel capture, and preserve bindings on save failure', async()=>{
    await desktop.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});const win=BrowserWindow.getAllWindows().find(win=>win.getTitle()==='MatiQ Voice');win.show();win.focus();});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.locator('#record-toggle').click();await expect(page.locator('#binding-dialog')).toBeVisible();
    await keys([['MetaRight',true],['MetaRight',true]]);await expect(page.locator('#binding-live')).toContainText('Right');
    await expect(page.locator('#binding-save')).toBeDisabled();await keys([['MetaRight',false]]);await page.locator('#binding-save').click();await expect(page.locator('#binding-dialog')).not.toBeVisible();
    await page.locator('#record-hold').click();await keys([['AltRight',true],['AltRight',false]]);await page.locator('#binding-save').click();await expect(page.locator('#binding-hold')).toContainText('Right');
    await page.screenshot({path:path.join(fixtures,'physical-bindings.png'),fullPage:true});
    await page.locator('#record-toggle').click();await keys([['MetaLeft',true]]);await page.locator('#binding-cancel').click();await keys([['MetaLeft',false]]);
    assert.deepEqual((await page.evaluate(()=>window.matiqVoice.status())).settings.bindings,{toggle:['MetaRight'],hold:['AltRight']});
    await fs.mkdir(path.join(profile,'settings.json.tmp'));
    try{await page.locator('#clear-hold').click();await expect(page.locator('#notice')).toContainText('EISDIR');assert.deepEqual((await page.evaluate(()=>window.matiqVoice.status())).settings.bindings.hold,['AltRight']);}
    finally{await fs.rm(path.join(profile,'settings.json.tmp'),{recursive:true});}
    await page.getByRole('button',{name:'Dictation',exact:true}).click();
  });
  await scenario('hold release and toggle presses control background dictation without auto-repeat',async()=>{
    await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(win=>win.getTitle()==='MatiQ Voice').hide());
    await keys([['AltLeft',true],['AltLeft',false]]);assert.equal((await page.evaluate(()=>window.matiqVoice.status())).state,'idle');
    await keys([['AltRight',true]]);await expect(page.locator('#status')).toContainText('Listening');await keys([['AltRight',true]]);await expect(page.locator('#status')).toContainText('Listening');
    await expect.poll(()=>page.locator('#timer').textContent(),{timeout:10000}).not.toBe('0:00');await keys([['AltRight',false]]);
    await expect.poll(async()=>(await page.evaluate(()=>window.matiqVoice.status())).state,{timeout:60000}).toBe('idle');
    await keys([['MetaRight',true],['MetaRight',false]]);await expect(page.locator('#status')).toContainText('Listening');
    await keys([['MetaRight',true],['MetaRight',true],['MetaRight',false]]);await expect.poll(async()=>(await page.evaluate(()=>window.matiqVoice.status())).state,{timeout:60000}).toBe('idle');
    await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(win=>win.getTitle()==='MatiQ Voice').show());
  });
  await scenario('approved Solutions wordmark keeps Voice label and updater cannot restart during recording',async()=>{
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.locator('.brand img')).toHaveAttribute('alt','MatiQ Solutions');
    await expect(page.locator('.brand span')).toHaveText('Voice');
    assert.equal(await page.locator('.brand img').evaluate(img=>img.complete && img.naturalWidth===1374),true);
    if (!(await page.locator('#update-install').isVisible())) await page.locator('#update-check').click();
    await expect(page.locator('#update-install')).toBeVisible();
    await page.evaluate(async()=>{await window.matiqVoice.begin();await window.matiqVoice.recordingReady();});
    await expect(page.locator('#update-install')).toBeDisabled();
    const rejection=await page.evaluate(()=>window.matiqVoice.installUpdate().then(()=>'',error=>error.message));
    assert.match(rejection,/Finish dictation/);
    assert.equal(await desktop.evaluate(()=>Boolean(globalThis.__updateInstalled)),false);
    await page.evaluate(()=>window.matiqVoice.cancel());
    await expect(page.locator('#update-install')).toBeEnabled();
    await page.getByRole('button',{name:'Dictation',exact:true}).click();
  });
  await scenario('quick push-to-talk release during microphone startup never leaves recording running',async()=>{
    await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__restoreMicrophone=()=>{navigator.mediaDevices.getUserMedia=original;};navigator.mediaDevices.getUserMedia=async options=>{await new Promise(resolve=>setTimeout(resolve,400));return original(options);};});
    await keys([['AltRight',true],['AltRight',false]]);
    await expect(page.locator('#notice')).toContainText(/No audio captured|recognizer returned no words/,{timeout:15000});
    assert.equal((await page.evaluate(()=>window.matiqVoice.status())).state,'idle');await page.evaluate(()=>window.__restoreMicrophone());
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
    const before=modelRequests;
    await fs.unlink(familyStore.location({...speechAsset('base.en'),kind:'asr'}));
    await desktop.close(); desktop = null; page = await boot();
    assert.equal(modelRequests,before,'Restart must adopt existing verified Voice weights without network access.');
    assert.equal(await familyStore.verify({...speechAsset('base.en'),kind:'asr'}),true);
    assert.equal((await page.evaluate(()=>window.matiqVoice.status())).sharedModels.length,3); await expect(page.locator('#setup-dialog')).not.toBeVisible();
    assert.equal((await page.evaluate(() => window.matiqVoice.status())).connections.google.connected, true);
    assert.deepEqual((await page.evaluate(() => window.matiqVoice.status())).settings.bindings, {toggle:['MetaRight'],hold:['AltRight']});
    await page.getByRole('button', {name: 'Meetings', exact: true}).click(); await page.locator('.meeting-item').filter({hasText: 'English speaker E2E'}).click(); await expect(page.locator('#speaker-remote-0')).toHaveValue('Alex');
    await page.getByRole('button', {name: 'Notes', exact: true}).click(); await expect(page.locator('#personal-notes')).toHaveValue('E2E personal note retained locally.');
    await page.screenshot({path: path.join(fixtures, 'matiq-voice-e2e.png'), fullPage: true});
  });
  await scenario('disconnect removes protected local credentials', async () => {
    await page.getByRole('button', {name: 'Settings', exact: true}).click(); await page.locator('#connections button[data-provider="google"]').click(); await expect.poll(async () => (await page.evaluate(() => window.matiqVoice.status())).connections.google.connected).toBe(false); await assert.rejects(fs.access(path.join(profile, 'credentials', 'google.bin')));
  });
  await scenario('explicit update restart closes the window instead of hiding in the tray',async()=>{
    await page.evaluate(()=>window.matiqVoice.checkUpdates());
    await expect(page.locator('#update-install')).toBeEnabled();
    await page.evaluate(()=>window.matiqVoice.installUpdate());
    await expect.poll(()=>desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(win=>win.getTitle()==='MatiQ Voice'))).toBe(false);
    assert.equal(await desktop.evaluate(()=>globalThis.__updateInstalled),true);
  });
  assert.deepEqual(pageErrors, []);
  await fs.writeFile(path.join(fixtures, 'e2e-results.json'), JSON.stringify({result: 'passed', journeys: results, providers: 'Local fixtures', audio: 'Synthetic capture plus real English inference fixtures'}, null, 2));
  console.log(JSON.stringify({result: 'passed', journeys: results.length, scenarios: results, limitations: ['OAuth uses local fixture providers; real provider consent is not tested.', 'Microphone and system audio use synthetic devices, not a real Teams/Meet call.', 'Keyboard press/release events use an explicit helper-protocol fixture; native event-tap delivery and MacBook permissions require physical-key testing.', 'Actual English models, native inference, callback HTTP, OS-protected credential storage and persistence are exercised.']}, null, 2));
} catch (error) {
  if (desktop) { const page = desktop.windows().find(value => value.url().endsWith('/index.html')); if (page) { console.error('Visible failure:', await page.locator('#notice').textContent()); console.error('Setup failure:', await page.locator('#setup-error').textContent()); await page.screenshot({path: path.join(fixtures, 'e2e-failure.png'), fullPage: true}).catch(() => {}); } }
  console.error('E2E FAILED after', results.length, 'journeys:', error); process.exitCode = 1;
} finally {
  if (desktop) await desktop.close().catch(() => {});
  if (browser) await browser.close();
  if (browserServer) await browserServer.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  for(const owned of ownedDesktops) await lifecycle.verifyStopped(owned);
  await lifecycle.verifyStopped(ownedBrowser);
  if(fixturePort) {
    const net=require('node:net');
    await new Promise((resolve,reject)=>{const socket=net.connect(fixturePort,'127.0.0.1');socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();reject(new Error('The owned HTTP fixture port remains occupied. Inspect ownership before continuing.'));});socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve();else reject(error);});socket.once('timeout',()=>{socket.destroy();reject(new Error('Cannot verify fixture port cleanup.'));});});
  }
  clearTimeout(watchdog);
  await fs.rm(temporary, {recursive: true, force: true});
}

if (!process.exitCode) {
  await fs.writeFile(path.join(fixtures,'shared-models-results.json'),JSON.stringify({result:'passed',platform:process.platform,arch:process.arch,companionSource:'2a31fe6d3bc0afec6fe641ed5e53713a87c9edcc',sharedRootMatches:true,verifiedAssets:familyAssets.map(({file,sha256,bytes})=>({file,sha256,bytes})),offlineReuse:true,startupAdoption:true,nativeSpeechAndSpeakerInference:true},null,2));
}

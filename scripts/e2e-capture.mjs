import {_electron as electron} from 'playwright';
import {expect} from 'playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const lifecycle = require('./fixture-lifecycle.cjs');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-capture-'));
let app, owned;
try {
  for (const mode of ['normal', 'signal', 'stalled']) {
    const folder = path.join(temporary, mode); await fs.mkdir(folder);
    for (const file of ['capture.mjs', 'audio.mjs', 'recorder-worklet.js']) await fs.copyFile(path.join(root, 'src/ui', file), path.join(folder, file));
    if (mode === 'stalled') await fs.writeFile(path.join(folder, 'recorder-worklet.js'), "registerProcessor('matiq-recorder', class extends AudioWorkletProcessor { process() { return true; } });");
    await fs.writeFile(path.join(folder, 'index.html'), `<!doctype html><title>Capture clock fixture</title><script type="module">
      import {captureAudio, microphone} from './capture.mjs';
      globalThis.contexts = []; const NativeContext = AudioContext;
      globalThis.AudioContext = class extends NativeContext { constructor(options) { super(options); contexts.push(this); } };
      globalThis.progress = 0; globalThis.peak = 0; globalThis.failure = '';
      globalThis.start = async () => {
        try { globalThis.stream = await microphone();
          ${mode === 'signal' ? `globalThis.signalContext = new AudioContext({sampleRate:16000,sinkId:{type:'none'}}); const oscillator = signalContext.createOscillator(), destination = signalContext.createMediaStreamDestination(); oscillator.frequency.value = 440; oscillator.connect(destination); oscillator.start(); await signalContext.resume(); stream.getTracks().forEach(track=>track.stop()); stream = destination.stream;` : ''} globalThis.recording = await captureAudio(stream, {onLevel:(level, seconds) => { progress = seconds; peak = Math.max(peak, level); }}); }
        catch(error) { failure = error.message; }
      };
    </script>`);
  }
  await fs.writeFile(path.join(temporary, 'entry.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>{globalThis.openFixture=async filename=>{const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});await win.loadFile(filename);};globalThis.openFixture(${JSON.stringify(path.join(temporary, 'normal/index.html'))});});`);
  app = await electron.launch({executablePath: require('electron'), args: [path.join(temporary, 'entry.cjs'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']});
  owned = lifecycle.capture(app.process());
  for (const mode of ['normal', 'signal', 'stalled']) {
    const url = path.join(temporary, mode, 'index.html');
    if (mode !== 'normal') await app.evaluate((_, filename) => globalThis.openFixture(filename), url);
    await expect.poll(() => app.windows().some(page => page.url().includes('/' + mode + '/index.html'))).toBe(true);
    const page = app.windows().find(page => page.url().includes('/' + mode + '/index.html'));
    const session = await app.context().newCDPSession(page);
    // Playwright evaluate marks calls as user gestures; raw reads must not unlock audio.
    async function read(expression, awaitPromise = true) {
      const result = await session.send('Runtime.evaluate', {expression, awaitPromise, returnByValue: true, userGesture: false});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    }
    await expect.poll(() => read('typeof start')).toBe('function');
    expect(await read('navigator.userActivation.hasBeenActive')).toBe(false);
    await read('start()', false);
    if (mode !== 'stalled') {
      await expect.poll(() => read('progress'), {timeout: 10000}).toBeGreaterThan(1);
      if (mode === 'signal') expect(await read('peak')).toBeGreaterThan(0);
      const result = await read('(async()=>({seconds:recording.seconds,bytes:(await recording.stop()).byteLength}))()');
      expect(result.seconds).toBeGreaterThan(1); expect(result.bytes).toBeGreaterThan(32044);
      console.log('PASS: ' + mode + ' input advances capture and retains PCM without a user gesture or autoplay override.');
    } else {
      await expect.poll(() => read('failure'), {timeout: 8000}).toMatch(/audio.*start|microphone.*samples/i);
      expect(await read('Boolean(globalThis.recording)')).toBe(false);
      console.log('PASS: a worklet that never delivers samples cannot report capture ready.');
    }
    expect(await read('stream.getTracks().every(track=>track.readyState === "ended")')).toBe(true);
    if (mode === 'signal') await read('signalContext.close()');
    expect(await read('contexts.every(context=>context.state === "closed")')).toBe(true);
    expect(await read('navigator.userActivation.hasBeenActive')).toBe(false);
    await page.close();
  }
} finally {
  if (app) await app.close();
  await lifecycle.verifyStopped(owned);
  await fs.rm(temporary, {recursive: true, force: true});
}

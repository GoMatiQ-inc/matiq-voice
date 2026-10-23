import {_electron as electron} from 'playwright';
import {expect} from 'playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {encodeWav} from '../src/ui/audio.mjs';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, '.validation');
await require('./prepare-e2e.cjs').prepare(fixtures);
const executable = process.argv[2] || path.join(root, 'dist', process.platform === 'win32' ? 'win-unpacked' : process.arch === 'arm64' ? 'mac-arm64' : 'mac', ...(process.platform === 'win32' ? ['MatiQ Voice.exe'] : ['MatiQ Voice.app', 'Contents', 'MacOS', 'MatiQ Voice']));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-packaged-'));
let app;
function wavBytes(wav) {
  let offset = 12;
  while (wav.toString('ascii', offset, offset + 4) !== 'data') { const size = wav.readUInt32LE(offset + 4); offset += 8 + size + size % 2; }
  const pcm = wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
  return Array.from(new Uint8Array(encodeWav([Float32Array.from({length: pcm.length / 2}, (_, i) => pcm.readInt16LE(i * 2) / 32768)])));
}
try {
  await fs.mkdir(path.join(profile, 'models'));
  for (const file of ['ggml-base.en.bin', 'speaker-segmentation.onnx', 'speaker-embedding.onnx']) {
    try { await fs.link(path.join(fixtures, file), path.join(profile, 'models', file)); }
    catch (error) { if (error.code !== 'EXDEV') throw error; await fs.copyFile(path.join(fixtures, file), path.join(profile, 'models', file)); }
  }
  app = await electron.launch({executablePath: executable, args: [`--user-data-dir=${profile}`]});
  const actual = await app.evaluate(({app}) => ({profile: app.getPath('userData'), packaged: app.isPackaged}));
  assert.equal(actual.packaged, true); assert.equal(await fs.realpath(actual.profile), await fs.realpath(profile));
  await expect.poll(() => app.windows().some(page => page.url().endsWith('/index.html')), {timeout: 15000}).toBe(true);
  const page = app.windows().find(page => page.url().endsWith('/index.html'));
  await page.locator('#model option').first().waitFor({state: 'attached'});
  const speech = wavBytes(await fs.readFile(path.join(fixtures, 'jfk.wav')));
  await page.evaluate(async bytes => {
    const api = window.matiqVoice;
    await api.settings({model:'base.en', autoPaste:false, microphone:''});
    await api.microphoneTest(new Uint8Array(bytes)); await api.completeSetup();
    await api.begin(); await api.recordingReady(); await api.transcribe(new Uint8Array(bytes));
  }, speech);
  assert.match((await page.evaluate(() => window.matiqVoice.status())).lastTranscript, /ask not/i);
  const audio = wavBytes(await fs.readFile(path.join(fixtures, 'two-speakers-en.wav')));
  const meeting = await page.evaluate(async bytes => {
    const api = window.matiqVoice;
    const meeting = await api.beginMeeting({title:'Packaged native inference test', provider:'google'});
    await api.meetingReady(); await api.appendMeeting(meeting.id,'system',0,new Uint8Array(bytes)); await api.stopMeeting(meeting.id);
    return api.processMeeting(meeting.id);
  }, audio);
  assert.equal(meeting.status,'ready'); assert.ok(meeting.segments.length > 0);
  assert.ok(Object.keys(meeting.speakers).filter(id=>id.startsWith('remote-')).length >= 2);
  const result = {packaged:true, platform:process.platform, arch:process.arch, shortcutRegistered:(await page.evaluate(() => window.matiqVoice.status())).shortcutReady, checks:['isolated profile','bundled speech recognition','bundled ONNX speaker inference'], limitations:['Public audio fixtures; no real meeting or OS capture permissions tested.']};
  await fs.writeFile(path.join(fixtures,'packaged-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  if (app && app.process().exitCode === null) {
    const closed = app.waitForEvent('close', {timeout: 10000});
    await app.evaluate(({app}) => { setTimeout(() => app.quit(), 50); });
    await closed;
  }
  await fs.rm(profile,{recursive:true,force:true});
}

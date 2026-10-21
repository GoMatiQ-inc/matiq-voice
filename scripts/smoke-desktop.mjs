import {_electron as electron} from 'playwright';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, writeFile, readFile, link, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {encodeWav} from '../src/ui/audio.mjs';

// Optional: model path, WAV fixture path, screenshot destination.
// Chromium supplies synthetic audio, never the user's microphone. A separate
// known speech fixture verifies the real engine and application result path.
const [model, fixture, screenshot] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'verbatim-desktop-'));
let desktop;
try {
  const userData = path.join(temporary, 'data');
  await mkdir(path.join(userData, 'models'), {recursive: true});
  await writeFile(path.join(userData, 'settings.json'), JSON.stringify({model: 'base.en', autoPaste: false, microphone: ''}));
  if (model) await link(path.resolve(model), path.join(userData, 'models', 'ggml-base.en.bin'));
  const entry = path.join(temporary, 'bootstrap.cjs');
  await writeFile(entry, `require('electron').app.setPath('userData', ${JSON.stringify(userData)}); require(${JSON.stringify(path.join(root, 'src/main.cjs'))});`);
  desktop = await electron.launch({
    executablePath: createRequire(import.meta.url)('electron'), cwd: root,
    args: [entry, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#model option').first().waitFor({state: 'attached'});
  assert.equal(await page.title(), 'Verbatim');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.verbatim), 'object');
  assert.equal(await page.locator('#model option').count(), 3);
  await page.locator('#save').click();
  await page.getByText('Preferences saved.', {exact: true}).waitFor();
  if (model && fixture) {
    const cancelledStart = await page.evaluate(async () => {
      await Promise.allSettled([window.verbatim.begin(), window.verbatim.cancel()]);
      return window.verbatim.status();
    });
    assert.equal(cancelledStart.state, 'idle', 'Cancelling during setup must not leave recording stuck.');
    await page.locator('#record').click();
    await page.waitForFunction(() => document.querySelector('#timer').textContent === '0:02', null, {timeout: 10000});
    await page.locator('#record').click();
    await page.waitForFunction(() => !document.querySelector('#record').disabled && document.querySelector('#record').textContent === 'Start dictation', null, {timeout: 120000});
    const wav = await readFile(path.resolve(fixture));
    assert.equal(wav.readUInt32LE(24), 16000, 'Use a 16 kHz mono PCM16 fixture.');
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    let offset = 12;
    while (wav.toString('ascii', offset, offset + 4) !== 'data') {
      const size = wav.readUInt32LE(offset + 4);
      offset += 8 + size + size % 2;
    }
    const pcm = wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
    const samples = Float32Array.from({length: pcm.length / 2}, (_, i) => {
      const value = pcm.readInt16LE(i * 2); return value / (value < 0 ? 32768 : 32767);
    });
    const speech = Array.from(new Uint8Array(encodeWav([samples])));
    await page.evaluate(async bytes => {
      await window.verbatim.begin();
      await window.verbatim.recordingReady();
      await window.verbatim.transcribe(new Uint8Array(bytes));
    }, speech);
    await page.waitForFunction(() => document.querySelector('#transcript').value.toLowerCase().includes('ask not'), null, {timeout: 120000});
    const result = await page.locator('#transcript').inputValue();
    assert.match(result.toLowerCase(), /country/);
    console.log('Known speech fixture transcript:', result);
    if (screenshot) await page.screenshot({path: path.resolve(screenshot), fullPage: true});
    await page.locator('#copy').click();
    assert.equal(await desktop.evaluate(({clipboard}) => clipboard.readText()), result);
    await page.locator('#clear').click();
    await page.waitForFunction(() => document.querySelector('#transcript').value === '');
    assert.equal((await page.evaluate(() => window.verbatim.status())).lastTranscript, '');
    await page.locator('#record').click();
    await page.getByText('Listening. Your microphone is active.', {exact: true}).waitFor();
    await page.locator('#cancel').click();
    await page.getByText('Dictation cancelled.', {exact: true}).waitFor();
    assert.equal((await page.evaluate(() => window.verbatim.status())).state, 'idle');
  } else {
    assert.equal(await page.locator('#record').isDisabled(), true);
  }
  if (screenshot && !fixture) await page.screenshot({path: path.resolve(screenshot), fullPage: true});
  assert.deepEqual(errors, []);
  console.log('Desktop smoke passed: setup, isolation, settings' + (model && fixture ? ', synthetic microphone capture, known speech through real engine, copy, clear, cancel.' : '.'));
} finally {
  if (desktop) await desktop.close();
  await rm(temporary, {recursive: true, force: true});
}

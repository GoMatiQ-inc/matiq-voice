const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp, readdir, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {DEFAULT_SETTINGS, validateSettings, validateWav, whisperArgs, transcriptFromFile} = require('../src/core.cjs');
const {run, downloadModel} = require('../src/engine.cjs');

test('preserves fillers, repetitions, corrections, and spoken commands', () => {
  const words = ' Um, I I want seven, no, eight. New paragraph. Actually, uh, keep that.';
  assert.equal(transcriptFromFile(`${words}\n`), words.trim());
  assert.equal(transcriptFromFile('I want\r\nall of these words.\n'), 'I want all of these words.');
});

test('recognition arguments do not enable translation, VAD, prompts, or text filters', () => {
  const args = whisperArgs('/models/small.en.bin', '/audio.wav', '/result');
  for (const forbidden of ['--translate', '--vad', '--prompt', '--suppress-regex', '--suppress-nst', '--duration']) assert.ok(!args.includes(forbidden));
  assert.equal(args[args.indexOf('--max-context') + 1], '0');
});

test('accepts only known models and typed settings', () => {
  assert.deepEqual(validateSettings({model: 'small.en', autoPaste: false, microphone: 'device'}), {model: 'small.en', autoPaste: false, microphone: 'device', bindings: DEFAULT_SETTINGS.bindings});
  for (const model of ['../../other', '__proto__', 'constructor']) assert.throws(() => validateSettings({model, autoPaste: true, microphone: ''}));
  assert.throws(() => validateSettings({model: 'small.en', autoPaste: 'yes', microphone: ''}));
});

test('WAV preserves both ends, clipping, sample count, and capture order', async () => {
  const {encodeWav} = await import('../src/ui/audio.mjs');
  const wav = validateWav(encodeWav([new Float32Array([-1, -.5]), new Float32Array([0, .5, 1, 2])]));
  assert.equal(wav.readUInt32LE(40), 12);
  assert.deepEqual(Array.from({length: 6}, (_, i) => wav.readInt16LE(44 + i * 2)), [-32768, -16384, 0, 16383, 32767, 32767]);
});

test('rejects empty, truncated, wrong-rate, stereo, and oversized recordings', async () => {
  const {encodeWav} = await import('../src/ui/audio.mjs');
  assert.throws(() => validateWav(encodeWav([])));
  const valid = Buffer.from(encodeWav([new Float32Array(100)]));
  assert.throws(() => validateWav(valid.subarray(0, 50)));
  for (const [offset, value] of [[24, 48000], [22, 2], [34, 8]]) {
    const bad = Buffer.from(valid);
    if (offset === 24) bad.writeUInt32LE(value, offset); else bad.writeUInt16LE(value, offset);
    assert.throws(() => validateWav(bad));
  }
  assert.throws(() => validateWav(Buffer.alloc(44 + 16000 * 2 * 301)));
});

test('reports engine process crashes instead of returning fake success', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'process.stderr.write("model unavailable"); process.exit(7)']), /exited \(7\).*model unavailable/);
});

test('cancellation terminates a running engine process', async () => {
  const controller = new AbortController();
  const task = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {signal: controller.signal});
  controller.abort();
  await assert.rejects(task, error => error.name === 'AbortError');
});

test('incomplete model downloads cannot become installed models', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'verbatim-test-'));
  const original = global.fetch;
  global.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
  try {
    await assert.rejects(downloadModel('base.en', directory, () => {}), /verification failed/);
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(downloadModel('../escape', directory, () => {}), /listed speech model/);
  } finally { global.fetch = original; await rm(directory, {recursive: true, force: true}); }
});

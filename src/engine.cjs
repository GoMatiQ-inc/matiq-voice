const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {createWriteStream} = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {MODELS, whisperArgs, transcriptFromFile} = require('./core.cjs');

function run(executable, args, {signal, timeout = 600000} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {windowsHide: true, signal});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-64000); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-64000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${path.basename(executable)} exited (${code ?? 'terminated'}). ${stderr.slice(-1500) || 'Check permissions or retry with a smaller model.'}`));
    });
  });
}

async function downloadModel(id, directory, progress, signal) {
  if (!Object.hasOwn(MODELS, id)) throw new Error('Select a listed speech model.');
  const model = MODELS[id];
  await fs.mkdir(directory, {recursive: true});
  const destination = path.join(directory, `ggml-${id}.bin`);
  const partial = `${destination}.partial`;
  try {
    const response = await fetch(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`, {signal});
    if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Check your connection and retry.`);
    let received = 0, lastPercent = -1;
    const hash = createHash('sha256');
    const meter = new Transform({transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > model.bytes) return callback(new Error('Model download exceeds its expected size. Retry the download.'));
      hash.update(chunk);
      const percent = Math.floor(received / model.bytes * 100);
      if (percent !== lastPercent) { lastPercent = percent; progress(percent); }
      callback(null, chunk);
    }});
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, {mode: 0o600}), {signal});
    if (received !== model.bytes || hash.digest('hex') !== model.sha256) {
      throw new Error('Model verification failed. Download it again before recording.');
    }
    await fs.rename(partial, destination);
  } finally {
    await fs.rm(partial, {force: true});
  }
}

async function transcribe({binary, model, audio, directory, signal}) {
  const job = await fs.mkdtemp(path.join(directory, 'dictation-'));
  try {
    const recording = path.join(job, 'recording.wav');
    const output = path.join(job, 'transcript');
    await fs.writeFile(recording, audio, {mode: 0o600});
    await run(binary, whisperArgs(model, recording, output), {signal});
    return transcriptFromFile(await fs.readFile(`${output}.txt`, 'utf8'));
  } finally {
    await fs.rm(job, {recursive: true, force: true});
  }
}

module.exports = {run, downloadModel, transcribe};

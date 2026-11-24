const fs = require('node:fs/promises');
const {createReadStream, createWriteStream} = require('node:fs');
const {createHash} = require('node:crypto');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const path = require('node:path');

const SPEAKER_MODELS = Object.freeze([
  {file: 'speaker-segmentation.onnx', bytes: 5992913, sha256: '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx'},
  {file: 'speaker-embedding.onnx', bytes: 26485264, sha256: 'c4947caf150b8502fdd75bbe4089b971ab1ec42e90ee3ba547faca2cde44d9ee', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'}
]);
async function verifyAsset(filename, asset) {
  try {
    if ((await fs.stat(filename)).size !== asset.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    return hash.digest('hex') === asset.sha256;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function downloadAsset(asset, directory, progress, signal) {
  await fs.mkdir(directory, {recursive: true});
  const destination = path.join(directory, asset.file), partial = `${destination}.partial`;
  if (await verifyAsset(destination, asset)) { progress(100); return; }
  try {
    const disk = await fs.statfs(directory);
    if (Number(disk.bavail) * Number(disk.bsize) < asset.bytes + 2 * 1024 ** 3) throw new Error('Free disk space before downloading this model. Leave at least 2 GB available after installation.');
    const response = await fetch(asset.url, {signal});
    if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Check your connection and retry.`);
    let received = 0, last = -1; const hash = createHash('sha256');
    const meter = new Transform({transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > asset.bytes) return callback(new Error(`Model download exceeds the verified size for ${asset.file} (expected ${asset.bytes} bytes). The upstream file may have changed. Check for a Voice update and retry.`));
      hash.update(chunk);
      const percent = Math.floor(received / asset.bytes * 100);
      if (percent !== last) { last = percent; progress(percent); }
      callback(null, chunk);
    }});
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, {mode: 0o600}), {signal});
    if (received !== asset.bytes || hash.digest('hex') !== asset.sha256) throw new Error(`Model verification failed for ${asset.file}. Check for a Voice update and download again.`);
    await fs.rename(partial, destination);
  } finally { await fs.rm(partial, {force: true}); }
}
module.exports = {SPEAKER_MODELS, verifyAsset, downloadAsset};

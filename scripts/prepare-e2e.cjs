const fs = require('node:fs/promises');
const path = require('node:path');
const {MODELS} = require('../src/core.cjs');
const {SPEAKER_MODELS, downloadAsset} = require('../src/assets.cjs');
async function prepare(directory) {
  await fs.mkdir(directory, {recursive: true});
  const assets = [{...MODELS['base.en'], file: 'ggml-base.en.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'}, ...SPEAKER_MODELS];
  for (const asset of assets) await downloadAsset(asset, directory, () => {});
  for (const [file, url] of [
    ['jfk.wav', 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/d1be6fde11ac6e0407606b4e42fe72d34add8037/samples/jfk.wav'],
    ['two-speakers-en.wav', 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/1-two-speakers-en.wav']
  ]) {
    try { await fs.access(path.join(directory, file)); }
    catch { const response = await fetch(url); if (!response.ok) throw new Error(`Speech fixture download failed (${response.status}).`); await fs.writeFile(path.join(directory, file), Buffer.from(await response.arrayBuffer())); }
  }
  return assets;
}
module.exports = {prepare};

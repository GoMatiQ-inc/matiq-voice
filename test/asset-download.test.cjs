const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {sharedDownloadAsset} = require('../src/shared-models.cjs');

test('hosted model download rejects changed upstream bytes visibly, cleans up, and permits a verified retry', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-asset-download-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const data = Buffer.from('verified speaker model');
  const asset = {file: 'speaker-embedding.onnx', bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'), url: 'https://example.invalid/model'};
  const local = path.join(root, 'voice'), store = path.join(root, 'shared');
  const shared = path.join(store, 'speaker', asset.sha256, asset.file);
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let responseBytes = Buffer.concat([data, Buffer.from('!')]), requests = 0;
  global.fetch = async () => { requests++; return new Response(responseBytes); };
  await assert.rejects(sharedDownloadAsset(asset, local, () => {}, undefined, store), error => {
    assert.match(error.message, /speaker-embedding\.onnx/);
    assert.match(error.message, /verified size/);
    return true;
  });
  for (const file of [shared, shared + '.partial', shared + '.lock', path.join(local, asset.file)]) {
    await assert.rejects(fs.stat(file), {code: 'ENOENT'});
  }
  responseBytes = Buffer.alloc(data.length, 0);
  await assert.rejects(sharedDownloadAsset(asset, local, () => {}, undefined, store), /verification failed.*speaker-embedding\.onnx/);
  responseBytes = data;
  await sharedDownloadAsset(asset, local, () => {}, undefined, store);
  assert.deepEqual(await fs.readFile(path.join(local, asset.file)), data);
  assert.equal(requests, 3);
  await sharedDownloadAsset(asset, local, () => {}, undefined, store);
  assert.equal(requests, 3, 'An already verified model must not download again.');
});

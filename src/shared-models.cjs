const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {downloadAsset, verifyAsset} = require('./assets.cjs');
function sharedRoot(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'MatiQ', 'Models');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'MatiQ', 'Models');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'matiq', 'models');
}
async function sharedDownloadAsset(asset, directory, progress, signal, root = sharedRoot()) {
  if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !/^[A-Za-z0-9._-]+$/.test(asset.file)) throw new Error('Use a verified model catalog entry.');
  const kind = asset.file.startsWith('ggml-') ? 'asr' : 'speaker';
  const folder = path.join(root, kind, asset.sha256), shared = path.join(folder, asset.file), local = path.join(directory, asset.file);
  await fs.mkdir(folder, {recursive: true, mode: 0o700});
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  const lock = await fs.open(shared + '.lock', 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('Another MatiQ app is downloading this artifact. Wait for it to finish; inspect a stale lock before removing it.');
    throw error;
  });
  try {
    if (!await verifyAsset(shared, asset)) {
      if (await verifyAsset(local, asset)) {
        const staged = shared + '.adopt';
        try {
          try { await fs.link(local, staged); }
          catch (error) { if (error.code !== 'EXDEV' && error.code !== 'ENOTSUP') throw error; await fs.copyFile(local, staged, require('node:fs').constants.COPYFILE_EXCL); }
          await fs.rename(staged, shared);
        } finally { await fs.rm(staged, {force: true}); }
      } else await downloadAsset(asset, folder, progress, signal);
    }
    if (!await verifyAsset(shared, asset)) throw new Error('The shared model did not pass verification. Download again.');
    await fs.writeFile(shared + '.json', JSON.stringify({schema: 1, id: asset.file, kind, format: kind === 'asr' ? 'ggml' : 'onnx', sha256: asset.sha256, bytes: asset.bytes, license: 'See bundled Voice model notices'}) + '\n', {mode: 0o600});
    // Keep the existing worker paths. A hard link reuses bytes without requiring Windows symlink privileges.
    if (!await verifyAsset(local, asset)) {
      const temporary = local + '.shared-download';
      try {
        try { await fs.link(shared, temporary); }
        catch (error) { if (error.code !== 'EXDEV' && error.code !== 'ENOTSUP') throw error; await fs.copyFile(shared, temporary, require('node:fs').constants.COPYFILE_EXCL); }
        await fs.rename(temporary, local);
      } finally { await fs.rm(temporary, {force: true}); }
    }
    progress(100);
  } finally { await lock.close(); await fs.rm(shared + '.lock', {force: true}); }
}
module.exports = {sharedRoot, sharedDownloadAsset};

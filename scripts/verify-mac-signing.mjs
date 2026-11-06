import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, rm, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {verifyUpdateAssets} from './verify-update-assets.mjs';
const root = path.resolve(import.meta.dirname, '..');
const {version} = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'darwin') throw new Error('Verify Mac signatures on macOS.');
const team = process.env.APPLE_TEAM_ID;
assert.match(team || '', /^[A-Z0-9]{10}$/, 'Provide the expected Apple team for verification.');
const app = path.join(root, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'MatiQ Voice.app');
const artifact = `MatiQ-Voice-${version}-mac-${process.arch}.pkg`, pkg = path.join(root, 'dist', artifact);
function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 120000});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} rejected the signed release: ${result.stderr || result.stdout}`);
  return result.stdout + result.stderr;
}
for (const target of [app, ...['whisper-cli', 'mac-input', 'mac-keys'].map(name => path.join(app, 'Contents/Resources/engine', name))]) {
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', target]);
  const details = run('/usr/bin/codesign', ['--display', '--verbose=4', target]);
  assert.ok(details.includes(`TeamIdentifier=${team}`) && details.includes('Authority=Developer ID Application:'), 'App and native engines must have the expected Developer ID signature.');
  assert.match(details, /flags=.*runtime/, 'Enable Hardened Runtime for the app and native engines.');
}
const signature = run('/usr/sbin/pkgutil', ['--check-signature', pkg]);
assert.ok(signature.includes(process.env.CSC_INSTALLER_NAME || '\0'), 'PKG must carry the expected Developer ID Installer signature.');
run('/usr/bin/xcrun', ['stapler', 'validate', app]);
run('/usr/bin/xcrun', ['stapler', 'validate', pkg]);
run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
run('/usr/sbin/spctl', ['--assess', '--type', 'install', '--verbose=4', pkg]);
const zipName = `MatiQ-Voice-${version}-mac-${process.arch}.zip`;
const folder = path.join(root, 'dist');
await verifyUpdateAssets(folder, version, 'darwin');
const extracted = await mkdtemp(path.join(os.tmpdir(), 'matiq-update-signature-'));
try {
  run('/usr/bin/ditto', ['-x', '-k', path.join(folder, zipName), extracted]);
  assert.deepEqual(await readdir(extracted), ['MatiQ Voice.app']);
  const updateApp = path.join(extracted, 'MatiQ Voice.app');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', updateApp]);
  assert.ok(run('/usr/bin/codesign', ['--display', '--verbose=4', updateApp]).includes(`TeamIdentifier=${team}`));
  run('/usr/bin/xcrun', ['stapler', 'validate', updateApp]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', updateApp]);
} finally { await rm(extracted, {recursive: true, force: true}); }
const assets = {};
for (const name of [artifact, zipName, 'latest-mac.yml', ...(await readdir(folder)).filter(name => name === `${zipName}.blockmap`)]) {
  assets[name] = createHash('sha256').update(await readFile(path.join(folder, name))).digest('hex');
}
await writeFile(path.join(folder, 'mac-signature.json'), JSON.stringify({platform: 'darwin', version, artifact, sha256: assets[artifact], assets, signed: true, notarized: true, stapled: true, team, checks: ['Developer ID app and native engines', 'Installer signature', 'stapled tickets', 'Gatekeeper app and installer assessment', 'extracted update ZIP signature and notarization', 'update metadata SHA512 and size']}, null, 2));
console.log('Mac installer and extracted update ZIP pass signatures, notarization and Gatekeeper; update metadata matches exact ZIP bytes.');

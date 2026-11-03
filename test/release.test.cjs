const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const version = '0.3.4-preview.1', tag = `v${version}`;
async function fixture(run, fixtureVersion = version) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-release-'));
  const names = [`MatiQ-Voice-${fixtureVersion}-mac-arm64.pkg`, `MatiQ-Voice-${fixtureVersion}-windows-x64.exe`];
  try {
    for (const name of names) await fs.writeFile(path.join(directory, name), Buffer.alloc(1024 * 1024, 7));
    await run(directory, names, (await import('../scripts/prepare-release.mjs')).prepareRelease);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
}
test('preview release contains exact installer checksums and visible signing limits', () => fixture(async (directory, names, prepareRelease) => {
  assert.deepEqual(await prepareRelease({version, tag, directory}), names);
  const digest = createHash('sha256').update(Buffer.alloc(1024 * 1024, 7)).digest('hex');
  assert.equal(await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'), names.map(name => `${digest}  ${name}\n`).join(''));
  const notes = await fs.readFile(path.join(directory, 'RELEASE_NOTES.md'), 'utf8');
  assert.match(notes, /not Apple-notarized/); assert.match(notes, /Windows is unsigned/);
}));
test('release rejects mismatched version tag', () => fixture(async (directory, names, prepareRelease) => {
  await assert.rejects(prepareRelease({version, tag:'v0.3.5-preview.1', directory}), /must match/);
}));
test('unsigned publisher refuses stable releases', () => fixture(async (directory, names, prepareRelease) => {
  await assert.rejects(prepareRelease({version:'0.3.4', tag:'v0.3.4', directory}), /require verified signed/);
}));
test('release refuses missing Windows installer', () => fixture(async (directory, names, prepareRelease) => {
  await fs.unlink(path.join(directory, names[1]));
  await assert.rejects(prepareRelease({version, tag, directory}), /exactly/);
}));
test('release refuses debug files alongside installers', () => fixture(async (directory, names, prepareRelease) => {
  await fs.writeFile(path.join(directory, 'profile.json'), '{}');
  await assert.rejects(prepareRelease({version, tag, directory}), /Do not publish/);
}));
test('release refuses empty installer placeholders', () => fixture(async (directory, names, prepareRelease) => {
  await fs.writeFile(path.join(directory, names[0]), '');
  await assert.rejects(prepareRelease({version, tag, directory}), /unexpectedly small/);
}));

async function proofs(directory, names) {
  const digest = createHash('sha256').update(Buffer.alloc(1024 * 1024, 7)).digest('hex');
  for (const [index, name] of names.entries()) await fs.writeFile(path.join(directory, index === 0 ? 'mac-signature.json' : 'windows-signature.json'), JSON.stringify({platform: index === 0 ? 'darwin' : 'win32', version: '0.3.4', artifact: name, sha256: digest, signed: true, notarized: true, stapled: true, team: 'TESTTEAM01', timestamped: true, publisher: 'Fixture Publisher'}));
}
test('stable release accepts matching native signature and notarization reports', () => fixture(async (directory, names, prepareRelease) => {
  await proofs(directory, names);
  await prepareRelease({version:'0.3.4', tag:'v0.3.4', directory, signed:true});
  assert.match(await fs.readFile(path.join(directory, 'RELEASE_NOTES.md'), 'utf8'), /passing Gatekeeper assessments/);
}, '0.3.4'));
test('stable release refuses verification for different installer bytes', () => fixture(async (directory, names, prepareRelease) => {
  await proofs(directory, names); await fs.writeFile(path.join(directory, names[0]), Buffer.alloc(1024 * 1024, 9));
  await assert.rejects(prepareRelease({version:'0.3.4', tag:'v0.3.4', directory, signed:true}), /does not cover/);
}, '0.3.4'));
test('stable release refuses missing Apple notarization evidence', () => fixture(async (directory, names, prepareRelease) => {
  await proofs(directory, names); const file = path.join(directory, 'mac-signature.json');
  const proof = JSON.parse(await fs.readFile(file, 'utf8')); proof.notarized = false; await fs.writeFile(file, JSON.stringify(proof));
  await assert.rejects(prepareRelease({version:'0.3.4', tag:'v0.3.4', directory, signed:true}), /does not cover/);
}, '0.3.4'));

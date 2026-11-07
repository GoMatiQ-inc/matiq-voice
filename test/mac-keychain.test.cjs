const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {withMacKeychain} = require('../scripts/mac-keychain.cjs');
function fixture(failImport = false) {
  const env = {CSC_LINK: Buffer.from('fixture application').toString('base64'), CSC_INSTALLER_LINK: Buffer.from('fixture installer').toString('base64'), CSC_KEY_PASSWORD:'fixture-app-password', CSC_INSTALLER_KEY_PASSWORD:'fixture-installer-password'};
  const commands = [];
  const run = args => {
    commands.push(args);
    if (args[0] === 'list-keychains' && !args.includes('-s')) return '"/fixture/login.keychain-db"\n';
    if (args[0] === 'create-keychain') fs.writeFileSync(args.at(-1), 'fixture keychain');
    if (failImport && args[0] === 'import') throw new Error('fixture import failed');
    return '';
  };
  return {env, commands, run};
}
test('Mac key ACL uses the keychain password and restores state after a signing failure', async () => {
  const {env, commands, run} = fixture(), saved = {...env}; let directory;
  await assert.rejects(withMacKeychain(env, async () => {
    directory = path.dirname(env.CSC_KEYCHAIN); assert.equal(env.CSC_LINK, undefined); assert.equal(env.CSC_INSTALLER_LINK, undefined);
    throw new Error('fixture signing failed');
  }, {run}), /fixture signing failed/);
  const created = commands.find(args => args[0] === 'create-keychain');
  const acl = commands.find(args => args[0] === 'set-key-partition-list');
  assert.equal(acl[acl.indexOf('-k') + 1], created[2]);
  assert.notEqual(created[2], saved.CSC_KEY_PASSWORD); assert.notEqual(created[2], saved.CSC_INSTALLER_KEY_PASSWORD);
  assert.deepEqual(env, saved); assert.equal(fs.existsSync(directory), false);
  assert.ok(commands.some(args => args[0] === 'delete-keychain'));
  assert.deepEqual(commands.filter(args => args[0] === 'list-keychains').at(-1), ['list-keychains', '-d', 'user', '-s', '/fixture/login.keychain-db']);
});
test('keychain remains available until an asynchronous signing operation finishes', async () => {
  const {env, run} = fixture(), saved = {...env}; let keychain;
  const result = await withMacKeychain(env, async () => {
    keychain = env.CSC_KEYCHAIN; await new Promise(resolve => setImmediate(resolve));
    assert.ok(fs.existsSync(keychain)); return 'signed';
  }, {run});
  assert.equal(result, 'signed'); assert.equal(fs.existsSync(path.dirname(keychain)), false); assert.deepEqual(env, saved);
});
test('failed certificate import still removes temporary credential files and keychain', async () => {
  const {env, commands, run} = fixture(true), saved = {...env};
  await assert.rejects(withMacKeychain(env, () => assert.fail('Do not build after failed import.'), {run}), /fixture import failed/);
  assert.deepEqual(env, saved); const created = commands.find(args => args[0] === 'create-keychain');
  assert.equal(fs.existsSync(path.dirname(created.at(-1))), false);
  assert.ok(commands.some(args => args[0] === 'delete-keychain'));
});
test('packager rejection exits nonzero even when an SDK exit hook resets exitCode', () => {
  const source = `
    Object.defineProperty(process, 'platform', {value:'darwin'});
    Object.assign(process.env, {CSC_NAME:'Developer ID Application: Fixture', CSC_INSTALLER_NAME:'Developer ID Installer: Fixture', APPLE_ID:'fixture@example.test', APPLE_APP_SPECIFIC_PASSWORD:'fixture-password', APPLE_TEAM_ID:'TESTTEAM01'});
    const Module = require('node:module'), load = Module._load, fs = require('node:fs');
    Module._load = function(name) {
      if (name === 'node:fs') return {...fs, existsSync: () => true, readFileSync: (filename, ...args) => String(filename).endsWith('config/oauth.json') ? JSON.stringify({microsoft:{clientId:'00000000-0000-0000-0000-000000000001'},google:{clientId:'fixture.apps.googleusercontent.com'}}) : fs.readFileSync(filename, ...args)};
      if (name === './mac-keychain.cjs') return {withMacKeychain: (env, operation) => operation()};
      if (name === '@matiq-solutions/sdk/notary-profile.cjs') return {withNotaryProfile: (env, operation) => operation()};
      if (name === 'electron-builder') return {build: async () => { throw new Error('fixture signing failed'); }};
      return load.apply(this, arguments);
    };
    process.on('beforeExit', () => { process.exitCode = 0; });
    require(${JSON.stringify(path.resolve(__dirname, '../scripts/release.cjs'))});
  `;
  const child = spawnSync(process.execPath, ['-e', source], {encoding:'utf8', timeout:10000});
  assert.equal(child.status, 1); assert.match(child.stderr, /fixture signing failed/);
});

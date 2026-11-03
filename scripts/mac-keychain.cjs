const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {spawnSync} = require('node:child_process');

async function withMacKeychain(env, operation, {run} = {}) {
  if (!env.CSC_LINK && !env.CSC_INSTALLER_LINK) return operation();
  if (!env.CSC_LINK || !env.CSC_INSTALLER_LINK) throw new Error('Provide both encrypted P12 bundles, or pre-import both identities into one signing keychain.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-voice-signing-'));
  const keychain = path.join(directory, 'release.keychain-db');
  const password = randomBytes(32).toString('hex');
  const saved = Object.fromEntries(['CSC_LINK', 'CSC_INSTALLER_LINK', 'CSC_KEYCHAIN'].map(name => [name, env[name]]));
  const privateValues = [password, env.CSC_KEY_PASSWORD, env.CSC_INSTALLER_KEY_PASSWORD, ...Object.values(saved)].filter(Boolean);
  const execute = run || (args => {
    const result = spawnSync('/usr/bin/security', args, {encoding: 'utf8', timeout: 30000});
    if (result.error || result.status !== 0) {
      let detail = result.stderr || result.error?.message || `exit ${result.status}`;
      for (const value of privateValues) detail = detail.replaceAll(value, '[redacted]');
      throw new Error(`Mac signing keychain ${args[0]} failed: ${detail}`);
    }
    return result.stdout;
  });
  let original;
  try {
    original = [...execute(['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)].map(match => match[1]);
    execute(['create-keychain', '-p', password, keychain]);
    execute(['unlock-keychain', '-p', password, keychain]);
    execute(['set-keychain-settings', '-lut', '3600', keychain]);
    for (const [name, link, certificatePassword] of [['application', saved.CSC_LINK, env.CSC_KEY_PASSWORD], ['installer', saved.CSC_INSTALLER_LINK, env.CSC_INSTALLER_KEY_PASSWORD]]) {
      const filename = path.join(directory, `${name}.p12`);
      await fs.writeFile(filename, Buffer.from(link, 'base64'), {mode: 0o600});
      execute(['import', filename, '-k', keychain, '-P', certificatePassword || '', '-T', '/usr/bin/codesign', '-T', '/usr/bin/productbuild']);
    }
    execute(['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain]);
    execute(['list-keychains', '-d', 'user', '-s', keychain, ...original]);
    delete env.CSC_LINK; delete env.CSC_INSTALLER_LINK; env.CSC_KEYCHAIN = keychain;
    return await operation();
  } finally {
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete env[name]; else env[name] = value; }
    try { if (original) execute(['list-keychains', '-d', 'user', '-s', ...original]); }
    finally {
      try { if (await fs.stat(keychain).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) execute(['delete-keychain', keychain]); }
      finally { await fs.rm(directory, {recursive: true, force: true}); }
    }
  }
}
module.exports = {withMacKeychain};

const {withNotaryProfile} = require("@matiq-solutions/sdk/notary-profile.cjs");
const fs = require('node:fs');
const path = require('node:path');
const {signingConfig} = require('./signing-config.cjs');
const {withMacKeychain} = require('./mac-keychain.cjs');
const directory = path.join(__dirname, '..');
async function main() {
  const configFile = path.join(directory, 'config/oauth.json');
  if (!fs.existsSync(configFile)) throw new Error('Configure both real OAuth registrations with npm run oauth:configure before a customer release.');
  const oauth = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const signing = signingConfig(process.platform, process.env, oauth);
  const base = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).build;
  const config = {...base, ...signing};
  delete config.publish; // electron-builder retains the package GitHub provider when merging overrides.
  for (const platform of ['mac', 'pkg', 'win']) if (signing[platform]) config[platform] = {...base[platform], ...signing[platform]};
  const build = () => require('electron-builder').build({projectDir: directory, config, publish: 'never'});
  if (process.platform === 'darwin') await withMacKeychain(process.env, () => withNotaryProfile(process.env, build));
  else await build();
}
main().catch(error => { console.error(error.message); process.exit(1); });

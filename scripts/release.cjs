const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const directory = path.join(__dirname, '..');
const configFile = path.join(directory, 'config/oauth.json');
if (!fs.existsSync(configFile)) throw new Error('Configure both real OAuth registrations with npm run oauth:configure before a customer release.');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (!/^[0-9a-f-]{36}$/i.test(config.microsoft?.clientId || '') || !/\.apps\.googleusercontent\.com$/.test(config.google?.clientId || '')) throw new Error('Provide real Microsoft and Google public client registrations; test clients cannot be released.');
const args = [require.resolve('electron-builder/cli.js'), '--publish', 'never', '--config.forceCodeSigning=true'];
if (process.platform === 'darwin') {
  if (!process.env.CSC_NAME) throw new Error('Provide the Developer ID signing identity in CSC_NAME before a customer release.');
  if (!(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) && !(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)) throw new Error('Configure Apple notarization credentials before a customer release.');
  args.push(`--config.mac.identity=${process.env.CSC_NAME}`);
} else if (process.platform === 'win32') {
  if (!process.env.WIN_CSC_LINK && !process.env.CSC_LINK) throw new Error('Provide the Windows signing certificate before a customer release.');
} else throw new Error('Build customer releases on supported macOS or Windows hosts.');
const result = spawnSync(process.execPath, args, {cwd: directory, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

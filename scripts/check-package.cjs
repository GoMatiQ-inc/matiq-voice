const fs = require('node:fs');
const path = require('node:path');
module.exports = async context => {
  const directory = path.join(context.packager.projectDir, 'engine');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'build.json'), 'utf8'));
  const platform = context.electronPlatformName;
  const arch = require('builder-util').Arch[context.arch];
  if (metadata.platform !== platform || metadata.arch !== arch) {
    throw new Error(`Engine is ${metadata.platform}/${metadata.arch}, but app is ${platform}/${arch}. Build the engine on the matching runner first.`);
  }
  for (const filename of [platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli', 'WHISPER-LICENSE', ...(platform === 'darwin' ? ['mac-input'] : [])]) {
    if (!fs.existsSync(path.join(directory, filename))) throw new Error(`Missing ${filename}. Run npm run engine:build before packaging.`);
  }
};

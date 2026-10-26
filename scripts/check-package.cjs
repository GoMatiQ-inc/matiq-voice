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
  if (metadata.nativeInputVersion !== 4) throw new Error('Rebuild the native input helper before packaging.');
  const nativePackage = `sherpa-onnx-${platform === 'win32' ? 'win' : platform}-${arch}`;
  const nativeRoot = path.dirname(require.resolve(`${nativePackage}/package.json`));
  if (!fs.readdirSync(nativeRoot, {recursive: true}).some(file => String(file).endsWith('.node'))) throw new Error(`Missing ${nativePackage} inference addon. Reinstall dependencies on the matching runner.`);
  for (const filename of [platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli', 'WHISPER-LICENSE', ...(platform === 'darwin' ? ['mac-input','mac-keys'] : [])]) {
    if (!fs.existsSync(path.join(directory, filename))) throw new Error(`Missing ${filename}. Run npm run engine:build before packaging.`);
  }
};

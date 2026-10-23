const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const {MODELS} = require('./core.cjs');
const GiB = 1024 ** 3;

function recommendModel({memoryBytes, cores, platform, arch}) {
  if (!['darwin', 'win32'].includes(platform)) throw new Error('MatiQ Voice requires macOS or Windows.');
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Install MatiQ Voice on a 64-bit supported computer.');
  if (memoryBytes < 4 * GiB) throw new Error('At least 4 GB of memory is required for local recognition.');
  const model = memoryBytes >= 24 * GiB && cores >= 8 ? 'medium.en' : memoryBytes >= 8 * GiB && cores >= 4 ? 'small.en' : 'base.en';
  return {model, reason: model === 'medium.en' ? 'Your memory and CPU allow the larger English model. It uses more time and energy.' : model === 'small.en' ? 'A balanced English model for this computer’s memory and CPU.' : 'The smaller English model leaves more memory available on this computer.',
    requiredFreeBytes: MODELS[model].bytes * 2 + 2 * GiB,
    performanceNote: 'Hardware-based recommendation; speed and accuracy must be checked on your speech.'};
}

async function inspectHardware(directory, engineDir) {
  const hardware = {platform: process.platform, arch: process.arch, osVersion: os.release(),
    memoryBytes: os.totalmem(), cores: os.availableParallelism(), cpu: os.cpus()[0]?.model || 'Unknown CPU'};
  const recommendation = recommendModel(hardware);
  const disk = await fs.statfs(directory);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  let engine = null;
  try { engine = JSON.parse(await fs.readFile(path.join(engineDir, 'build.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('The speech engine manifest is damaged. Reinstall MatiQ Voice.'); }
  const [major, minor] = os.release().split('.').map(Number);
  const supportedOS = process.platform === 'win32' ? major >= 10 : major > 23 || (major === 23 && minor >= 2);
  const engineCompatible = Boolean(engine && engine.platform === process.platform && engine.arch === process.arch);
  return {...hardware, freeBytes, recommendation, supportedOS, engineCompatible,
    issues: [!supportedOS && 'Install on macOS 14.2+ or Windows 10+.', !engineCompatible && 'The bundled engine does not match this computer. Install the matching MatiQ Voice package.', freeBytes < recommendation.requiredFreeBytes && 'Free more disk space before downloading the recommended model.'].filter(Boolean)};
}

module.exports = {GiB, recommendModel, inspectHardware};

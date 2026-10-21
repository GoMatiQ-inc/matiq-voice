const MODELS = Object.freeze({
  'base.en': {label: 'Base English · 148 MB · faster', bytes: 147964211, sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002'},
  'small.en': {label: 'Small English · 488 MB · balanced', bytes: 487614201, sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d'},
  'medium.en': {label: 'Medium English · 1.53 GB · more demanding', bytes: 1533774781, sha256: 'cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356'}
});
const MAX_SECONDS = 300;
const DEFAULT_SETTINGS = Object.freeze({model: 'small.en', autoPaste: true, microphone: ''});

function validateSettings(value) {
  if (!value || !Object.hasOwn(MODELS, value.model) || typeof value.autoPaste !== 'boolean' ||
      typeof value.microphone !== 'string' || value.microphone.length > 512) {
    throw new Error('Invalid settings. Choose a listed model and microphone.');
  }
  return {model: value.model, autoPaste: value.autoPaste, microphone: value.microphone};
}

function validateWav(input) {
  const wav = Buffer.from(input);
  if (wav.length < 46 || wav.length > 44 + 16000 * 2 * MAX_SECONDS ||
      wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' ||
      wav.toString('ascii', 12, 16) !== 'fmt ' || wav.readUInt32LE(16) !== 16 ||
      wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 ||
      wav.readUInt32LE(24) !== 16000 || wav.readUInt32LE(28) !== 32000 ||
      wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16 ||
      wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt32LE(40) !== wav.length - 44 ||
      wav.readUInt32LE(4) !== wav.length - 8 || (wav.length - 44) % 2 !== 0) {
    throw new Error('Recording is invalid or exceeds five minutes. Record a shorter dictation.');
  }
  return wav;
}

function whisperArgs(modelPath, audioPath, outputPath) {
  // No prompt, translation, VAD trimming, regex suppression, or rewriting stage.
  return ['--model', modelPath, '--file', audioPath, '--language', 'en',
    '--output-txt', '--output-file', outputPath, '--no-timestamps', '--max-context', '0'];
}

function transcriptFromFile(text) {
  // whisper-cli adds a newline after each decoded segment. Only normalize its
  // segment boundaries and outer whitespace; never remove or replace words.
  return text.replace(/\r?\n/g, ' ').trim();
}

module.exports = {MODELS, MAX_SECONDS, DEFAULT_SETTINGS, validateSettings, validateWav, whisperArgs, transcriptFromFile};

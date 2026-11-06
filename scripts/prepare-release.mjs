import {readFile, readdir, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyUpdateAssets} from './verify-update-assets.mjs';

export async function prepareRelease({version, tag, directory, signed = false}) {
  const preview = /^\d+\.\d+\.\d+-preview\.\d+$/.test(version);
  if (tag !== `v${version}` || (!preview && (!signed || !/^\d+\.\d+\.\d+$/.test(version)))) throw new Error('Release tag must match package.json. Stable releases require verified signed packages; unsigned preview tags use vX.Y.Z-preview.N.');
  const names = [`MatiQ-Voice-${version}-mac-arm64.pkg`, `MatiQ-Voice-${version}-windows-x64.exe`];
  const reports = signed ? ['mac-signature.json', 'windows-signature.json'] : [];
  const updates = signed ? [`MatiQ-Voice-${version}-mac-arm64.zip`, 'latest-mac.yml', 'latest.yml'] : [];
  const optional = signed ? [`MatiQ-Voice-${version}-mac-arm64.zip.blockmap`, `MatiQ-Voice-${version}-windows-x64.exe.blockmap`] : [];
  const expected = [...names, ...reports, ...updates];
  const files = await readdir(directory);
  if (expected.some(file => !files.includes(file)) || files.some(file => !expected.includes(file) && !optional.includes(file))) throw new Error('Provide exactly the tested Mac arm64 PKG and Windows x64 EXE, plus native verification reports for signed releases. Do not publish debug profiles, logs or other files.');
  const checksums = [];
  for (const name of names) {
    const filename = path.join(directory, name), metadata = await stat(filename);
    if (!metadata.isFile() || metadata.size < 1024 * 1024) throw new Error(`Installer ${name} is missing or unexpectedly small. Check both build jobs.`);
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    if (signed) {
      const mac = name.endsWith('.pkg');
      const proof = JSON.parse(await readFile(path.join(directory, mac ? 'mac-signature.json' : 'windows-signature.json'), 'utf8'));
      if (proof.version !== version || proof.artifact !== name || proof.sha256 !== digest || proof.signed !== true || proof.platform !== (mac ? 'darwin' : 'win32') || (mac ? proof.notarized !== true || proof.stapled !== true || !proof.team : proof.timestamped !== true || !proof.publisher)) throw new Error(`Signed release verification does not cover ${name}. Re-run native signature verification; do not reuse stale reports.`);
    }
    checksums.push(`${digest}  ${name}`);
  }
  if (signed) {
    await verifyUpdateAssets(directory, version, 'darwin');
    await verifyUpdateAssets(directory, version, 'win32');
    const macProof = JSON.parse(await readFile(path.join(directory, 'mac-signature.json'), 'utf8'));
    for (const name of [...updates, ...files.filter(file => optional.includes(file))]) {
      const digest = createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex');
      if ((name.includes('-mac-') || name === 'latest-mac.yml') && macProof.assets?.[name] !== digest) throw new Error(`Signed release verification does not cover ${name}.`);
      checksums.push(`${digest}  ${name}`);
    }
  }
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  await writeFile(path.join(directory, 'RELEASE_NOTES.md'), `# MatiQ Voice ${version}${preview ? ' — preview' : ''}

Free local English dictation and meeting notes by [MatiQ Inc](https://matiqinc.com).
Download an installer below; GitHub's automatic source-code ZIP/TAR files are for developers.

- **Apple Silicon Mac (M1 or newer):** ${names[0]} — macOS 14.2 or newer.
- **Windows Intel/AMD 64-bit:** ${names[1]} — Windows 10 or newer.
- Intel Mac and native Windows ARM installers are not included in this preview.

${signed ? '**Signing status:** the Mac application and PKG have verified Developer ID signatures, Apple notarization tickets, and passing Gatekeeper assessments. The Windows app, native libraries and installer have verified company Authenticode signatures with timestamps. Windows SmartScreen reputation is separate and can still warn about a newly signed app. Managed-device policy and normal microphone, Accessibility or administrator prompts still apply.' : '**Signing status:** the Mac app is ad-hoc signed, its PKG is unsigned and it is not Apple-notarized. Windows is unsigned. OS warnings are expected; these are preview downloads, not trusted production installers.'} Read the [installation instructions](https://github.com/GoMatiQ-inc/matiq-voice#download-and-install). Do not disable operating-system security protections globally.

Quit MatiQ Voice before upgrading. Setup downloads and verifies local speech models and walks through microphone and paste/keyboard permissions. No compiler, Node, Python or developer account is required to run the installed app. Allow several GB for models and installation.

Features include left/right physical key bindings, toggle and push-to-talk modes, background operation, original-field insertion, and explicit local user-attended meeting recording with editable speaker labels. Recognition can still make mistakes. Calendar sign-in and live meeting capture retain the limits in [VALIDATION.md](https://github.com/GoMatiQ-inc/matiq-voice/blob/${tag}/docs/VALIDATION.md); this is not a meeting-joining bot.

Unit tests, E2E, packaging and packaged native inference pass on both build platforms before publication; Mac installer payload checks also pass. SHA256SUMS.txt covers these exact downloads; checksums do not replace code signing.

Free for personal and internal business use under the [MatiQ Voice No-Sale License](https://github.com/GoMatiQ-inc/matiq-voice/blob/${tag}/LICENSE). Preserve attribution. Paid access, hosting and paid bundles require separate permission. Third-party licenses remain intact.
`);
  return [...names, ...updates, ...files.filter(file => optional.includes(file))];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const {version} = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await prepareRelease({version, tag: process.env.GITHUB_REF_NAME, directory: path.resolve(process.argv[2] || 'release-assets'), signed: process.env.MATIQ_RELEASE_SIGNED === '1'});
}

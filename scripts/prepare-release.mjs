import {readFile, readdir, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function prepareRelease({version, tag, directory}) {
  if (!/^\d+\.\d+\.\d+-preview\.\d+$/.test(version) || tag !== `v${version}`) throw new Error('Preview tag must match package.json version, for example v0.3.4-preview.1. Production releases require the separate signed release command.');
  const names = [`MatiQ-Voice-${version}-mac-arm64.pkg`, `MatiQ-Voice-${version}-windows-x64.exe`];
  const files = await readdir(directory);
  if (files.length !== names.length || files.some(file => !names.includes(file))) throw new Error('Provide exactly the tested Mac arm64 PKG and Windows x64 EXE. Do not publish debug profiles, logs or other files.');
  const checksums = [];
  for (const name of names) {
    const filename = path.join(directory, name), metadata = await stat(filename);
    if (!metadata.isFile() || metadata.size < 1024 * 1024) throw new Error(`Installer ${name} is missing or unexpectedly small. Check both build jobs.`);
    checksums.push(`${createHash('sha256').update(await readFile(filename)).digest('hex')}  ${name}`);
  }
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  await writeFile(path.join(directory, 'RELEASE_NOTES.md'), `# MatiQ Voice ${version} — preview

Free local English dictation and meeting notes by [MatiQ Inc](https://matiqinc.com).
Download an installer below; GitHub's automatic source-code ZIP/TAR files are for developers.

- **Apple Silicon Mac (M1 or newer):** ${names[0]} — macOS 14.2 or newer.
- **Windows Intel/AMD 64-bit:** ${names[1]} — Windows 10 or newer.
- Intel Mac and native Windows ARM installers are not included in this preview.

**Signing status:** the Mac application is ad-hoc signed, its PKG is unsigned and it is not Apple-notarized. Windows is unsigned. Your operating system may block or warn about these downloads; managed devices may prohibit them. These are not trusted production installers. Read the [installation instructions](https://github.com/GoMatiQ-inc/matiq-voice#download-and-install). Do not disable operating-system security protections globally.

Quit MatiQ Voice before upgrading. Setup downloads and verifies local speech models and walks through microphone and paste/keyboard permissions. No compiler, Node, Python or developer account is required to run the installed app. Allow several GB for models and installation.

Features include left/right physical key bindings, toggle and push-to-talk modes, background operation, original-field insertion, and explicit local user-attended meeting recording with editable speaker labels. Recognition can still make mistakes. Calendar sign-in and live meeting capture retain the limits in [VALIDATION.md](https://github.com/GoMatiQ-inc/matiq-voice/blob/${tag}/docs/VALIDATION.md); this is not a meeting-joining bot.

Unit tests, E2E, packaging and packaged native inference pass on both build platforms before publication; Mac installer payload checks also pass. SHA256SUMS.txt covers these exact downloads; checksums do not replace code signing.

Free for personal and internal business use under the [MatiQ Voice No-Sale License](https://github.com/GoMatiQ-inc/matiq-voice/blob/${tag}/LICENSE). Preserve attribution. Paid access, hosting and paid bundles require separate permission. Third-party licenses remain intact.
`);
  return names;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const {version} = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await prepareRelease({version, tag: process.env.GITHUB_REF_NAME, directory: path.resolve(process.argv[2] || 'release-assets')});
}

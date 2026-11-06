# MatiQ Voice — Free Local Dictation for Mac and Windows

**MatiQ Voice** is a free English speech-to-text and meeting-notes app by
[MatiQ Inc](https://matiqinc.com). Dictate into the text field you are using,
choose your own toggle or push-to-talk shortcut, and run speech recognition
locally on your computer. No transcription subscription or cloud speech service
is required. Personal and internal company use are free.

**[Download Mac and Windows installers](https://github.com/GoMatiQ-inc/matiq-voice/releases)** ·
[Report a problem](https://github.com/GoMatiQ-inc/matiq-voice/issues) ·
[License](LICENSE)

## Why MatiQ Inc built MatiQ Voice

We wanted a dependable way to speak instead of type. Repeated crashes, broken
shortcuts, and time spent repairing dictation tools got in the way. We also
wanted our spoken words preserved, without a second AI pass cleaning up fillers,
rewriting sentences, or changing what we meant. So we built a local tool we can
inspect, fix, and improve ourselves, and are sharing it with others who need it.

We want this tool to be free because useful everyday software should give
people their time back. You should be able to dictate a message or use the app
at work without another subscription or a usage-based transcription bill.
Keeping recognition local also gives you control over your recordings and
transcripts. Recognition can still mishear or omit words; disabling rewriting
does not make an accuracy guarantee.

You can use MatiQ Voice inside a company, study its source, modify it, and share
it free with attribution. The [No-Sale License](LICENSE) prevents charging for
the software, paid access or hosting, and inclusion in paid bundles without
separate permission. This is **source available**, not OSI open source.

## Download and install

The Mac download is **v0.3.11**, signed with MatiQ's Developer ID and
Apple-notarized. Its app, native engines and installer passed signature,
stapling and Gatekeeper checks, including verification of the updater ZIP. It
includes the approved MatiQ Solutions wordmark, background update downloads,
and an explicit Restart to update action. Windows remains the **unsigned
v0.3.4-preview.1 preview** while Microsoft reviews company signing verification;
Windows security warnings are expected. Live calendar/meeting qualification
and wider hardware testing remain unfinished. See
[validation and limitations](docs/VALIDATION.md) and
[installer signing and notarization](docs/SIGNING.md).

| Computer | Download | Minimum OS |
|---|---|---|
| Apple Silicon Mac: M1, M2, M3, M4 or newer | [Mac installer (.pkg)](https://github.com/GoMatiQ-inc/matiq-voice/releases/download/v0.3.11/MatiQ-Voice-0.3.11-mac-arm64.pkg) | macOS 14.2 |
| Windows PC: Intel/AMD 64-bit | [Windows installer (.exe)](https://github.com/GoMatiQ-inc/matiq-voice/releases/download/v0.3.4-preview.1/MatiQ-Voice-0.3.4-preview.1-windows-x64.exe) | Windows 10 |

Intel Mac and native Windows ARM installers are not included in this preview.
On Mac, **Apple menu → About This Mac** shows whether you have an Apple chip or
Intel processor. On Windows, **Settings → System → About → System type** shows
your architecture. On the [Releases page](https://github.com/GoMatiQ-inc/matiq-voice/releases),
expand **Assets** and choose the installer for your computer. **Source code
(zip)** and **Source code (tar.gz)** are for developers, not installers.

You do **not** need Node, Python, a compiler, an Apple developer account, or your
own OAuth registration to run a downloaded app. Setup downloads the local speech
models over the internet; allow several GB of free space and keep the computer
connected until verification finishes. After model installation, local dictation
works offline. Optional calendar connections require internet access.

### Automatic updates

Official signed releases starting with 0.3.7 check for updates shortly after
launch and every six hours, download them in the background, and offer
**Settings → Updates → Restart to update**. You can also check from the menu-bar
or system-tray menu. Restart is explicit and is blocked during dictation,
meeting capture, model downloads and transcription. Closing the window keeps
the app running; it does not install an update.

Versions 0.3.6 and earlier need the update-enabled installer once. Updates
preserve local models, preferences and meeting files. The app checks the
package checksum and operating-system code signature before installation.
Normal macOS administrator or privacy prompts may still apply. Update checks
contact GitHub for release metadata and packages; they do not upload audio or
transcripts. Offline use continues normally; failed updates appear in Settings
and can be retried. If a third-party firewall blocks GitHub or its download
servers, allow the required updater traffic according to your network policy
and use **Check for updates** again.

Development builds and unsigned previews do not update automatically. Windows
automatic updates require an official signed Windows release; Microsoft company
verification is still pending. If you build a fork, configure your own release
feed and signing identities rather than using MatiQ's official update channel.

### Mac installation

1. Quit an existing MatiQ Voice from its menu-bar icon before upgrading.
2. Download the `.pkg` above and open it. Complete the installer, including
   administrator approval. It installs **MatiQ Voice.app in `/Applications`**.
3. Open **Finder → Applications → MatiQ Voice**. Grant Microphone permission
   when asked. For pasting and background shortcuts, enable that installed app
   in **System Settings → Privacy & Security → Accessibility** and, if requested,
   **Input Monitoring**. Use **Settings → Show app in Finder** to locate it.
4. Return to the app, check access again, and complete setup. If macOS requests
   a restart of the app, quit it from the menu bar and reopen it.

The Mac installer above is signed and Apple-notarized. Normal administrator
and privacy permission prompts still apply. If your organization blocks
installation, ask its IT team; do not disable Gatekeeper globally.

An old enabled permission entry can refer to a previous ad-hoc build. Remove
only the MatiQ Voice entry, add the current `/Applications/MatiQ Voice.app`,
then quit/reopen the app and use **Check keyboard access** or **Check again**.
Do not remove your models, settings, or recordings to repair permissions.

### Windows installation

1. Quit an existing MatiQ Voice from its system-tray icon before upgrading.
2. Download and run the `.exe` above. Choose the installation folder and finish
   the setup wizard. Launch **MatiQ Voice** from the Start menu.
3. Allow microphone access when asked, complete model setup, and select your
   preferred bindings. Use **Settings → Check keyboard access** if a shortcut
   is not responding.

This preview is unsigned, so Windows may show an unknown-publisher or SmartScreen
warning. Verify the download and its source before deciding whether to proceed;
use the app-specific options Windows offers. Do not turn off SmartScreen or
antivirus globally. Company security policy may require IT approval. Physical
Windows shortcut delivery, protected text fields and clean-machine upgrades
still require wider testing even though Windows CI passes.

### First run and everyday dictation

1. Review the hardware check and install the recommended English speech model.
2. Wait for the download and SHA-256 verification to finish.
3. Test your microphone and configure paste/keyboard access, or choose Copy.
4. Optionally connect Microsoft or Google calendars. Calendar consent and
   provider verification are still in qualification; local dictation does not
   require a connection. See [OAuth status](docs/VALIDATION.md#oauth-registration-follow-up).
5. Finish setup. Select a text field in another app, press your shortcut, wait
   for **Listening**, speak, then stop to transcribe and insert your words.

Closing the main window keeps MatiQ Voice in the Mac menu bar or Windows system
tray. **Quit** from that icon to stop it. Upgrades preserve the local profile;
quitting first prevents an installer from interrupting a recording.

### Verify a download (optional)

Each release includes `SHA256SUMS.txt`. Compare its entry with the hash of your
download. On Mac, run `shasum -a 256` followed by the downloaded file path. On
Windows PowerShell, use `Get-FileHash -Algorithm SHA256` followed by that path.
Checksums identify the published file; they do not replace publisher signing.

## Dictation, shortcuts, and local meeting notes

In **Settings → Dictation bindings**, click **Record binding** beside Toggle or
Push to talk, hold your desired key or combination, release all keys, then Save.
Left and right Command/Control/Option/Shift are stored separately; a modifier
alone is allowed. Toggle records until its next press. Push to talk records
while held and transcribes when any constituent key is released. Both retain
the existing five-minute dictation limit. Wait for Listening before speaking.
The initial toggle is Left Command + Left Option + Left Shift + Space on Mac,
or Left Control + Left Alt + Left Shift + Space on Windows; hold is initially
unset. Old generic bindings migrate to left-side keys, shown explicitly in UI.

Keyboard access is required for background detection. Use Check keyboard access
in Settings and grant the requested macOS Accessibility/Input Monitoring
permission. Key combinations can override the same keys in other apps; some
system-reserved or hardware/media keys are not exposed by the OS. Ordinary keyboard events are never logged. Saved bindings contain key identities.

The HUD leaves the original field focused. Closing the main window hides it;
use the menu-bar/system-tray menu to open it or Quit. The original field is
checked before insertion. Native paste inserts at its original caret without
rewriting the existing field. Highlighted text is kept, with new words inserted
at the selection's start. Moving the caret or changing fields leaves a
recoverable transcript to copy. There is no word-removal or rewriting stage. Recognition
itself can err.

For meetings, select an upcoming calendar event or choose Record meeting.
Attend the Teams/Meet call on this computer and explicitly start local capture.
The app records microphone plus selected system audio, saves chunks, processes
English speech and anonymous speaker groups locally, and presents a separate
Notes view with source-linked extracted passages and editable personal notes.
Rename speakers only when their identity is known. This does not send a bot.

Only explicit OAuth/calendar calls and model downloads use the network. No
recorded audio or transcripts are sent to a cloud transcription/notes service.
Meeting storage is local and explicit; dictation's last result stays in memory.
See [the full behavior and privacy contract](docs/PRODUCT.md).

## Develop

Node 22+, npm, Git, CMake, tar and a native C/C++ compiler are required to build the engine.
On Mac use Xcode command-line tools; on Windows use Visual Studio 2022 C++ Build
Tools and Windows SDK. Runtime targets are macOS 14.2+ and Windows 10+ on x64 or
arm64; qualify an actual architecture before advertising support for it.

```sh
npm ci
npm run engine:build
npm test
npm run package
# Install the generated app from dist/, then open it and complete setup.
# npm start is also available for UI development.
```

Allow several GB of free disk space for dependencies, engine compilation and packaging.
The engine is pinned whisper.cpp; speaker inference uses packaged sherpa-onnx
2.0.0 native libraries with verified local ONNX models. Source/font/model
licenses and attributions are retained in `src/ui/assets/` and bundled engine.

## Local builds and signing

A fresh clone builds without an Apple developer account, private MatiQ files or
OAuth registrations. Speech models are downloaded during setup, not committed.
The Mac PKG installs only to `/Applications` (home-directory installation and
bundle relocation are disabled). It refuses to overwrite a running app.
Install the packaged Mac app before granting OS permissions: `npm start` runs
inside Electron, so macOS may show Electron rather than MatiQ Voice. Add the
installed `.app` to Accessibility and, if requested, Input Monitoring. Use
Settings → Show app in Finder to locate it; after changing permissions, quit
and reopen the app. After replacing an ad-hoc build, macOS can require removing
and re-adding the installed app in those lists. Paste permission checks run a
fresh native helper so they reflect the process that performs insertion, rather
than Electron’s cached trust result. Never disable Gatekeeper globally.

The Mac icon is committed as `build/icon.icns`, generated from the shared PNG
with `npm run icons:mac` using Apple’s icon utilities. The installer check
verifies that packaging retains this file; automatic PNG-to-ICNS conversion
previously corrupted the smallest Finder icon.

`npm run package` uses ad-hoc signing on Mac and needs no paid Apple account.
Production releases require Developer ID signing and Apple notarization
through `npm run package:release`. Mac release builds require both
`CSC_NAME` (Developer ID Application) and `CSC_INSTALLER_NAME` (Developer ID
Installer), plus the documented Apple notarization environment variables. Local builds and forks never receive MatiQ
signing keys. A fork distributed with Developer ID trust needs its own signing
identity and notarization credentials. Preview downloads are ad-hoc signed and explicitly labeled as not notarized.
The production signing gate remains separate from preview publication.

## OAuth owned by MatiQ

Official-build customers should never create app registrations. Configure the real native
Microsoft and Google registrations at build time with `npm run oauth:configure`.
Read [OAUTH.md](docs/OAUTH.md) for scopes, redirects, token protection, provider
verification, and the distinction between calendar connection and raw media.
A build without registrations still supports local dictation and attended
meeting recording; calendar connections report that they are unavailable.
Fork maintainers can provide their own registrations using the documented
build variables. No real credentials
are fabricated in tests or committed to this repository.

## Test and package

```sh
npm test                 # core, PKCE, credential protection, storage, hardware
npm run test:e2e         # fresh setup through meetings with explicit test providers
npm run test:focus       # real OS field insertion; requires desktop permissions
npm run package:dir     # local unpacked build
npm run package         # development DMG/ZIP or Windows installer
npm run package:release # requires real OAuth configuration and signing credentials
```

E2E needs Google Chrome (or `MATIQ_E2E_BROWSER_CHANNEL`) on the developer/CI
machine. It reuses verified fixtures under ignored `.validation/`, launches
isolated app/browser profiles, and removes temporary profiles afterward.
Models/native inference and OS-protected credential files are real; provider
consent pages and capture devices are local fixtures. Tests never join a real
meeting or record the user's screen/system audio. Copy tests use the system
clipboard. CI builds and runs these checks separately on Mac and Windows. Both platforms
passed on the initial public source release; see VALIDATION.md for actual scope.

The default package is a development build: ad-hoc Mac signing / unsigned
Windows packaging. Customer release commands fail without real registrations
and signing configuration. Production Google verification and Apple notarization
are external platform steps, not claims an automated fixture can prove.

## Publishing installers

Merge a version update through a reviewed PR, then push the matching version
tag. Preview tags (`vX.Y.Z-preview.N`) publish clearly labeled development
installers after normal platform CI. Stable tags (`vX.Y.Z`) additionally require
protected signed builds, native signature/notarization verification and reports
that match the installer hashes. Only merged `main` history is eligible.

See [SIGNING.md](docs/SIGNING.md) for credential isolation, preflight validation,
Microsoft identity requirements and release checks. Stable publication fails
when a signer, valid timestamp, Apple notarization or matching evidence is
missing. Installer assets remain separate from test logs and screenshots.

## About MatiQ Inc

[MatiQ Inc — Applied AI & Engineering](https://matiqinc.com) helps organizations
with digital transformation, enterprise AI training, and software development
and AI engineering. We built MatiQ Voice around a practical need: software that
helps people get work done while keeping their words and recordings under their
control. You do not need to be a MatiQ client or subscribe to a platform to use it.

## Source map

- `src/main.cjs`: Electron lifecycle, IPC, setup, tray/HUD and worker orchestration.
- `src/oauth.cjs`: PKCE loopback flow, encrypted token storage and calendar APIs.
- `src/hardware.cjs`, `src/assets.cjs`: model recommendation, verified downloads.
- `src/meetings.cjs`, `src/meeting-worker.cjs`: durable audio, inference, speakers,
  source-linked notes and recovery.
- `src/input.cjs`, `native/`: focused-field tracking and paste helpers.
- `src/ui/`: MatiQ-branded working UI, onboarding and capture.
- `scripts/e2e.mjs`: full app regression journeys with explicit fixtures.
- `scripts/e2e-packaged.mjs`: real inference from the packaged native runtime.
- `scripts/e2e-focus.mjs`: native insertion and destination-change checks.

The source checkout retains its original `verbatim-dictation` folder name;
the distributed product and GitHub repository are MatiQ Voice.

## License

MatiQ-authored code is source available under the [MatiQ Voice No-Sale License 1.0](LICENSE).
Personal and internal business use, modification, and free redistribution are
permitted, including use within a for-profit company. You may charge for your
own work and work products created using the app. You may not charge for the
software or access to it, offer it as paid hosting, or include it in a paid
product, service, subscription, or bundle, including modified versions.
Those uses require separate written permission from MatiQ Inc.

Preserve [the MatiQ attribution notice](NOTICE) and the full license when
sharing copies or modifications, and identify modified versions. This is a
custom source-available license, not an OSI open-source license: open-source
licenses permit commercial redistribution. The full LICENSE controls.
Third-party components retain their own licenses; MatiQ branding does not
imply endorsement of a fork. Earlier versions retain their original licenses.

## Shared MatiQ model artifacts

Model downloads use the shared MatiQ artifact store contract documented by MatiQ Companion. Speech models use `asr`/GGML, speaker models use `speaker`/ONNX, and chat models use `llm`/GGUF. Artifact identity is SHA-256 plus kind, not a display name or extension. Version 0.3.9 adopts existing verified Voice or shared-cache files during startup without downloading anything. Missing models still require an explicit download/verification action. Workers retain their existing paths through hard links on a compatible filesystem. Across filesystems, copying is necessary and can use additional space. Downloads coordinate through an exclusive artifact lock; stale locks fail visibly rather than being silently stolen. Earlier installed Voice versions keep their existing model storage until updated to a build with this bridge.

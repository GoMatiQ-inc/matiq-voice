# MatiQ Voice

Local English dictation and meeting notes for macOS and Windows, by MatiQ Inc.

**Development release:** working application and automated E2E coverage. Real
OAuth registrations, signed customer distribution, and live meeting/native OS
qualification are separate release gates in [VALIDATION.md](docs/VALIDATION.md).

## Use

On Mac, open the `.pkg` installer for your architecture; it installs to
`/Applications` and preserves your existing profile. Quit the running app before
upgrading. DMG/ZIP builds remain available for development; drag the DMG app
into its Applications shortcut rather than running it from the disk image.
On Windows, run the NSIS `.exe` installer; it creates a Start menu shortcut and
keeps user data when uninstalling. Then follow first-run setup:

1. Check this computer's CPU, memory, disk and bundled engine.
2. Download/verify the recommended English speech and speaker-label models.
3. Test microphone input and choose automatic paste or Copy.
4. Optionally connect Microsoft or Google through the system browser.
5. Finish setup. No terminal, Python, Node or package installation is needed.

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
checked before insertion; unsupported/changed destinations leave a recoverable
transcript to copy. There is no word-removal or rewriting stage. Recognition
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
and re-adding the installed app in those lists. Never disable Gatekeeper globally.

`npm run package` uses ad-hoc signing on Mac and needs no paid Apple account.
MatiQ official downloads must use Developer ID signing and Apple notarization
through `npm run package:release`. Mac release builds require both
`CSC_NAME` (Developer ID Application) and `CSC_INSTALLER_NAME` (Developer ID
Installer), plus the documented Apple notarization environment variables. Local builds and forks never receive MatiQ
signing keys. A fork distributed with Developer ID trust needs its own signing
identity and notarization credentials. The current installed development build
is ad-hoc signed, not a notarized public release.

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
clipboard. CI is configured to build and run these checks separately on Mac and Windows;
current account-level execution blockers are recorded in VALIDATION.md.

The default package is a development build: ad-hoc Mac signing / unsigned
Windows packaging. Customer release commands fail without real registrations
and signing configuration. Production Google verification and Apple notarization
are external platform steps, not claims an automated fixture can prove.

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

MatiQ-authored code is source available under [PolyForm Noncommercial 1.0.0](LICENSE).
Noncommercial use, modification and redistribution are permitted under those
terms. Preserve [the required MatiQ attribution notice](NOTICE) and the license
when sharing copies or modifications. Commercial use, including use within a
for-profit business, requires a separate license from MatiQ Inc. The license
expressly permits certain nonprofit and public institutions; see its full terms.
It is not an OSI open-source license because it restricts commercial use.
Third-party components keep their own licenses; MatiQ branding does not imply
endorsement of a fork. MatiQ Inc can separately license its own software commercially.

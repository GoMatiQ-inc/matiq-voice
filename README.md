# MatiQ Voice

Local English dictation and meeting notes for macOS and Windows, by MatiQ Inc.

**Development release:** working application and automated E2E coverage. Real
OAuth registrations, signed customer distribution, and live meeting/native OS
qualification are separate release gates in [VALIDATION.md](docs/VALIDATION.md).

## Use

Install the app for your OS/architecture and follow first-run setup:

1. Check this computer's CPU, memory, disk and bundled engine.
2. Download/verify the recommended English speech and speaker-label models.
3. Test microphone input and choose automatic paste or Copy.
4. Optionally connect Microsoft or Google through the system browser.
5. Finish setup. No terminal, Python, Node or package installation is needed.

**⌘ Shift Space** on Mac / **Ctrl Shift Space** on Windows starts and stops
background dictation. Wait for Listening. The HUD leaves the original field
focused. Closing the main window hides it; use the menu-bar/system-tray menu to
open it or Quit. The original field is checked again before inserting text;
unsupported/changed destinations leave a recoverable transcript to copy.
There is no word-removal or rewriting stage. Recognition itself can err.

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

Node 22+, CMake and a native C/C++ compiler are required to build the engine.
On Mac use Xcode command-line tools; on Windows use Visual Studio 2022 C++ Build
Tools and Windows SDK. Runtime targets are macOS 14.2+ and Windows 10+ on x64 or
arm64; qualify an actual architecture before advertising support for it.

```sh
npm ci
npm run engine:build
npm test
npm start
```

Use the shared Mac's storage guard for installs/builds/tests (approximate peak
reservations: dependencies 4 GiB, engine build 2 GiB, E2E 1 GiB, packaging 3 GiB).
The engine is pinned whisper.cpp; speaker inference uses packaged sherpa-onnx
2.0.0 native libraries with verified local ONNX models. Source/font/model
licenses and attributions are retained in `src/ui/assets/` and bundled engine.

## OAuth owned by MatiQ

Customers should never create app registrations. Configure the real native
Microsoft and Google registrations at build time with `npm run oauth:configure`.
Read [OAUTH.md](docs/OAUTH.md) for scopes, redirects, token protection, provider
verification, and the distinction between calendar connection and raw media.
A build with missing registrations reports that explicitly. No real credentials
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
the distributed product and private GitHub repository are MatiQ Voice.

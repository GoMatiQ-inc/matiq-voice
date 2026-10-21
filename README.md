# Verbatim

A standalone local dictation app targeting macOS 14+ and Windows. Start dictation in any
app, speak, stop, and receive the recognizer's text without rewriting.

**Status: initial prototype, not a signed production release.** The repository
contains the app, speech-engine build, tests, and installer workflow. Read
[the validation report](docs/VALIDATION.md) before relying on a build.

## The transcription contract

- No text-cleanup model, filler removal, grammar rewriting, dictionary
  replacements, translation, or spoken-command interpretation.
- Preserve the model's words, including repetitions, fillers, and corrections.
  Only outer whitespace and recognizer segment line breaks are normalized.
- The model itself can still omit words, hallucinate, or get punctuation wrong.
  Verbatim does not promise perfect recognition. Whisper may normalize speech
  even when the application does not; acceptance requires testing real speech.
- Audio is recorded from start to stop without a VAD trimming stage. Recording
  is limited to five minutes, with an explicit notice at the limit.
- No audio/transcript uploads, accounts, analytics, or cloud recognition.
  Internet is needed for the initial model download or a different model.

## Use

1. Open Verbatim and download a speech model. Small English is the default;
   Base uses less storage; Medium needs more memory and processing time.
2. Grant microphone access. Use Refresh beside Microphone to reveal device
   names after permission is granted, then select and save your preference.
3. On Mac, enable Verbatim under System Settings → Privacy & Security →
   Accessibility for automatic paste. Development runs may appear as Electron.
4. Place the cursor in a text field and press **⌘ Option Space** on Mac or
   **Ctrl Alt Space** on Windows. Press again to stop and transcribe.
   Wait until the status says Listening before speaking; microphone preparation
   and permission prompts happen before that state.
5. Keep the same app/window active. The app sends a paste shortcut and retains
   the transcript for Copy. It cannot verify that another app accepted the paste
   or that the cursor stayed in the same field. Automatic paste replaces your
   clipboard; clipboard managers may retain copied text.

Starting from the app's button produces a transcript to copy. Press Escape in
the app or the global **⌘/Ctrl Alt Escape** shortcut to cancel. Closing the
window keeps the app in the menu bar/system tray; use its Quit menu to exit.
The tray tooltip shows the recording state; the Mac menu bar also shows a dot.
Recording/transcription does not finish automatically when you close the window.

An unsuccessful transcription keeps its recording in memory for Retry. Retry
produces a result to copy rather than pasting automatically. A new recording,
Cancel, Clear, or Quit discards that audio. The last transcript lives in memory
until replaced, cleared, or the app exits. Clear removes the in-app result;
text you copied remains in the system clipboard and any clipboard manager.
No transcript history is written.
Temporary audio/transcript files are deleted after each recognition attempt;
leftovers after a crash are removed at the next startup. Memory and temporary
files are not encrypted by this app; normal OS disk protection applies.

## Develop

Node.js 22+, CMake, Git, and a C/C++ compiler are required to build. On macOS,
install the Xcode command line tools. On Windows, install Visual Studio 2022
Build Tools with Desktop development with C++, plus CMake and Windows SDK.
Build on each target OS/architecture; do not reuse a Mac engine on Windows.
The packaged app includes its runtime and engine: end users do not need these
developer tools, Python, a terminal, or a separately running server.

```sh
npm ci
npm test
npm run engine:build
npm start
```

The engine script builds pinned whisper.cpp v1.9.5 with static libraries and
embedded Metal shaders on Mac, then removes its temporary source/build tree.
It downloads source from GitHub. Model downloads come from Hugging Face and
must match the committed SHA-256 and byte count before installation.

On this shared development Mac, run dependency installs, tests, engine builds,
and packaging through the machine's storage guard with an appropriate reservation.
Suggested peak additional space: dependencies 4 GiB, engine build 2 GiB,
packaging 3 GiB, tests 0.1 GiB. These are development-machine policies, not
requirements imposed on installed-app users.

```sh
npm run package:dir  # unpacked app for local testing
npm run package      # Mac DMG/ZIP or Windows NSIS installer
```

CI runs tests and packages each OS independently, uploading installers as
workflow artifacts. There is no automatic publishing or updating yet. The
initial workflow produces ad-hoc-signed Mac builds and unsigned Windows builds;
Developer ID signing/notarization and
platform acceptance are required before a dependable general release. Windows
ARM is not part of the initial CI matrix. Mac architecture is determined by
the runner and checked against the embedded engine metadata. Only Apple Silicon
has been built locally so far; Intel Mac acceptance remains unverified.

## Repository map

- `src/main.cjs`: app lifecycle, shortcut, model setup, recognition, clipboard.
- `src/engine.cjs`: isolated recognition process, checked downloads, cleanup.
- `src/core.cjs`: transcription contract, settings and WAV validation.
- `src/ui/`: focused desktop interface and untrimmed microphone capture.
- `native/`: small OS-specific paste helpers and Mac entitlements.
- `scripts/`: pinned engine build and package integrity checks.
- `docs/PRODUCT.md`: feature decisions and acceptance criteria.

The app renderer is sandboxed with context isolation, a restrictive content
policy, no Node access, and a narrow validated IPC interface. Recognition runs
in a separate process so an engine failure can be reported without terminating
the interface. A renderer failure is reported with a Reload/Quit dialog; an
in-progress recording cannot survive that failure.

Upstream: [whisper.cpp](https://github.com/ggml-org/whisper.cpp),
[Electron](https://www.electronjs.org/). The bundled engine includes its MIT
license. This repository has no selected redistribution license yet.

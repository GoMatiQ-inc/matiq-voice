# Validation

Checked 2026-10-21 on an Apple Silicon Mac.

## Passed

- Eight Node tests: word preservation after recognition, forbidden processing
  flags, settings validation, PCM sample ordering and endpoints, invalid WAV
  rejection, engine crash reporting, process cancellation, and partial-download
  rejection/cleanup.
- Electron desktop smoke: sandbox isolation, setup, saved preferences, synthetic
  microphone recording, real whisper.cpp recognition of a known speech fixture,
  result display, Copy, clearing the in-app result, cancellation, and cancelling
  while preparation is pending. This uses fake audio devices, not a human mic.
- The pinned Base English model downloaded successfully and passed SHA-256
  verification. The JFK sample from pinned upstream whisper.cpp was recognized
  through the app's recognition/result path. Model-generated punctuation was
  retained. This single sample is not an accuracy benchmark.
- whisper.cpp v1.9.5 and the native Mac input helper compiled for arm64 with a
  macOS 14 deployment target. The engine's linked libraries are Apple system
  libraries; no Homebrew runtime dependency was found.
- The final app and DMG packaged successfully. The packaged arm64 app launched,
  found its bundled engine, and loaded its sandboxed interface.
- Ad-hoc signature verification passed with `codesign --verify --deep --strict`.
  Ad-hoc signing does not provide Developer ID trust or Apple notarization.
- `git diff --check` and JavaScript syntax checks passed.

The local runtime is installed in the user's Applications directory. Disposable
dependency installations, CMake environment, model/recording fixtures, build
output, and task worktree are retired after source preservation. No speech
models are preinstalled in the normal app profile; first use downloads one.

## Reproduce

Use Node 22+, CMake, and the platform compiler described in README.md:

```sh
npm ci
npm test
npm run engine:build
npm run test:desktop
npm run package
```

For the extended desktop smoke, obtain `ggml-base.en.bin` from the upstream
model repository and `samples/jfk.wav` from whisper.cpp commit
`d1be6fde11ac6e0407606b4e42fe72d34add8037`, then run:

```sh
npm run test:desktop -- /path/to/ggml-base.en.bin /path/to/jfk.wav /path/to/preview.png
```

Run these commands through the storage guard on shared development machines.
The smoke creates and removes a temporary app profile. Copy validation uses
the system clipboard, so preserve anything you need there before running it.

## Still unverified

- Windows compilation, installation, audio capture, and paste behavior. The
  Windows CI job is committed but has not run on a remote repository.
- Intel Mac builds; clean-machine installation; older supported macOS versions.
- Actual microphone permissions and input, Accessibility approval, and native
  paste into other apps. No key events were sent into the user's other apps.
- Word accuracy on the owner's voice, fillers, repetitions, self-corrections,
  names, noise, and long dictations. Small/Medium models were not benchmarked.
- Five-minute capture, 100-cycle endurance, sleep/wake, unplugged microphones,
  disk exhaustion, or upgrades/rollback.
- Developer ID signing, notarization, Windows signing, and automatic updates.

This is a working prototype with a local Mac build, not a completed reliability
qualification or a promise of word-perfect recognition.

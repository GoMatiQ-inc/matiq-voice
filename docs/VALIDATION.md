# Validation

Checked 2026-10-23 on Apple Silicon. This file distinguishes implemented behavior
from external account, platform and distribution qualification.

## Local checks

- 21 Node tests pass, including hardware selection, durable meeting storage,
  source-linked notes, WAV validation, PKCE/state, consent refusal, cancellation,
  refresh serialization, locked-key-store disconnect and disconnect/refresh races.
- Ten Electron E2E journeys pass using real Base English recognition and local
  ONNX speaker segmentation/embedding. The suite exercises first-run hardware
  checks, a failed download and retry, model verification, microphone setup,
  dictation, consent flows, calendar links, encrypted credentials, meeting
  capture/pause, processing, speaker rename, notes and restart persistence.
- OAuth E2E uses explicit local fixture providers, browser consent pages and the
  real OS encrypted credential store. It is not live Google/Microsoft approval.
- Audio capture E2E uses fake microphone input and independent synthetic streams.
  The separate English two-speaker recording exercises the real native worker.
- Medium English and both speaker models downloaded and passed SHA-256 checks
  in the normal MatiQ Voice model directory. Hardware recommendation is a RAM/
  CPU heuristic, not an accuracy or performance benchmark.

Native text-field checks and final installer/CI results are recorded below as
qualification progresses. Posting a shortcut alone is never delivery proof.

## Reproduce

Use Node 22+, CMake and the platform C/C++ compiler documented in README.md:

```sh
npm ci
npm test
npm run engine:build
npm run test:e2e
npm run test:focus
npm run package
```

Use the machine's storage guard on shared development hosts. E2E downloads
verified public test models into ignored `.validation/`, uses a disposable app
profile and closes/removes that profile. Chrome must be installed. Native focus
tests require a foreground desktop and OS Accessibility permission. They create
only their own text fields, verify insertion, and reject a changed destination.
They temporarily use the text clipboard and restore its prior text contents;
non-text clipboard formats are not preserved.

## External release gates

- Actual Google Desktop OAuth and multi-tenant Microsoft public-client
  registrations, consent/verification and real accounts need qualification.
  This source contains no fabricated production client IDs. See OAUTH.md.
- A real user-attended Teams and Google Meet call, actual system-audio capture,
  microphone permissions and participant-label accuracy require live testing.
  Calendar OAuth does not create an independently joining meeting bot.
- Windows native insertion, installation and real capture; Intel Mac and Windows
  ARM builds; clean machines and supported older OS versions need testing.
- Voice-specific accuracy, fillers/repetitions, long recordings, endurance,
  sleep/wake, device removal, disk exhaustion and update/rollback need testing.
  ASR can omit or misrecognize words even with rewriting disabled.
- Developer ID signing/notarization, Windows signing, privacy/support pages and
  provider external verification are required before marketing a production
  release. Development installers are not distribution-trusted releases.

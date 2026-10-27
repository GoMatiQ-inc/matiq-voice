# Validation

Checked 2026-10-26 on Apple Silicon. This file distinguishes implemented behavior
from external account, platform and distribution qualification.

## Local checks

- 28 Node tests pass, including hardware selection, durable meeting storage,
  source-linked notes, WAV validation, PKCE/state, consent refusal, cancellation,
  refresh serialization, locked-key-store disconnect and disconnect/refresh races.
- Thirteen Electron E2E journeys pass using real Base English recognition and local
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

- Native macOS text-field E2E passes actual insertion, Unicode selection
  replacement and rejection after switching to a different field. This tests
  Accessibility insertion into the fixture's textareas; other apps, rich text
  and keyboard fallback still require qualification.
- The arm64 Mac development DMG builds with the approved MatiQ icon. The
  packaged app passes speech recognition and native ONNX speaker inference
  in an isolated profile. Ad-hoc `codesign --verify --deep --strict` passes.
- Recommended Medium English recognition passes a known speech fixture.
- GitHub attempted both Mac and Windows CI jobs but did not start them:
  organization payments/spending limits blocked Actions. Neither remote job
  is a passed build. See [PR #1](https://github.com/GoMatiQ-inc/matiq-voice/pull/1)
  for the account billing annotation.

Physical-key toggle and push-to-talk bindings replace accelerator strings.
Native Mac callback fixtures pass left/right modifier coexistence, release,
repeat suppression, trigger-key interception and own-paste exclusion. The real
Mac event tap opens successfully on the development host. The 13 app journeys
use an explicit helper-protocol fixture for keyboard events, exercising capture,
save failure, cancellation, opposite sides, hold release, toggle repeats,
quick release during delayed microphone startup and restart persistence.
They do not prove physical event delivery or permission grants on the MacBook.
Windows native keyboard-hook code is implemented but unqualified on Windows.
Posting a shortcut alone is never text-delivery proof; native insertion limits
above still apply. The pre-existing five-minute dictation limit remains.

## Reproduce

Use Node 22+, CMake and the platform C/C++ compiler documented in README.md:

```sh
npm ci
npm test
npm run engine:build
npm run test:e2e
npm run test:focus
npm run package
npm run test:packaged
```

Use the machine's storage guard on shared development hosts. E2E downloads
verified public test models into ignored `.validation/`, uses a disposable app
profile and closes/removes that profile. Chrome must be installed. Native focus
tests require a foreground desktop and OS Accessibility permission. They create
only their own text fields, verify insertion, and reject a changed destination.
They temporarily use the text clipboard and restore its prior text contents;
non-text clipboard formats are not preserved.

## OAuth registration follow-up

The real Microsoft public/native registration now exists in MatiQ's tenant,
with organizational multi-tenant sign-in, the loopback redirect, approved MatiQ
artwork and delegated read-only calendar/profile scopes. Its production
authorization endpoint accepts the desktop PKCE request. No user or tenant-wide
calendar consent was granted during setup; authenticated sign-in and calendar
access still need a real consenting user.

Builds inject registration metadata from the configured repository variables /
secret into ignored `config/oauth.json`. Packaged E2E now checks that configured
providers survive packaging. The Google Desktop registration now exists in
MatiQ's dedicated company project, with an External / Testing audience, a
designated test account, company homepage/domain and identity plus read-only
calendar-event scopes. The installed app reaches Google's real account consent
screen. Calendar API activation awaits acceptance of its separate terms;
authenticated token exchange and calendar access remain unqualified.

Both real registrations are included in the rebuilt Apple Silicon development
installer. The 28 unit tests, thirteen app E2E journeys and packaged native-inference /
registration checks pass again with this build. No account consent result is
inferred from those fixture tests.

## External release gates

- Google Desktop OAuth and multi-tenant Microsoft public-client registrations
  exist; consent/verification and real accounts still need qualification.
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

## Permission recovery update (2026-10-27)

- 29 Node tests pass, including native request flags and recovery after denial.
- The updated macOS helper compiles; native callback fixtures pass.
- Check keyboard access waits for an Accessibility grant before retrying and
  requests access from the native helper on an explicit click. Startup does
  not prompt. Event-tap failure opens Input Monitoring with recovery guidance.
- Show app in Finder reveals the actual installed app for the permission picker.
- Physical keyboard permission recovery on the MacBook remains a manual gate.
  These checks do not prove that the reported macOS permission issue is resolved.

- A fresh macOS arm64 source build installs with `npm ci`, compiles the pinned
  engine, passes 29 unit tests and packages with a valid ad-hoc signature
  without private OAuth configuration or Apple developer credentials.
- The fresh MacBook desktop E2E run passed three setup journeys, then stopped
  at OS Keychain encryption during fixture OAuth. This remote session did not
  qualify OAuth storage; no plaintext workaround was introduced. The earlier
  13-journey result above belongs to the prior qualified development-host run.

- Fresh unconfigured packaged speech and ONNX speaker-inference tests pass on
  the MacBook with an isolated profile. The native keyboard tap reports ready
  in that test process; physical typing and the installed-app permission picker
  remain separate checks.

## Installer, Finder icon and native permission checks (2026-10-27)

- Mac PKG installation is restricted to system `/Applications`, with bundle
  relocation disabled. Its preinstall guard rejected a running app and returned
  success after normal Quit; it never terminates a recording process.
- The MacBook's actual Installer receipt confirms version 0.3.2 at Applications.
  Its former home-directory copy is removed, and user profile files are retained.
- Automatic icon conversion corrupted the embedded 16-pixel representation;
  the larger icons were correct. A native-generated ICNS now renders correctly
  at 16 pixels. Installer checks extract the payload and require that exact icon.
- Version 0.3.3 passes 30 Node tests, installer checks, packaged native speech and
  speaker inference, and real native field insertion/Unicode selection/rejection
  checks on macOS arm64. Paste access now probes a fresh native input helper;
  errors are exposed separately from denied access and startup never prompts.
- The new native-helper test covers denial, permission refresh, explicit request
  flags and failed/invalid probes. Installed Launch Services permission approval
  and physical shortcut/paste use still require interactive acceptance.
- Production Mac release commands require Developer ID Application and Developer
  ID Installer identities and notarization credentials. The available Apple
  Development identity is not a substitute. Current artifacts remain ad-hoc
  development builds; no trusted public-distribution claim is made.
- Windows NSIS preserves profile data and creates a Start menu shortcut. Actual
  Windows install/upgrade and native permission qualification remain outstanding.

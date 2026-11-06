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

## Public CI and preview distribution (2026-11-03)

- Public-repository CI run 41670776701 passed both macOS arm64 and Windows x64
  on merged source c099882: unit tests, native engine compilation, desktop E2E,
  packaging and packaged native speech/speaker inference. Mac installer checks
  passed. The historical private Actions budget refusal above no longer blocks
  these public jobs. Physical Windows keyboard delivery and live capture still
  need qualification; fixture CI is not a clean-machine installation test.
- The preview publication helper passes six new safety tests: exact hashes and
  visible signing limits, mismatched tags, stable-version rejection, missing
  installers, unexpected debug files and empty installer rejection. All 36 Node
  tests pass on the exact release-workflow source under Linux.
- Preview tags must match package metadata and belong to merged main history.
  Publication depends on both native CI jobs and uploads only Mac arm64 PKG,
  Windows x64 EXE and their checksums. The first version is 0.3.4-preview.1.
- Preview downloads remain unsigned Windows / ad-hoc Mac, with an unsigned PKG
  and no Apple notarization. Trusted production signing is still an external
  gate. The preview publisher rejects stable versions; checksums do not certify
  an OS publisher identity. Intel Mac and native Windows ARM are not included.

## Signed-release setup (2026-11-03)

- 42 Node tests pass on the exact signing-workflow source under Linux. New tests
  reject incomplete signing configuration, untrusted Azure endpoints, stale
  installer verification reports and missing Apple notarization evidence.
- The workflow adds protected tag-only signing, Developer ID app/native-helper
  and Installer signatures, Apple notarization/stapling/Gatekeeper checks, and
  Windows company Authenticode/timestamp verification. Windows uses OIDC rather
  than a persistent Azure password. actionlint and staged secret scans pass.
- These configuration/unit results do not prove a completed signed build.
  Real Mac notarization and Windows Public Trust identity/profile qualification
  must pass before signed downloads are claimed or published. Existing public
  preview assets remain unsigned/ad-hoc. See SIGNING.md.

- Protected Mac preflight 41689073482 stopped before notarization: the v26
  automatic keychain import supplied the P12 password to a keychain created
  with a different random password. The following payload check rejected the
  missing installer, so nothing was published. SDK exit hooks also exposed
  that setting `exitCode` was insufficient; the release command now exits 1
  explicitly on rejection.
- The keychain workaround has mocked lifecycle tests for separate key/P12
  passwords, successful asynchronous completion, import/signing failure,
  environment/search-list restoration and temporary-file removal. The child
  process regression proves packager failures stay nonzero even if an SDK
  exit hook resets `exitCode`. All 46 Node tests pass under Linux. Real Mac
  signing/notarization requires another protected preflight.

## Verified Mac release artifact

- [Protected preflight 41694057284](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/41694057284)
  passed on source `15eca1316c2d42f799bdb7832f5c0fd62787b2c7`:
  both platform test/package jobs, Mac Developer ID app/native-engine and
  Installer signatures, app and PKG Apple notarization, stapling, Gatekeeper
  assessments, installer payload checks and packaged native inference.
- The Mac-only publishing workflow retrieves that tested artifact and requires
  a matching version, filename and SHA-256 in its native verification report.
  It publishes no rebuilt binaries or unsigned fallback. This supersedes the
  earlier pending Mac qualification notes above. Windows trusted signing is
  still awaiting Microsoft organization validation; its public preview stays
  unsigned. Privacy/admin permission prompts and live provider limitations
  remain applicable.

## Recording indicator and window lifecycle changes

- 46 Node tests and workflow lint pass for the compact red recording indicator.
- New native E2E scenarios check silence-to-speech-to-silence amplitude changes,
  elapsed time, top-center placement, non-focusability, hide on cancellation, and
  main-window close/reopen with Mac Dock visibility. CI retains indicator images.
  Native CI results must pass before the new installer is published.
- Windows organization verification remains a separate Microsoft approval gate.

- [Native indicator CI 42062478847](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/42062478847)
  passed both Mac arm64 and Windows x64 E2E, packaging and packaged native
  inference for the 0.3.5 changes. The new waveform/placement/focus and
  close/reopen scenarios passed; Mac Dock visibility is checked after the
  asynchronous OS transition settles. Quiet/recording screenshots are retained
  in CI. This completes the native checks requested in the preceding notes.

## Caret-preserving insertion (2026-11-05)

- 46 Node tests pass under Linux. Native Mac tests exercise actual Accessibility,
  event taps and editor paste in an isolated Electron text-field fixture.
- Mac tests pass beginning/middle/end insertion, unchanged caret during target
  capture, repeated insertion, Unicode, preserved highlighted text, native Undo,
  and rejection after caret or field changes.
- The native Mac shortcut test passes an arrow-key chord without moving the
  caret or leaking keydowns. Individual arrows, auto-repeat and incomplete
  chords retain navigation. Mac partial chords defer their typing keys until
  completion, release or repeat; modifier events continue to the OS.
- The native test ran with a 120-second watchdog and tracked its owned processes
  and actual inspector listeners. Independent teardown checks found no owned
  processes or listeners remaining.
- [Native CI 42081604347](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/42081604347)
  passed both desktop E2E/package jobs, packaged speech inference and the new
  Windows native caret checks, including changed-caret/field rejection.
  Windows selection collapse and caret updates wait briefly for asynchronous
  UI Automation notifications.
- [Protected Mac preflight 42082685069](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/42082685069)
  passed the merged 0.3.6 source, both desktop package jobs, Developer ID
  app/native-helper and Installer signatures, app and PKG notarization,
  stapling, Gatekeeper and packaged speech inference.

## MatiQ Solutions header

- The header uses the approved family-brand Solutions wordmark, with its source
  pixels unchanged. Voice remains a separate text label and divider.
- Header spacing accommodates the two-line mark at standard and narrow sidebar
  widths. All 46 Node tests pass. Native visual/E2E qualification is pending.

## Automatic update implementation

- 52 Node tests pass on the Linux development host, including idle-only install,
  explicit restart, disabled unsigned builds, serialized checks, visible network
  and checksum errors, and rejection of changed update ZIP bytes.
- Native desktop CI run [42136050078](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/42136050078) passed on macOS ARM64 and Windows x64: 52 unit tests, desktop E2E including the approved Solutions asset and updater IPC during recording, packaging, packaged native inference and the platform-specific installer/caret checks. The updater is a fixture in desktop E2E, not an actual installed signed upgrade.
- Signed updater ZIP extraction, signature/notarization checks and a real
  installed-app upgrade remain release qualification gates; no completed
  upgrade is claimed here. Windows signing remains externally blocked.

The wordmark is byte-identical to `assets/logo/matiq-solutions-wordmark-dark@2x.png`
in the canonical brand repository at commit
`b8698a2e488370ec7aee0b134af86cb47bc6c0f2` (brand PR 44).
Protected signing run 42136995590 successfully notarized the app and PKG, then
stopped at the metadata gate: Electron Builder merged the old DMG target into
the signed target list. The build defaults now match the signed PKG/ZIP targets;
a configuration regression reproduces the mismatch before the correction. No
artifact from that failed run was published. A new protected run and actual
installed upgrade remain required. After explicit restart consent, Windows
uses silent update installation rather than repeating the setup wizard.

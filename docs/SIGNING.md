# Installer signing and notarization

Official stable downloads require Developer ID signatures and Apple notarization
on Mac, and company Authenticode signatures with timestamps on Windows. A
checksum alone is not a publisher signature. Existing preview assets are not
retroactively signed when this pipeline is configured.

## Protected release credentials

The `release-signing` GitHub environment permits only `v*` tags. Signing jobs
require source that is already in `main`, and run after the regular platform CI
jobs. Forks and ordinary pull-request builds receive no signing credentials.
Private keys and passwords must never be committed or bundled with the app.
Maintain encrypted certificate backups in the organization's secret manager.

Mac environment secrets are `CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_NAME`,
`CSC_INSTALLER_LINK`, `CSC_INSTALLER_KEY_PASSWORD`, `CSC_INSTALLER_NAME`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. The first
certificate must be Developer ID Application; the second must be Developer ID
Installer. Apple Development certificates cannot replace either. App Store
Connect API credentials remain an alternative for local release builds.

Windows uses Azure Artifact Signing with a validated Public Trust certificate
profile. The dedicated CI identity has only Certificate Profile Signer access
to the signing account and trusts this repository's `release-signing` environment
through GitHub OIDC. There is no Azure client password. Environment secrets are
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
`MATIQ_AZURE_SIGN_ENDPOINT`, `MATIQ_AZURE_SIGN_ACCOUNT`,
`MATIQ_AZURE_SIGN_PROFILE`, and `MATIQ_WINDOWS_PUBLISHER`. Set the publisher from
the approved certificate profile, not an invented marketing name. Resource and
account identifiers belong in deployment configuration, not this public guide.

Microsoft requires organization identity validation before public signing.
An account's existence does not mean a Public Trust profile is ready. Complete
any email/document checks requested in the Azure portal before a Windows release.
See [Microsoft's setup guide](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).

## Verification and publication

`npm run package:release` fails without the required credentials. It signs the
Mac app and native speech/input helpers and notarizes the app and PKG. Windows
signing covers the app, installer and native DLL/addon files. The native
verification scripts then require:

- Mac: expected Developer ID team, Hardened Runtime, valid app/helper and PKG
  signatures, stapled tickets, and successful Gatekeeper app/install assessments.
- Windows: valid Authenticode chain, the validated publisher and a timestamp on
  the installer and packaged EXE/DLL/native-addon files.

Packaged native inference must also pass. The publisher checks both verification
reports against the exact installer hashes before creating a stable release.
Missing or stale reports stop publication. Do not upload an unsigned replacement
to an existing signed release or change its tag to different source.

For preflight qualification, push a tag such as `v0.3.4-signing.1` pointing to
merged source. These validation tags do not publish automatically. Dispatch the
checks workflow at that tag with `signing=mac`, `windows`, or `both`. The same
protected environment and native checks apply; the run publishes nothing. The
validation tag must have the current workflow because older tags retain their
older workflow definition. After both platforms qualify, push the stable tag
matching `package.json`, for example `v0.3.4`, to publish tested signed downloads.

Windows SmartScreen reputation is separate from Authenticode and may still warn
for a newly signed application. Normal administrator, microphone, Accessibility
and managed-device prompts also remain. Do not promise that signing removes
every operating-system prompt or tell users to disable protections globally.

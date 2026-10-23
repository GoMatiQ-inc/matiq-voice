# OAuth registration and customer distribution

MatiQ owns the provider registrations. Customers click Connect Microsoft or
Connect Google in the installed app; they do not enter IDs, install SDKs, or
provide application secrets. The application uses the system browser, PKCE
S256, random state, and a short-lived IPv4 loopback listener. It consumes no
unverified ID-token claims: the account profile comes from the provider API
using the access token. Tokens remain in the main process and are stored with
Electron's asynchronous safeStorage API (Keychain on Mac, DPAPI on Windows).
If protection is unavailable, connecting fails rather than writing plaintext.

## Microsoft

Create a dedicated **MatiQ Voice** public/native client in the owning Entra
tenant. Configure work/school accounts from multiple organizations. Register
`http://localhost` as the system-browser public-client redirect; the desktop
listener selects a temporary port. Do not configure an SPA or require a client
secret. Request delegated `User.Read` and `Calendars.Read`, with the
`openid profile offline_access` protocol scopes. The runtime authority is
`organizations`; this build targets organizational Teams accounts.

Publisher/domain verification, consent policy, and admin approval must be
qualified against real customer tenants. A successful local test provider is
not proof that a tenant permits these scopes. Disconnect removes local tokens;
it does not revoke every session in the user's Microsoft account.

## Google

Choose the owning Google Cloud project. Enable Google Calendar API. Configure
Google Auth Platform branding/audience and a **Desktop app** OAuth client.
Use the exact public app name MatiQ Voice and verified MatiQ-owned domains,
support contact, privacy policy and terms destinations. External users require
the appropriate published consent configuration and verification of the
requested sensitive calendar scope; test-user access is not a public launch.

Scopes: `openid email profile` and
`https://www.googleapis.com/auth/calendar.events.readonly`. Loopback redirects
use `http://127.0.0.1:<temporary-port>/`. The Google desktop credential can include
its generated desktop client secret: Google explicitly treats installed
applications as public clients unable to keep that value confidential. This
value is registration metadata, never a backend/server credential or a token.
Do not put a web-client secret in this app. Request offline access so the
provider may grant a refresh token. Google access is revoked on disconnect;
failed remote revocation is reported after local credentials are removed.

## Build configuration

Provide registration metadata via the build environment and run:

```sh
npm run oauth:configure
```

Variables:

- `MATIQ_MICROSOFT_CLIENT_ID`: public/native Entra application client ID.
- `MATIQ_GOOGLE_CLIENT_ID`: Google Desktop client ID.
- `MATIQ_GOOGLE_DESKTOP_CLIENT_SECRET`: generated Google Desktop metadata, if
  required by that registration. Never use a confidential web-client secret.

The command writes ignored `config/oauth.json` without printing values. That
file is included in the installed app. The account screen contains no client-ID
inputs or endpoint configuration. Missing configuration produces an explicit
connection-unavailable error; it never displays a fictitious connected account.
Tokens, refresh tokens, authorization codes and PKCE verifiers are never put in
source, renderer state, logs, URLs sent to the renderer, or public app settings.
The loopback callback validates state and does not reflect codes into HTML.

## What the connection provides

The app reads upcoming primary-calendar meetings, presents Teams/Meet links,
and opens a selected link in the system browser. That browser handles the
provider's actual meeting session. OAuth does not make the desktop app an
independent meeting participant or authorize arbitrary raw meeting media.
Meeting audio is captured locally while the user attends. It is never uploaded
by MatiQ Voice. A separate, independently joining bot remains a separate
platform integration and hosting decision.

## Validation still required for a public launch

Real consent, cancellation, expiration/refresh and revoked-account behavior
must pass for both registrations and appropriate test tenants/projects. Confirm
external-user verification, publisher identity, correct branding and support /
privacy destinations. No registrations are fabricated in this repository.
The E2E suite uses real loopback HTTP and PKCE against explicitly local test
providers; it cannot replace these external-provider acceptance tests.

Sources: [Microsoft desktop authorization](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

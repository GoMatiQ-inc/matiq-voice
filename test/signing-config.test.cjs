const test = require('node:test');
const assert = require('node:assert/strict');
const {signingArgs} = require('../scripts/signing-config.cjs');
const config = {microsoft:{clientId:'00000000-0000-0000-0000-000000000001'}, google:{clientId:'fixture.apps.googleusercontent.com'}};
const mac = {CSC_NAME:'Developer ID Application: Fixture (TESTTEAM01)', CSC_INSTALLER_NAME:'Developer ID Installer: Fixture (TESTTEAM01)', APPLE_ID:'fixture@example.test', APPLE_APP_SPECIFIC_PASSWORD:'unit-test-only-password', APPLE_TEAM_ID:'TESTTEAM01'};
test('Mac signing requires both public-distribution certificates and notarization credentials', () => {
  assert.throws(() => signingArgs('darwin', {...mac, CSC_NAME:'Apple Development: Fixture'}, config), /both Developer ID/);
  assert.throws(() => signingArgs('darwin', {...mac, CSC_INSTALLER_NAME:''}, config), /both Developer ID/);
  assert.throws(() => signingArgs('darwin', {...mac, APPLE_APP_SPECIFIC_PASSWORD:''}, config), /notarization credentials/);
  const args = signingArgs('darwin', mac, config);
  assert.ok(args.includes('--config.mac.notarize=true')); assert.ok(args.some(x => x.endsWith('/mac-keys')));
  assert.ok(!args.join(' ').includes(mac.APPLE_APP_SPECIFIC_PASSWORD));
});
test('Azure Windows signing rejects partial profiles and untrusted endpoints', () => {
  const env = {AZURE_CLIENT_ID:'fixture-client', AZURE_TENANT_ID:'fixture-tenant', MATIQ_AZURE_SIGN_ENDPOINT:'https://eus.codesigning.azure.net', MATIQ_AZURE_SIGN_ACCOUNT:'fixture-account', MATIQ_AZURE_SIGN_PROFILE:'fixture-profile', MATIQ_WINDOWS_PUBLISHER:'Fixture Publisher'};
  assert.throws(() => signingArgs('win32', {...env, MATIQ_WINDOWS_PUBLISHER:''}, config), /validated Azure signing/);
  assert.throws(() => signingArgs('win32', {...env, MATIQ_AZURE_SIGN_ENDPOINT:'https://example.test'}, config), /official regional/);
  const args = signingArgs('win32', env, config); assert.ok(args.includes('--config.win.signExts.1=.node'));
  assert.ok(args.includes('--config.win.azureSignOptions.publisherName=Fixture Publisher'));
});
test('signed releases fail without real provider configuration or supported signer', () => {
  assert.throws(() => signingArgs('darwin', mac, {}), /OAuth registrations/);
  assert.throws(() => signingArgs('win32', {}, config), /signing certificate/);
  assert.throws(() => signingArgs('linux', {}, config), /supported macOS or Windows/);
});

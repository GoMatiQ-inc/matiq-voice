const test = require('node:test');
const assert = require('node:assert/strict');
const {signingConfig} = require('../scripts/signing-config.cjs');
const config = {microsoft:{clientId:'00000000-0000-0000-0000-000000000001'}, google:{clientId:'fixture.apps.googleusercontent.com'}};
const mac = {CSC_NAME:'Developer ID Application: Fixture (TESTTEAM01)', CSC_INSTALLER_NAME:'Developer ID Installer: Fixture (TESTTEAM01)', APPLE_ID:'fixture@example.test', APPLE_APP_SPECIFIC_PASSWORD:'unit-test-only-password', APPLE_TEAM_ID:'TESTTEAM01'};
test('Mac signing requires both public-distribution certificates and notarization credentials', () => {
  assert.throws(() => signingConfig('darwin', {...mac, CSC_NAME:'Apple Development: Fixture'}, config), /both Developer ID/);
  assert.throws(() => signingConfig('darwin', {...mac, CSC_INSTALLER_NAME:''}, config), /both Developer ID/);
  assert.throws(() => signingConfig('darwin', {...mac, APPLE_APP_SPECIFIC_PASSWORD:''}, config), /notarization credentials/);
  const result = signingConfig('darwin', mac, config);
  assert.equal(result.mac.identity, 'Fixture (TESTTEAM01)'); assert.equal(result.pkg.identity, 'Fixture (TESTTEAM01)');
  assert.equal(result.extraMetadata.matiqOfficialUpdates, true); assert.equal(result.publish[0].repo, 'matiq-voice');
  assert.equal(result.mac.notarize, true); assert.ok(result.mac.binaries.includes('Contents/Resources/engine/mac-keys'));
  assert.ok(!JSON.stringify(result).includes(mac.APPLE_APP_SPECIFIC_PASSWORD));
});
test('Azure Windows signing rejects partial profiles and untrusted endpoints', () => {
  const env = {AZURE_CLIENT_ID:'fixture-client', AZURE_TENANT_ID:'fixture-tenant', MATIQ_AZURE_SIGN_ENDPOINT:'https://eus.codesigning.azure.net', MATIQ_AZURE_SIGN_ACCOUNT:'fixture-account', MATIQ_AZURE_SIGN_PROFILE:'fixture-profile', MATIQ_WINDOWS_PUBLISHER:'Fixture Publisher'};
  assert.throws(() => signingConfig('win32', {...env, MATIQ_WINDOWS_PUBLISHER:''}, config), /validated Azure signing/);
  assert.throws(() => signingConfig('win32', {...env, MATIQ_AZURE_SIGN_ENDPOINT:'https://example.test'}, config), /official regional/);
  const result = signingConfig('win32', env, config); assert.deepEqual(result.win.signExts, ['.dll', '.node']);
  assert.equal(result.win.azureSignOptions.publisherName, 'Fixture Publisher');
  assert.equal(result.win.publisherName, 'Fixture Publisher'); assert.equal(result.win.verifyUpdateCodeSignature,true);
});
test('signed releases fail without real provider configuration or supported signer', () => {
  assert.throws(() => signingConfig('darwin', mac, {}), /OAuth registrations/);
  assert.throws(() => signingConfig('win32', {}, config), /signing certificate/);
  assert.throws(() => signingConfig('linux', {}, config), /supported macOS or Windows/);
});

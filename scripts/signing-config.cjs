function signingConfig(platform, env, config) {
  if (!/^[0-9a-f-]{36}$/i.test(config.microsoft?.clientId || '') || !/\.apps\.googleusercontent\.com$/.test(config.google?.clientId || '')) throw new Error('Configure both real OAuth registrations before a customer release.');
  const result = {forceCodeSigning: true, extraMetadata: {matiqOfficialUpdates: true}, publish: [{provider: 'github', owner: 'GoMatiQ-inc', repo: 'matiq-voice'}]};
  if (platform === 'darwin') {
    if (!env.CSC_NAME?.startsWith('Developer ID Application:') || !env.CSC_INSTALLER_NAME?.startsWith('Developer ID Installer:')) throw new Error('Provide both Developer ID Application and Developer ID Installer identities.');
    if (!(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) && !(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)) throw new Error('Configure Apple notarization credentials; unsigned or unnotarized releases are not permitted.');
    result.mac = {identity: env.CSC_NAME.slice('Developer ID Application:'.length).trim(), notarize: true, binaries: ['whisper-cli', 'mac-input', 'mac-keys'].map(name => `Contents/Resources/engine/${name}`)};
    result.pkg = {identity: env.CSC_INSTALLER_NAME.slice('Developer ID Installer:'.length).trim()};
  } else if (platform === 'win32') {
    result.win = {signExts: ['.dll', '.node']};
    const azure = ['MATIQ_AZURE_SIGN_ENDPOINT', 'MATIQ_AZURE_SIGN_ACCOUNT', 'MATIQ_AZURE_SIGN_PROFILE', 'MATIQ_WINDOWS_PUBLISHER'];
    if (azure.slice(0, 3).some(name => env[name])) {
      if (!azure.every(name => env[name]) || !env.AZURE_CLIENT_ID || !env.AZURE_TENANT_ID) throw new Error('Configure the validated Azure signing profile, publisher and OIDC identity before signing.');
      if (!/^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/.test(env.MATIQ_AZURE_SIGN_ENDPOINT)) throw new Error('Use the official regional Azure code-signing HTTPS endpoint.');
      result.win.azureSignOptions = {endpoint: env.MATIQ_AZURE_SIGN_ENDPOINT, codeSigningAccountName: env.MATIQ_AZURE_SIGN_ACCOUNT, certificateProfileName: env.MATIQ_AZURE_SIGN_PROFILE, publisherName: env.MATIQ_WINDOWS_PUBLISHER};
    } else {
      if (!env.WIN_CSC_LINK && !env.CSC_LINK) throw new Error('Configure Azure Artifact Signing or an existing Windows signing certificate.');
      if (!env.MATIQ_WINDOWS_PUBLISHER) throw new Error('Configure the expected Windows publisher before enabling signed updates.');
    }
    result.win.publisherName = env.MATIQ_WINDOWS_PUBLISHER;
    result.win.verifyUpdateCodeSignature = true;
  } else throw new Error('Build signed releases on supported macOS or Windows hosts.');
  return result;
}
module.exports = {signingConfig};

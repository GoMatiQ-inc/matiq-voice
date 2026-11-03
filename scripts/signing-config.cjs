function signingArgs(platform, env, config) {
  if (!/^[0-9a-f-]{36}$/i.test(config.microsoft?.clientId || '') || !/\.apps\.googleusercontent\.com$/.test(config.google?.clientId || '')) throw new Error('Configure both real OAuth registrations before a customer release.');
  const args = ['--publish', 'never', '--config.forceCodeSigning=true'];
  if (platform === 'darwin') {
    if (!env.CSC_NAME?.startsWith('Developer ID Application:') || !env.CSC_INSTALLER_NAME?.startsWith('Developer ID Installer:')) throw new Error('Provide both Developer ID Application and Developer ID Installer identities.');
    if (!(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) && !(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)) throw new Error('Configure Apple notarization credentials; unsigned or unnotarized releases are not permitted.');
    args.push(`--config.mac.identity=${env.CSC_NAME}`, `--config.pkg.identity=${env.CSC_INSTALLER_NAME}`, '--config.mac.notarize=true');
    for (const [index, name] of ['whisper-cli', 'mac-input', 'mac-keys'].entries()) args.push(`--config.mac.binaries.${index}=Contents/Resources/engine/${name}`);
  } else if (platform === 'win32') {
    const azure = ['MATIQ_AZURE_SIGN_ENDPOINT', 'MATIQ_AZURE_SIGN_ACCOUNT', 'MATIQ_AZURE_SIGN_PROFILE', 'MATIQ_WINDOWS_PUBLISHER'];
    if (azure.some(name => env[name])) {
      if (!azure.every(name => env[name]) || !env.AZURE_CLIENT_ID || !env.AZURE_TENANT_ID) throw new Error('Configure the validated Azure signing profile, publisher and OIDC identity before signing.');
      if (!/^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/.test(env.MATIQ_AZURE_SIGN_ENDPOINT)) throw new Error('Use the official regional Azure code-signing HTTPS endpoint.');
      args.push(`--config.win.azureSignOptions.endpoint=${env.MATIQ_AZURE_SIGN_ENDPOINT}`, `--config.win.azureSignOptions.codeSigningAccountName=${env.MATIQ_AZURE_SIGN_ACCOUNT}`, `--config.win.azureSignOptions.certificateProfileName=${env.MATIQ_AZURE_SIGN_PROFILE}`, `--config.win.azureSignOptions.publisherName=${env.MATIQ_WINDOWS_PUBLISHER}`);
    } else if (!env.WIN_CSC_LINK && !env.CSC_LINK) throw new Error('Configure Azure Artifact Signing or an existing Windows signing certificate.');
    args.push('--config.win.signExts.0=.dll', '--config.win.signExts.1=.node');
  } else throw new Error('Build signed releases on supported macOS or Windows hosts.');
  return args;
}
module.exports = {signingArgs};

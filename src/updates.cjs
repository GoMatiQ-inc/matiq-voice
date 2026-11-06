// Update installation is explicit and only allowed while all audio work is idle.
function createUpdates({updater, enabled, isIdle, emit}) {
  let status = {phase: enabled ? 'idle' : 'disabled', message: enabled ? 'Updates are checked automatically.' : 'Automatic updates are available in official signed releases.'};
  let busy = false, downloaded = false, installing = false;
  const listeners = [];
  const publish = patch => { status = {...status, ...patch}; emit({...status}); };
  const fail = error => publish({phase: 'error', message: installing ? `Update installation failed: ${error.message}. Quit and reopen MatiQ Voice before recording again.` : `Update failed. Check your connection and try again: ${error.message}`});
  if (enabled) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableDifferentialDownload = true;
    updater.setFeedURL({provider: 'github', owner: 'GoMatiQ-inc', repo: 'matiq-voice'});
    const on = (name, fn) => { updater.on(name, fn); listeners.push([name, fn]); };
    on('error', fail);
    on('download-progress', progress => publish({phase: 'downloading', message: `Downloading update · ${Math.floor(progress.percent)}%`}));
    on('update-downloaded', info => { downloaded = true; publish({phase: 'ready', version: info.version, message: 'Update ready. Restart when your recording and transcription are finished.'}); });
  }
  async function check() {
    if (!enabled || busy || downloaded || installing) return {...status};
    busy = true;
    publish({phase: 'checking', message: 'Checking for updates…'});
    try {
      const result = await updater.checkForUpdates();
      // electron-updater only supplies cancellationToken when a newer release exists.
      if (!result?.cancellationToken) publish({phase: 'current', message: 'MatiQ Voice is up to date.'});
      else {
        publish({phase: 'downloading', version: result.updateInfo.version, message: 'Downloading update…'});
        await updater.downloadUpdate(result.cancellationToken);
      }
    } catch (error) { fail(error); }
    finally { busy = false; }
    return {...status};
  }
  function install() {
    if (!enabled || !downloaded || installing) throw new Error('Download an update before restarting.');
    if (!isIdle()) throw new Error('Finish dictation, meeting recording and transcription before restarting to update.');
    installing = true;
    publish({phase: 'installing', message: 'Verifying the update and restarting MatiQ Voice…'});
    try { updater.quitAndInstall(false, true); }
    catch (error) { installing = false; fail(error); throw error; }
  }
  return {check, install, get installing() { return installing; }, get status() { return {...status}; }, dispose() { for (const [name, fn] of listeners) updater.removeListener(name, fn); }};
}
module.exports = {createUpdates};

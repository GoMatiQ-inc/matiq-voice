const {app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, ipcMain, clipboard, session, systemPreferences, shell, dialog} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {MODELS, DEFAULT_SETTINGS, MAX_SECONDS, validateSettings, validateWav} = require('./core.cjs');
const {run, downloadModel, transcribe} = require('./engine.cjs');

app.setName('Verbatim');
if (!app.requestSingleInstanceLock()) app.quit();
else start().catch(error => { dialog.showErrorBox('Verbatim could not start', error.message); app.quit(); });

async function start() {
  await app.whenReady();
  const dataDir = app.getPath('userData');
  const modelDir = path.join(dataDir, 'models');
  const jobsDir = path.join(dataDir, 'temporary-recordings');
  const settingsFile = path.join(dataDir, 'settings.json');
  const engineDir = app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(__dirname, '..', 'engine');
  const binary = path.join(engineDir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
  const pageURL = pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href;
  let settings = {...DEFAULT_SETTINGS}, startupNotice = '';
  try { settings = validateSettings(JSON.parse(await fs.readFile(settingsFile, 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') startupNotice = `Settings could not be read: ${error.message} Choose your settings and save them again.`;
  }
  // The single-instance lock makes these leftovers exclusively ours.
  await fs.rm(jobsDir, {recursive: true, force: true});
  await fs.mkdir(jobsDir, {recursive: true, mode: 0o700});
  let state = 'idle', lastTranscript = '', lastAudio = null, target = null;
  let operation = null, quitting = false, shortcutReady = false, generation = 0;
  const win = new BrowserWindow({
    width: 820, height: 810, minWidth: 620, minHeight: 700,
    title: 'Verbatim', backgroundColor: '#eef2f6', show: false,
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false}
  });
  win.setMenuBarVisibility(false);
  const send = message => { if (!win.isDestroyed()) win.webContents.send('app-event', message); };
  const notice = message => send({type: 'notice', message});
  const icon = nativeImage.createFromPath(path.join(__dirname, 'ui', 'tray.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  const tray = new Tray(icon);
  const show = () => { win.show(); win.focus(); };
  function setState(next) {
    state = next;
    tray.setToolTip(`Verbatim — ${next}`);
    if (process.platform === 'darwin') tray.setTitle(next === 'recording' ? '●' : next === 'processing' ? '…' : '');
    send({type: 'state', state});
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    {label: 'Open Verbatim', click: show},
    {label: 'Start / stop dictation', click: () => send({type: 'toggle'})},
    {label: 'Cancel dictation', click: () => send({type: 'cancel'})},
    {type: 'separator'},
    {label: 'Quit Verbatim', click: () => app.quit()}
  ]));
  tray.on('double-click', show);
  win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  app.on('activate', show);
  app.on('second-instance', show);
  app.on('before-quit', () => { quitting = true; operation?.abort(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  const isOwnFrame = frame => frame?.url === pageURL;
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === win.webContents && isOwnFrame(contents.mainFrame) && permission === 'media' &&
      details.mediaTypes?.length > 0 && details.mediaTypes.every(type => type === 'audio'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) =>
    contents === win.webContents && isOwnFrame(contents.mainFrame) && permission === 'media' && details.mediaType === 'audio');
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('render-process-gone', (_, details) => {
    operation?.abort(); target = null; setState('idle');
    dialog.showMessageBox({type: 'error', message: 'The recording window stopped.', detail: `Reason: ${details.reason}. Any recording still in progress was lost. Reopen Verbatim to record again.`, buttons: ['Reload', 'Quit']})
      .then(({response}) => response === 0 ? win.reload() : app.quit());
  });
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (event.sender !== win.webContents || !isOwnFrame(event.senderFrame)) throw new Error('Untrusted application frame.');
      return fn(...args);
    });
  }
  async function ready() {
    let modelReady = false, engineReady = false;
    try { modelReady = (await fs.stat(path.join(modelDir, `ggml-${settings.model}.bin`))).size === MODELS[settings.model].bytes; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.access(binary); engineReady = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return {modelReady, engineReady};
  }
  async function input(action, targetId) {
    if (process.platform === 'darwin') return run(path.join(engineDir, 'mac-input'), [action, ...(targetId ? [targetId] : [])], {timeout: 10000});
    const windowsScript = app.isPackaged ? path.join(process.resourcesPath, 'native', 'windows-input.ps1') : path.join(__dirname, '..', 'native', 'windows-input.ps1');
    if (process.platform === 'win32') return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsScript, '-Action', action, ...(targetId ? ['-TargetWindow', targetId] : [])], {timeout: 10000});
    throw new Error('This build supports macOS and Windows.');
  }
  async function recognize() {
    const controller = new AbortController();
    operation = controller;
    setState('processing');
    try {
      const text = await transcribe({binary, model: path.join(modelDir, `ggml-${settings.model}.bin`), audio: lastAudio, directory: jobsDir, signal: controller.signal});
      if (controller.signal.aborted) return;
      lastTranscript = text;
      lastAudio = null;
      send({type: 'transcript', text});
      if (!text) { notice('The recognizer returned no words. Try again closer to the microphone.'); return; }
      if (settings.autoPaste && target) {
        clipboard.writeText(text);
        try { await input('paste', target); notice('Paste shortcut sent. Your transcript is also available to copy.'); }
        catch (error) { notice(`Text was recognized, but automatic paste failed: ${error.message}`); }
      } else notice('Transcript ready. Use Copy to paste it into another app.');
    } catch (error) {
      if (!controller.signal.aborted) { notice(`Transcription failed: ${error.message} Your recording is kept in memory; use Retry.`); throw error; }
    } finally {
      operation = null; target = null; setState('idle');
    }
  }
  handle('status', async () => ({state, settings, models: MODELS, maxSeconds: MAX_SECONDS, lastTranscript,
    canRetry: Boolean(lastAudio), shortcutReady, startupNotice, platform: process.platform, ...(await ready())}));
  handle('settings', async value => {
    if (state !== 'idle') throw new Error('Finish or cancel dictation before changing settings.');
    const next = validateSettings(value);
    await fs.writeFile(`${settingsFile}.tmp`, JSON.stringify(next, null, 2), {mode: 0o600});
    await fs.rename(`${settingsFile}.tmp`, settingsFile);
    settings = next; return ready();
  });
  handle('download', async () => {
    if (state !== 'idle') throw new Error('Finish the current operation first.');
    operation = new AbortController(); setState('downloading');
    try { await downloadModel(settings.model, modelDir, percent => send({type: 'download', percent}), operation.signal); notice('Model verified. Dictation can now run offline.'); }
    finally { operation = null; setState('idle'); }
    return ready();
  });
  handle('begin', async () => {
    if (state !== 'idle') throw new Error('Finish the current operation first.');
    const ticket = ++generation;
    setState('preparing');
    try {
      const availability = await ready();
      if (ticket !== generation) throw new Error('Recording was cancelled.');
      if (!availability.engineReady) throw new Error('The speech engine is missing. Install a complete Verbatim build, or run npm run engine:build when developing.');
      if (!availability.modelReady) throw new Error('Download the selected model before recording.');
      lastAudio = null; target = null;
      let destination = null;
      if (!win.isFocused() && settings.autoPaste) {
        try { destination = await input('capture'); }
        catch (error) { notice(`Automatic paste is unavailable: ${error.message} You can still record and copy your transcript.`); }
      }
      if (ticket !== generation) throw new Error('Recording was cancelled.');
      target = destination;
      return {maxSeconds: MAX_SECONDS};
    } catch (error) {
      if (ticket === generation) { target = null; setState('idle'); }
      throw error;
    }
  });
  handle('recording-ready', () => {
    if (state !== 'preparing') throw new Error('Recording was cancelled before the microphone became ready.');
    setState('recording');
  });
  handle('transcribe', async wav => {
    if (state !== 'recording') throw new Error('Start a recording before submitting audio.');
    try { lastAudio = validateWav(wav); }
    catch (error) { setState('idle'); throw error; }
    return recognize();
  });
  handle('retry', async () => {
    if (state !== 'idle' || !lastAudio) throw new Error('No failed recording is available to retry.');
    target = null; return recognize();
  });
  handle('cancel', () => {
    generation++;
    if (operation) { setState('cancelling'); operation.abort(); }
    else setState('idle');
    lastAudio = null; target = null;
  });
  handle('copy', () => { if (!lastTranscript) throw new Error('Record a transcript before copying.'); clipboard.writeText(lastTranscript); });
  handle('clear', () => {
    if (state !== 'idle') throw new Error('Finish the current operation before clearing.');
    lastTranscript = ''; lastAudio = null; send({type: 'transcript', text: ''});
  });
  handle('accessibility', async () => {
    if (process.platform === 'darwin') {
      systemPreferences.isTrustedAccessibilityClient(true);
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    } else notice('Windows may prevent pasting into apps running as administrator. Use Copy and paste manually in those apps.');
  });
  await win.loadURL(pageURL);
  shortcutReady = globalShortcut.register('CommandOrControl+Alt+Space', () => send({type: 'toggle'}));
  if (!globalShortcut.register('CommandOrControl+Alt+Escape', () => send({type: 'cancel'}))) {
    startupNotice += ' The cancel shortcut is unavailable. Use Cancel in the app or tray menu.';
  }
  show();
}

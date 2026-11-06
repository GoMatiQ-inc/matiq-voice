const {app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, ipcMain, clipboard, session, systemPreferences, shell, dialog, safeStorage, desktopCapturer, utilityProcess, powerSaveBlocker, powerMonitor, screen, autoUpdater: nativeUpdater} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {MODELS, DEFAULT_SETTINGS, MAX_SECONDS, validateSettings, validateWav} = require('./core.cjs');
const {transcribe} = require('./engine.cjs');
const {inspectHardware} = require('./hardware.cjs');
const {SPEAKER_MODELS,verifyAsset} = require('./assets.cjs');
const {sharedRoot,speechAsset,sharedDownloadAsset,adoptExistingAssets} = require('./shared-models.cjs');
const {EncryptedTokenStore, Connections, meetingURL} = require('./oauth.cjs');
const {MeetingStore} = require('./meetings.cjs');
const {captureTarget,readPasteAccess} = require('./input.cjs');
const {Keyboard} = require('./keyboard.cjs');
const {createUpdates} = require('./updates.cjs');
const {watch,hasExited,waitForExit} = require('./child-lifecycle.cjs');

function launch(options = {}) {
  app.setName('MatiQ Voice');
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  return start(options).catch(error => { dialog.showErrorBox('MatiQ Voice could not start', error.message); app.quit(); });
}
async function start(options) {
  const host = options.host;
  let lease,shuttingDown=false,checkingClose=false,disposed=false;
  const requests=new Set();
  const listeners = [];
  const ownedChildren = new Set();
  const trackChild=child=>{ownedChildren.add(watch(child));child.once("exit",()=>ownedChildren.delete(child));child.once("close",()=>ownedChildren.delete(child));return child;};
  const listen = (emitter,event,fn) => {emitter.on(event,fn);listeners.push([emitter,event,fn]);};
  await app.whenReady();
  if(!host)lease=await require("@matiq-solutions/runtime/tool-lease.cjs").acquireToolLease({root:path.join(app.getPath("appData"),"MatiQ Solutions","tool-locks"),id:"com.matiq.voice",owner:app.getName()});
  const dataDir = host?.dataDir || app.getPath('userData'); await fs.mkdir(dataDir, {recursive: true});
  const modelDir = path.join(dataDir, 'models'), jobsDir = path.join(dataDir, 'temporary-recordings');
  const settingsFile = path.join(dataDir, 'settings.json'), setupFile = path.join(dataDir, 'setup.json');
  const engineDir = host ? path.join(host.resourceDir,'engine') : app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(__dirname, '..', 'engine');
  const binary = path.join(engineDir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
  const pageURL = pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href;
  const hudURL = pathToFileURL(path.join(__dirname, 'ui', 'hud.html')).href;
  const hardware = await (options.inspectHardware || inspectHardware)(dataDir, engineDir);
  let settings = {...DEFAULT_SETTINGS, model: hardware.recommendation.model}, startupNotice = '';
  try { settings = validateSettings(JSON.parse(await fs.readFile(settingsFile, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') startupNotice = 'Saved preferences could not be read. Select and save your preferences again.'; }
  let setup = {completed: false, microphoneTested: false, permissionsReviewed: false, launchAtLogin: false};
  try { setup = {...setup, ...JSON.parse(await fs.readFile(setupFile, 'utf8'))}; }
  catch (error) { if (error.code !== 'ENOENT') startupNotice += ' Setup progress was damaged; complete setup again.'; }
  const familyModelRoot = host?.sharedModelRoot || options.sharedModelRoot || sharedRoot();
  let sharedModels = [];
  try { sharedModels = await adoptExistingAssets([...Object.keys(MODELS).map(speechAsset),...SPEAKER_MODELS],modelDir,familyModelRoot); }
  catch(error) { startupNotice += ` Model sharing could not finish: ${error.message}`; }
  const downloadAsset = (asset,directory,progress,signal) => sharedDownloadAsset(asset,directory,progress,signal,familyModelRoot);
  const saveJSON = async (filename, value) => { await fs.writeFile(`${filename}.tmp`, JSON.stringify(value, null, 2), {mode: 0o600}); await fs.rename(`${filename}.tmp`, filename); };
  let oauthConfig = options.oauthConfig || {};
  if (!options.oauthConfig) {
    try { oauthConfig = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'config', 'oauth.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('The account configuration is damaged. Reinstall MatiQ Voice.'); }
  }
  const connections = new Connections({config: oauthConfig, store: new EncryptedTokenStore(path.join(dataDir, 'credentials'), options.crypto || safeStorage), openBrowser: options.openBrowser || (url => shell.openExternal(url)), fetchImpl: options.fetchImpl || fetch, testEndpoints: options.testEndpoints || null});
  const meetings = new MeetingStore(path.join(dataDir, 'meetings')); await meetings.recover();
  await fs.rm(jobsDir, {recursive: true, force: true}); await fs.mkdir(jobsDir, {recursive: true, mode: 0o700});
  let state = 'idle', lastTranscript = '', lastAudio = null, target = null, savingSettings = false;
  let operation = null, quitting = false, shortcutReady = false, generation = 0, activeMeeting = null, worker = null, awake = null;
  const win = host?.window || new BrowserWindow({width: 1120, height: 820, minWidth: 840, minHeight: 640, title: 'MatiQ Voice', backgroundColor: '#ffffff', show: false,
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false}});
  const workspace = host?.view.webContents || win.webContents;
  const requireFrame=host?null:require("@matiq-solutions/runtime/trusted-frame.cjs").frameGuard(workspace,path.join(__dirname,"ui/index.html"));
  const hud = new BrowserWindow({width: 248, height: 60, frame: false, transparent: true, hasShadow: false, resizable: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: {preload: path.join(__dirname, 'hud-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false}});
  win.setMenuBarVisibility(false); hud.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true, skipTransformProcessType: true});
  const send = message => { if (!win.isDestroyed()) workspace.send('app-event', message); };
  const notice = message => send({type: 'notice', message});
  const nativeDir = host ? path.join(host.resourceDir,'native') : app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(__dirname, '..', 'native');
  const keyboard = new Keyboard({engineDir, nativeDir, spawnProcess:(...args)=>trackChild((options.keyboardSpawn||require("node:child_process").spawn)(...args)), bindings: settings.bindings, emit: event => {
    if (event.type === 'keyboard-status') shortcutReady = event.ready;
    send(event);
  }});
  listen(win,'blur', () => { if (keyboard.router.recording) { keyboard.cancelRecord(); send({type:'binding-cancelled',message:'Binding recording cancelled when MatiQ Voice lost focus.'}); } });
  listen(powerMonitor,'suspend', () => keyboard.reset());
  listen(powerMonitor,'lock-screen', () => keyboard.reset());
  const icon = nativeImage.createFromPath(path.join(__dirname, 'ui', 'tray.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  const tray = new Tray(icon), show = () => { if(host)host.show();else{win.show();win.focus();} };
  let updateTimer, updateInterval;
  const updates = host ? {
    status: {phase:'suite',message:'Manage Voice in MatiQ Solutions → Downloads & updates.'},
    installing:false,
    check:async()=>updates.status,
    install:()=>{throw Error('Restart from MatiQ Solutions when all tools have finished their work.');},
    dispose:()=>{}
  } : createUpdates({updater: options.updater || (app.isPackaged ? require('electron-updater').autoUpdater : null), enabled: Boolean(options.updater) || (app.isPackaged && require('../package.json').matiqOfficialUpdates === true), isIdle: () => state === 'idle' && !activeMeeting, emit: update => { send({type: 'updates', update}); updateTray(); }});
  function updateTray() {
    tray.setToolTip(`MatiQ Voice — ${state}`);
    if (process.platform === 'darwin') tray.setTitle(['recording', 'meeting-recording'].includes(state) ? '●' : ['processing', 'meeting-processing'].includes(state) ? '…' : '');
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: 'Open MatiQ Voice', click: show},
      {label: state === 'recording' ? 'Stop dictation' : 'Start dictation', enabled: ['idle', 'recording'].includes(state), click: () => send({type: 'toggle'})},
      {label: activeMeeting ? 'Stop meeting recording' : 'Record meeting', enabled: state === 'idle' || state === 'meeting-recording', click: () => activeMeeting ? send({type: 'stop-meeting'}) : (show(), send({type: 'navigate', page: 'meetings'}))},
      {label: 'Copy last transcript', enabled: Boolean(lastTranscript), click: () => clipboard.writeText(lastTranscript)},
      {label: 'Settings', click: () => { show(); send({type: 'navigate', page: 'settings'}); }},
      {label: updates.status.phase === 'ready' ? 'Restart to update' : 'Check for updates', enabled: !updates.status.restartPending && (updates.status.phase === 'ready' ? state === 'idle' : !['disabled', 'checking', 'downloading'].includes(updates.status.phase)), click: () => { show(); send({type: 'navigate', page: 'settings'}); if (updates.status.phase === 'ready') installUpdate().catch(error=>notice(error.message)); else updates.check(); }},
      {type: 'separator'}, {label: host ? 'Close Voice' : 'Quit MatiQ Voice', click: () => host ? host.close().catch(error=>notice(error.message)) : app.quit()}
    ]));
  }
  function positionHud() {
    const {workArea} = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const [width, height] = hud.getSize();
    hud.setBounds({x: Math.round(workArea.x + (workArea.width - width) / 2), y: workArea.y + 10, width, height});
  }
  listen(screen,'display-metrics-changed', () => { if (hud.isVisible()) positionHud(); });
  listen(screen,'display-removed', () => { if (hud.isVisible()) positionHud(); });
  if(!host) {
  win.on('show', () => {
    win.setSkipTaskbar(false);
    if (process.platform === 'darwin') app.dock.show().catch(error => notice(`Could not show the Dock icon: ${error.message}`));
  });
  win.on('hide', () => {
    win.setSkipTaskbar(true);
    if (process.platform === 'darwin') app.dock.hide();
  });
  }
  function setState(next) {
    state = next; updateTray(); send({type: 'state', state});
    if (!hud.isDestroyed()) {
      hud.webContents.send('hud-state', {state});
      if (['preparing', 'recording', 'processing', 'meeting-preparing', 'meeting-recording', 'meeting-processing'].includes(state)) { if (!hud.isVisible()) positionHud(); hud.showInactive(); } else hud.hide();
    }
  }
  if (!host && process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'MatiQ Voice',submenu:[{role:'about'},{label:'Settings…',accelerator:'Command+,',click:()=>{show();send({type:'navigate',page:'settings'});}},{type:'separator'},{role:'quit',label:'Quit MatiQ Voice'}]},
    {role:'editMenu'},{role:'windowMenu'}
  ]));
  tray.on('double-click', show); updateTray();
  if(!host) {
  win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  nativeUpdater.on('before-quit-for-update', () => { if (updates.installing) quitting = true; });
  app.on('activate', show); app.on('second-instance', show);
  app.on('before-quit', event => {
    if (activeMeeting && ['meeting-recording', 'meeting-preparing', 'meeting-paused'].includes(state) && !quitting) { event.preventDefault(); send({type: 'quit-after-meeting'}); show(); return; }
    if(quitting)return;event.preventDefault();if(checkingClose)return;checkingClose=true;
    prepareClose().then(async()=>{await dispose();quitting=true;app.quit();}).catch(async error=>{shuttingDown=disposed;if(!workspace.isDestroyed())await workspace.executeJavaScript('document.documentElement.inert=false');notice(error.message);show();}).finally(()=>{checkingClose=false;});
  });
  app.on('will-quit', () => { clearTimeout(updateTimer); clearInterval(updateInterval); updates.dispose(); keyboard.stop(); globalShortcut.unregisterAll(); });
  }
  const isOwnFrame = frame => frame?.url === pageURL;
  (host?.session || session.defaultSession).setPermissionRequestHandler((contents, permission, callback, details) => {
    const own = contents === workspace && isOwnFrame(contents.mainFrame);
    const allowed = permission === 'media' && details.mediaTypes?.length && details.mediaTypes.every(type => type === 'audio' || (type === 'video' && activeMeeting));
    callback(Boolean(own && (allowed || (permission === 'display-capture' && activeMeeting))));
  });
  (host?.session || session.defaultSession).setPermissionCheckHandler((contents, permission, origin, details) => Boolean(contents === workspace && isOwnFrame(contents.mainFrame) &&
    ((permission === 'media' && (details.mediaType === 'audio' || (details.mediaType === 'video' && activeMeeting))) || (permission === 'display-capture' && activeMeeting))));
  (host?.session || session.defaultSession).setDisplayMediaRequestHandler(async (request, callback) => {
    if (!activeMeeting || request.frame !== workspace.mainFrame) { callback({}); return; }
    try { const sources = await desktopCapturer.getSources({types: ['screen'], thumbnailSize: {width: 0, height: 0}}); if (!sources.length) throw new Error('No screen capture source is available.'); callback({video: sources[0], audio: 'loopback'}); }
    catch (error) { notice(`Meeting audio capture failed: ${error.message}`); callback({}); }
  }, {useSystemPicker: true});
  for (const window of [host ? {webContents:workspace} : win, hud]) { window.webContents.on('will-navigate', event => event.preventDefault()); window.webContents.setWindowOpenHandler(() => ({action: 'deny'})); }
  workspace.on('render-process-gone', (_, details) => {
    keyboard.cancelRecord();
    operation?.abort(); worker?.kill(); target?.cancel(); target = null; setState('idle');
    if (awake !== null) { powerSaveBlocker.stop(awake); awake = null; }
    const interrupted = activeMeeting; activeMeeting = null;
    Promise.resolve(interrupted ? meetings.stop(interrupted) : null).catch(error => dialog.showErrorBox('Meeting recovery failed', error.message));
    dialog.showMessageBox({type: 'error', message: 'The recording window stopped.', detail: `Reason: ${details.reason}. Completed meeting chunks remain on this computer. Unsaved audio in progress was lost.`, buttons: ['Reload', 'Quit']}).then(({response}) => response === 0 ? workspace.reload() : host ? host.close().catch(error=>notice(error.message)) : app.quit());
  });
  function handle(channel, fn) {
    const invoke=async(...args)=>{
      if(shuttingDown&&channel!=='quit')throw Error('Voice is closing or updating. Quit and reopen it before starting more work.');
      const request=Promise.resolve().then(()=>fn(...args));requests.add(request);
      try{return await request;}finally{requests.delete(request);}
    };
    if(host){host.handle(channel,invoke);return;}
    ipcMain.handle(channel, async(event,...args)=>{await requireFrame(event);return invoke(...args);});
  }
  listen(ipcMain,'hud-action', (event, action) => { if (event.sender !== hud.webContents || event.senderFrame?.url !== hudURL) return; if (action === 'stop') send({type: activeMeeting ? 'stop-meeting' : 'toggle'}); if (action === 'cancel' && !activeMeeting) send({type: 'cancel'}); });
  handle('meter', ({level, seconds}) => { if (!Number.isFinite(level) || !Number.isFinite(seconds)) return; hud.webContents.send('hud-meter', {level: Math.min(1, Math.max(0, level)), seconds: Math.max(0, seconds)}); });
  async function ready() {
    let modelReady = false, engineReady = false, speakerReady = true;
    modelReady = await verifyAsset(path.join(modelDir,`ggml-${settings.model}.bin`),speechAsset(settings.model));
    try { await fs.access(binary); engineReady = hardware.engineCompatible; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const asset of SPEAKER_MODELS) if(!await verifyAsset(path.join(modelDir,asset.file),asset)) speakerReady=false;
    return {modelReady, engineReady, speakerReady};
  }
  async function permissionStatus() {
    const microphone=systemPreferences.getMediaAccessStatus('microphone');
    if(process.platform!=='darwin') return {microphone,accessibility:true};
    try {return {microphone,...await readPasteAccess(path.join(engineDir,'mac-input'))};}
    catch(error) {return {microphone,accessibility:false,pasteError:`Could not check native paste access: ${error.message}`};}
  }
  async function input() {
    if (process.platform === 'darwin') return captureTarget(path.join(engineDir, 'mac-input'), ['session'],{onSpawn:trackChild});
    const script = path.join(nativeDir,'windows-input.ps1');
    return captureTarget('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', 'session'],{onSpawn:trackChild});
  }
  async function recognize() {
    const controller = new AbortController(); operation = controller; setState('processing');
    try {
      const text = await transcribe({binary, model: path.join(modelDir, `ggml-${settings.model}.bin`), audio: lastAudio, directory: jobsDir, signal: controller.signal});
      if (controller.signal.aborted) return;
      lastTranscript = text; lastAudio = null; send({type: 'transcript', text}); updateTray();
      if (!text) { notice('The recognizer returned no words. Try closer to the microphone.'); return; }
      if (settings.autoPaste && target) { clipboard.writeText(text); try { await target.paste(text); notice('Text insertion requested. Your transcript remains available to copy.'); } catch (error) { notice(`Text is ready, but paste failed: ${error.message}`); } }
      else notice('Transcript ready. Copy it into the text field you want.');
    } catch (error) { if (!controller.signal.aborted) { notice(`Recognition failed: ${error.message} Use Retry; your audio is retained in memory.`); throw error; } }
    finally { operation = null; target?.cancel(); target = null; setState('idle'); }
  }
  handle('update-check', () => updates.check());
  handle('update-install', () => {setImmediate(()=>installUpdate().catch(error=>notice(error.message)));return {requested:true};});
  handle('status', async () => ({updates: updates.status, state, settings, models: MODELS, maxSeconds: MAX_SECONDS, lastTranscript, canRetry: Boolean(lastAudio), shortcutReady, keyboardError: keyboard.error, startupNotice, platform: process.platform, packaged: app.isPackaged, hosted:Boolean(host),applicationName:app.getName(),installation:{version:host?.manifest.version||app.getVersion(),path:app.isPackaged?app.getPath('exe'):app.getAppPath()},
    hardware, setup, sharedModels, familyModelRoot, permissions: await permissionStatus(), connections: await connections.status(), activeMeeting, ...(await ready())}));
  handle('settings', async value => {
    if (state !== 'idle' || savingSettings) throw new Error('Wait for the current operation or preference save to finish.');
    savingSettings = true;
    try {
      const next = validateSettings({...value, bindings: value?.bindings ?? settings.bindings});
      if (next.microphone !== settings.microphone) {
        setup.microphoneTested = false; setup.completed = false; await saveJSON(setupFile, setup);
      }
      await saveJSON(settingsFile, next);
      settings = next; keyboard.configure(settings.bindings); updateTray(); return ready();
    } finally { savingSettings = false; }
  });
  handle('binding-record', mode => {
    if (!['toggle','hold'].includes(mode) || state !== 'idle' || !win.isFocused()) throw new Error('Open Settings and finish recording before choosing a binding.');
    keyboard.record(mode);
  });
  handle('binding-cancel', () => keyboard.cancelRecord());
  handle('show-app', () => {
    if (process.platform !== 'darwin') throw new Error('Use the installed Mac app when adding macOS permissions.');
    shell.showItemInFolder(path.resolve(app.getPath('exe'), '../../..'));
  });
  handle('keyboard-enable', async () => {
    if (process.platform === 'darwin' && !(await readPasteAccess(path.join(engineDir,'mac-input'),{request:true})).accessibility) {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      notice(`Turn on ${app.getName()} in Accessibility, then return and click Check keyboard access again. Use Show app in Finder to locate the installed app for the + picker.`);
      return {ready:false};
    }
    try { await keyboard.start({requestAccess:true}); }
    catch (error) {
      if (process.platform === 'darwin') {
        const pane=error.message.includes('Add the installed app')?'Privacy_Accessibility':'Privacy_ListenEvent';
        await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
      }
      throw error;
    }
    return {ready:keyboard.ready};
  });
  handle('download', async () => {
    if (updates.installing) throw new Error('MatiQ Voice is restarting to update.');
    if (state !== 'idle') throw new Error('Finish the current operation first.');
    operation = new AbortController(); setState('downloading');
    const speech = speechAsset(settings.model);
    try { const assets = [speech, ...SPEAKER_MODELS]; for (let i = 0; i < assets.length; i++) await (options.downloadAsset || downloadAsset)(assets[i], modelDir, percent => send({type: 'download', percent, file: assets[i].file, overall: Math.round((i * 100 + percent) / assets.length)}), operation.signal); sharedModels = await adoptExistingAssets(assets,modelDir,familyModelRoot); notice('Speech and speaker models verified. They can run offline.'); }
    finally { operation = null; setState('idle'); }
    return ready();
  });
  handle('setup-microphone-test', async input => {
    const wav = validateWav(input); let peak = 0;
    for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)) / 32768);
    if (wav.length < 44 + 32000 || peak < .005) throw new Error('No clear microphone signal was detected. Check the input, speak closer, and test again.');
    setup.microphoneTested = true; await saveJSON(setupFile, setup); return {peak};
  });
  handle('setup-complete', async () => {
    const availability = await ready();
    if (hardware.issues.length || !availability.engineReady || !availability.modelReady || !availability.speakerReady || !setup.microphoneTested) throw new Error('Complete the device, download, and microphone checks before finishing setup.');
    if (settings.autoPaste && !(await permissionStatus()).accessibility) throw new Error('Grant Accessibility permission or turn off automatic paste before finishing setup.');
    setup.completed = true; setup.permissionsReviewed = true; setup.version = 1; await saveJSON(setupFile, setup); return setup;
  });
  handle('login-at-startup', async enabled => { if (typeof enabled !== 'boolean' || !app.isPackaged) throw new Error('Launch at login is available in the installed MatiQ Voice app.'); app.setLoginItemSettings({openAtLogin: enabled}); setup.launchAtLogin = enabled; await saveJSON(setupFile, setup); });
  handle('begin', async () => {
    if (updates.installing) throw new Error('MatiQ Voice is restarting to update.');
    if (state !== 'idle') throw new Error('Finish the current operation first.');
    if (connections.pending.size) throw new Error('Finish or cancel account sign-in before recording.');
    if (!setup.completed) throw new Error('Complete setup before dictating.');
    const ticket = ++generation; setState('preparing');
    try {
      const availability = await ready(); if (ticket !== generation) throw new Error('Recording was cancelled.');
      if (!availability.engineReady || !availability.modelReady) throw new Error('The local speech engine or model is missing. Open Settings and run setup.');
      lastAudio = null; target = null; let destination = null;
      if (!win.isFocused() && settings.autoPaste) { try { destination = await input(); } catch (error) { notice(`Automatic paste is unavailable: ${error.message} You can still record and copy.`); } }
      if (ticket !== generation) { destination?.cancel(); throw new Error('Recording was cancelled.'); } target = destination; return {maxSeconds: MAX_SECONDS};
    } catch (error) { if (ticket === generation) { target = null; setState('idle'); } throw error; }
  });
  handle('recording-ready', () => { if (state !== 'preparing') throw new Error('Recording was cancelled.'); setState('recording'); });
  handle('transcribe', async wav => { if (state !== 'recording') throw new Error('Start recording before submitting audio.'); try { lastAudio = validateWav(wav); } catch (error) { setState('idle'); throw error; } return recognize(); });
  handle('retry', () => { if (state !== 'idle' || !lastAudio) throw new Error('No failed recording is available.'); target = null; return recognize(); });
  handle('cancel', () => { generation++; if (activeMeeting && state !== 'meeting-processing') throw new Error('Stop meeting recording to save its audio.'); if (operation) { setState('cancelling'); operation.abort(); } else if (worker) worker.kill(); else setState('idle'); lastAudio = null; target?.cancel(); target = null; });
  handle('copy', () => { if (!lastTranscript) throw new Error('No transcript is available.'); clipboard.writeText(lastTranscript); });
  handle('clear', () => { if (state !== 'idle') throw new Error('Finish the current operation before clearing.'); lastTranscript = ''; lastAudio = null; send({type: 'transcript', text: ''}); updateTray(); });
  handle('accessibility', async () => { if (process.platform === 'darwin') { await readPasteAccess(path.join(engineDir,'mac-input'),{request:true}); await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); } else notice('Windows can reject insertion into elevated or protected apps. Use Copy when necessary.'); });
  handle('oauth-connect', async id => { if (state !== 'idle') throw new Error('Finish recording before connecting an account.'); const result = await connections.connect(id); send({type: 'connections', connections: result}); return result; });
  handle('oauth-cancel', id => connections.cancel(id));
  handle('oauth-disconnect', async id => { const result = await connections.disconnect(id); send({type: 'connections', connections: await connections.status()}); return result; });
  handle('calendar-events', id => connections.events(id));
  handle('open-meeting', async url => shell.openExternal(meetingURL(url)));
  handle('meeting-list', () => meetings.list()); handle('meeting-get', id => meetings.get(id));
  handle('meeting-begin', async value => {
    if (updates.installing) throw new Error('MatiQ Voice is restarting to update.');
    if (state !== 'idle' || !setup.completed) throw new Error('Complete setup and finish other recording before starting a meeting.');
    if (connections.pending.size) throw new Error('Finish or cancel account sign-in before recording.');
    const availability = await ready(); if (!availability.modelReady || !availability.speakerReady) throw new Error('Download the local speech and speaker models first.');
    const meeting = await meetings.create({...value, url: value.url ? meetingURL(value.url) : ''}); activeMeeting = meeting.id; setState('meeting-preparing'); return meeting;
  });
  handle('meeting-ready', () => { if (!activeMeeting || state !== 'meeting-preparing') throw new Error('Meeting capture was cancelled.'); awake = powerSaveBlocker.start('prevent-app-suspension'); setState('meeting-recording'); });
  handle('meeting-chunk', (id, channel, sequence, wav) => { if (id !== activeMeeting || !['meeting-recording', 'meeting-paused', 'meeting-preparing'].includes(state)) throw new Error('This is not the active meeting.'); return meetings.append(id, channel, sequence, wav); });
  handle('meeting-pause', paused => { if (!activeMeeting || typeof paused !== 'boolean' || !['meeting-recording', 'meeting-paused'].includes(state)) throw new Error('No meeting is recording.'); setState(paused ? 'meeting-paused' : 'meeting-recording'); });
  handle('meeting-stop', async (id, problem = '') => {
    if (id !== activeMeeting) throw new Error('This meeting is not recording.');
    try {
      const result = await meetings.stop(id);
      if (problem) { result.status = 'interrupted'; result.error = String(problem).slice(0, 1000); await meetings.write(result); }
      return result;
    } finally {
      activeMeeting = null;
      if (awake !== null) { powerSaveBlocker.stop(awake); awake = null; }
      setState('idle');
    }
  });
  handle('meeting-process', async id => {
    if (state !== 'idle') throw new Error('Finish recording before processing a meeting.');
    const meeting = await meetings.get(id); if (!meeting.chunks.length) throw new Error('This meeting has no saved audio.');
    meeting.status = 'processing'; meeting.error = ''; await meetings.write(meeting); activeMeeting = id; setState('meeting-processing');
    try {
      const result = await new Promise((resolve, reject) => {
        worker = trackChild(utilityProcess.fork(path.join(__dirname, 'meeting-worker.cjs'), [], {serviceName: 'MatiQ Voice local meeting processing', stdio: 'pipe'}));
        worker.once('message', message => message.ok ? resolve(message.result) : reject(new Error(message.error)));
        worker.once('exit', code => reject(new Error(`Meeting worker stopped (${code}). Audio is retained; retry processing.`)));
        worker.once('spawn', () => worker.postMessage({directory: meetings.folder(id), binary, model: path.join(modelDir, `ggml-${settings.model}.bin`), models: modelDir}));
      });
      Object.assign(meeting, result, {status: 'ready'}); await meetings.write(meeting); return meeting;
    } catch (error) { meeting.status = 'error'; meeting.error = error.message; await meetings.write(meeting); throw error; }
    finally { worker?.kill(); worker = null; activeMeeting = null; setState('idle'); }
  });
  handle('meeting-speaker', (id, speaker, name) => meetings.renameSpeaker(id, speaker, name));
  handle('meeting-notes', (id, text) => meetings.setNotes(id, text));
  handle('meeting-delete', async id => { if (id === activeMeeting) throw new Error('Finish this meeting before deleting.'); await meetings.remove(id); });
  handle('meeting-export', async id => {
    const meeting = await meetings.get(id);
    const result = await dialog.showSaveDialog(win, {defaultPath: `${meeting.title.replace(/[^a-z0-9 -]/gi, '').slice(0, 80) || 'Meeting'}.md`, filters: [{name: 'Markdown', extensions: ['md']}]});
    if (result.canceled) return false;
    const text = [`# ${meeting.title}`, '', '## Transcript', ...meeting.segments.map(segment => `${Math.floor(segment.startMs / 60000)}:${String(Math.floor(segment.startMs / 1000) % 60).padStart(2, '0')} ${meeting.speakers[segment.speaker] || 'Unassigned'}: ${segment.text}`), '', '## Personal notes', meeting.personalNotes, '', '## Extracted notes', ...(meeting.notes?.actions || []).map(note => `- ${note.text} [${Math.floor(note.startMs / 1000)}s]`) ].join('\n');
    await fs.writeFile(result.filePath, text, {mode: 0o600}); return true;
  });
  handle('quit', () => {if(host)return host.close();setImmediate(()=>app.quit());return {requested:true};});
  try { await keyboard.start(); } catch (error) { startupNotice += ` ${error.message}`; }
  if (!globalShortcut.register('CommandOrControl+Alt+Backspace', () => send({type: 'cancel'}))) startupNotice += ' The cancel shortcut is unavailable. Use the app controls.';
  async function toolStatus(){
    if(disposed)return {busy:false,background:true};

      const busy=()=>state!=='idle'||Boolean(activeMeeting||operation||lastAudio||savingSettings||connections.pending.size||keyboard.router.recording);
      if(busy())return {busy:true,background:true,reason:state!=='idle'?state:lastAudio?'retry or clear retained audio':'finish pending work'};
      const editing=await workspace.executeJavaScript("Boolean([...document.querySelectorAll('#personal-notes,.speaker-row input')].some(input=>input.value!==input.defaultValue)||document.querySelector('#binding-dialog[open]'))");
      return {busy:busy()||editing,background:true,reason:editing?'save your meeting notes, speaker names or binding first':'finish pending work'};

  }
  async function prepareClose(){
    const initial=await toolStatus();if(initial.busy)throw Error('Finish Voice work before closing: '+initial.reason);
    await workspace.executeJavaScript('document.documentElement.inert=true');
    let timer;
    try{
      await Promise.race([Promise.allSettled([...requests]),new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);
      if(requests.size)throw Error('Wait for the current Voice request to finish before closing.');
      const final=await toolStatus();if(final.busy)throw Error('Finish Voice work before closing: '+final.reason);
      if(requests.size)throw Error('Wait for the current Voice request to finish before closing.');
      shuttingDown=true;
    }catch(error){await workspace.executeJavaScript('document.documentElement.inert=false');throw error;}
    finally{clearTimeout(timer);}
  }
  async function installUpdate(){
    if(host)return updates.install();
    if(updates.status.phase!=='ready')throw Error('Download an update before restarting.');
    await prepareClose();await dispose({forUpdate:true});quitting=true;
    try{return updates.install();}catch(error){quitting=false;notice('Update could not start. Quit and reopen Voice: '+error.message);throw error;}
  }
  async function dispose({forUpdate=false}={}){
      if(disposed)return;
      shuttingDown=true;
      clearTimeout(updateTimer);clearInterval(updateInterval);if(!forUpdate)updates.dispose();
      for(const [emitter,event,fn] of listeners)emitter.removeListener(event,fn);
      for(const provider of ['microsoft','google'])connections.cancel(provider);
      operation?.abort();target?.cancel();
      for(const child of [keyboard.child,worker].filter(Boolean))ownedChildren.add(watch(child));
      const stopped=[...ownedChildren].map(child=>waitForExit(child));
      for(const child of ownedChildren)if(child!==keyboard.child&&child!==worker&&!hasExited(child))child.kill();
      keyboard.stop();worker?.kill();await Promise.all(stopped);ownedChildren.clear();
      globalShortcut.unregister('CommandOrControl+Alt+Backspace');
      if(awake!==null)powerSaveBlocker.stop(awake);
      if(!forUpdate){hud.destroy();tray.destroy();}
      await lease?.release();disposed=true;
  }
  try {
  await hud.loadURL(hudURL); await workspace.loadURL(pageURL);
  if(!host)await require("@matiq-solutions/shell").apply(workspace);
  if(!host){updateTimer = setTimeout(() => updates.check(), 15000); updateTimer.unref();
  updateInterval = setInterval(() => updates.check(), 6 * 60 * 60 * 1000); updateInterval.unref();}
  show();
  } catch(error){await dispose();throw error;}
  return {
    status:toolStatus,
    onVisibility:visible=>{if(!visible&&keyboard.router.recording){keyboard.cancelRecord();send({type:'binding-cancelled',message:'Binding recording cancelled when you left Voice.'});}},
    dispose
  };
}
if (app.getAppPath() === path.resolve(__dirname,'..')) launch();
module.exports = {launch,start};

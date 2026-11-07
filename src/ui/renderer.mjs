import {captureAudio, microphone} from './capture.mjs';
const api = window.matiqVoice, $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
const size = bytes => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
let snapshot, state = 'idle', recorder = null, starting = false, generation = 0, currentPage = 'dictation';
let setupStep = 0, setupBusy = false, selectedMeeting = null, meetingTab = 'transcript', captures = [], meetingStopping = false, captureGeneration = 0;
const connecting = new Set();
const permissionText = text => snapshot?.hosted ? String(text).replaceAll('MatiQ Voice.app', snapshot.applicationName + '.app') : text;
const message = text => { $('notice').textContent = permissionText(text); $('notice').hidden = !text; };
const cleanError = error => permissionText(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
const showError = error => message(cleanError(error));
function setupError(error) { $('setup-error').textContent = cleanError(error); $('setup-error').hidden = false; }
function navigate(page) {
  currentPage = page;
  for (const element of document.querySelectorAll('.page')) element.hidden = element.id !== `page-${page}`;
  for (const button of document.querySelectorAll('[data-page]')) button.classList.toggle('active', button.dataset.page === page);
  $('page-title').textContent = {dictation: 'Dictation', meetings: 'Meetings', settings: 'Settings'}[page];
  if (page === 'meetings') loadMeetings().catch(showError);
}
function paint() {
  if (!snapshot) return;
  const idle = state === 'idle';
  $('record').disabled = starting || !snapshot.setup.completed || !snapshot.engineReady || !snapshot.modelReady || (!idle && state !== 'recording');
  $('record').textContent = state === 'recording' ? 'Stop & transcribe' : 'Start dictation';
  $('cancel').hidden = idle || state.startsWith('meeting');
  for (const id of ['model', 'microphone', 'autoPaste', 'save', 'refresh', 'clear', 'download', 'retry', 'new-meeting', 'record-toggle', 'record-hold', 'clear-toggle', 'clear-hold', 'keyboard-enable']) $(id).disabled = !idle || starting;
  $('download').textContent = snapshot.modelReady && snapshot.speakerReady ? 'Verify & repair' : 'Download & verify';
  $('copy').disabled = !$('transcript').value;
  const labels = {idle: snapshot.setup.completed ? 'Ready when you are.' : 'Complete setup to start dictating.', preparing: 'Preparing dictation…', recording: 'Listening. Your microphone is active.', processing: 'Transcribing on this device…', downloading: 'Downloading local models…', cancelling: 'Cancelling…', 'meeting-preparing': 'Preparing meeting capture…', 'meeting-recording': 'Recording meeting audio.', 'meeting-paused': 'Meeting recording paused.', 'meeting-processing': 'Processing meeting on this device…'};
  $('status').textContent = labels[state] || state;
  $('background-state').textContent = idle ? 'Local processing' : labels[state] || state;
  $('retry').hidden = !snapshot.canRetry;
  $('model-status').textContent = snapshot.modelReady && snapshot.speakerReady ? 'Speech and speaker models are installed. Recognition can run offline.' : 'Download the selected speech model and speaker models before completing setup.';
  $('launch-login').disabled = !snapshot.packaged || snapshot.hosted;
  $('launch-login').parentElement.hidden = Boolean(snapshot.hosted);
  if(snapshot.hosted){$('startup-help').textContent='Suite startup is managed in your operating system login/startup items. Open Voice in the suite to enable its background controls. Close Voice stops this tool; Quit MatiQ Solutions stops the suite.';$('quit-app').textContent='Close Voice';}
  $('quit-app').disabled = !idle || starting;
  const update = snapshot.updates;
  $('update-status').textContent = update.message;
  $('update-check').disabled = update.restartPending || ['disabled', 'checking', 'downloading', 'ready', 'installing'].includes(update.phase);
  $('update-install').hidden = update.phase !== 'ready';
  $('update-install').disabled = !idle || starting;
  $('installation').textContent = `Version ${snapshot.installation.version} · ${snapshot.installation.path}`;
  $('shortcut').textContent = `Toggle: ${bindingLabel(snapshot.settings.bindings.toggle)} · Hold: ${bindingLabel(snapshot.settings.bindings.hold)}`;
  for (const mode of ['toggle','hold']) $(`binding-${mode}`).textContent=bindingLabel(snapshot.settings.bindings[mode]);
  $('shortcut-status').textContent = snapshot.shortcutReady ? 'Keyboard access active. Bindings work while MatiQ Voice is in the background.' : permissionText(snapshot.keyboardError || 'Enable keyboard access to use background bindings.');
}
async function refresh() {
  snapshot = await api.status(); state = snapshot.state; paint();
  if(snapshot.hosted) $('keyboard-permission-help').textContent = $('keyboard-permission-help').textContent.replaceAll('MatiQ Voice',snapshot.applicationName);
  renderConnections($('connections')); $('hardware-settings').innerHTML = deviceHTML();
}
function bindingLabel(keys) {
  const names={MetaLeft:snapshot.platform==='darwin'?'Left Command':'Left Windows',MetaRight:snapshot.platform==='darwin'?'Right Command':'Right Windows',ControlLeft:'Left Control',ControlRight:'Right Control',AltLeft:snapshot.platform==='darwin'?'Left Option':'Left Alt',AltRight:snapshot.platform==='darwin'?'Right Option':'Right Alt',ShiftLeft:'Left Shift',ShiftRight:'Right Shift'};
  return keys.length ? keys.map(key=>names[key]||key.replace(/^Key|^Digit/,'').replace(/([a-z])([A-Z])/g,'$1 $2')).join(' + ') : 'Not set';
}
let bindingMode=null, candidateBinding=null, shortcutStopPending=false;
async function recordBinding(mode) {
  try {
    await api.recordBinding(mode);bindingMode=mode;candidateBinding=null;
    $('binding-title').textContent=mode==='hold'?'Record push-to-talk binding':'Record toggle binding';
    $('binding-live').textContent='Waiting for keys…';$('binding-error').hidden=true;$('binding-save').disabled=true;$('binding-dialog').showModal();
  } catch(error){showError(error);}
}
async function cancelBinding() {await api.cancelBinding();bindingMode=null;candidateBinding=null;$('binding-dialog').close();}
async function saveBinding(mode,keys) {
  await api.settings({...snapshot.settings,bindings:{...snapshot.settings.bindings,[mode]:keys}});await refresh();
}
function deviceHTML() {
  const h = snapshot.hardware;
  return `<div><span>Computer</span><strong>${escape(h.platform === 'darwin' ? 'Mac' : 'Windows')} · ${escape(h.arch)}</strong></div><div><span>Memory</span><strong>${size(h.memoryBytes)}</strong></div><div><span>Processor</span><strong>${escape(h.cpu)} · ${h.cores} cores</strong></div><div><span>Available at setup</span><strong>${size(h.freeBytes)}</strong></div><div><span>Bundled engine</span><strong>${h.engineCompatible ? 'Matches this computer' : 'Reinstall matching package'}</strong></div><div><span>Recommended model</span><strong>${escape(h.recommendation.model)}</strong></div>`;
}
async function microphones(request = false) {
  if (request) { const stream = await microphone(); stream.getTracks().forEach(track => track.stop()); }
  const selected = $('microphone').value || snapshot.settings.microphone;
  $('microphone').replaceChildren(new Option('System default', ''));
  const devices = await navigator.mediaDevices.enumerateDevices();
  for (const device of devices.filter(value => value.kind === 'audioinput' && value.deviceId)) $('microphone').add(new Option(device.label || `Microphone ${$('microphone').length}`, device.deviceId));
  if ([...$('microphone').options].some(option => option.value === selected)) $('microphone').value = selected;
}
async function savePreferences(overrides = {}) {
  await api.settings({model: $('model').value, microphone: $('microphone').value, autoPaste: $('autoPaste').checked, bindings: snapshot.settings.bindings, ...overrides});
  await refresh();
}
function renderConnections(target) {
  target.replaceChildren();
  for (const id of ['microsoft', 'google']) {
    const account = snapshot.connections[id], row = document.createElement('div'); row.className = 'account-row';
    row.innerHTML = `<div><strong>${id === 'microsoft' ? 'Microsoft Teams' : 'Google Meet'}</strong><p>${escape(account.connected ? account.email || account.name || 'Connected' : account.error || (account.configured ? 'Not connected' : 'Connection unavailable in this build'))}</p></div>`;
    const button = document.createElement('button'); button.textContent = connecting.has(id) ? 'Cancel sign-in' : (account.connected || account.hasCredentials) ? 'Disconnect' : `Connect ${id === 'microsoft' ? 'Microsoft' : 'Google'}`;
    button.dataset.provider = id;
    button.onclick = async () => {
      if (connecting.has(id)) { await api.cancelConnect(id); return; }
      if (account.connected || account.hasCredentials) { try { const result = await api.disconnect(id); await refresh(); message(result.message); if ($('setup-dialog').open) renderSetup(); } catch (error) { showError(error); } return; }
      connecting.add(id); renderConnections(target);
      try { await api.connect(id); await refresh(); message('Account connected. You can refresh upcoming meetings.'); }
      catch (error) { if ($('setup-dialog').open) setupError(error); else showError(error); }
      finally { connecting.delete(id); renderConnections(target); }
    };
    row.append(button); target.append(row);
  }
}
function openSetup() {
  if (state !== 'idle') { message('Finish the current operation before running setup.'); return; }
  setupStep = 0; $('setup-dialog').showModal(); renderSetup();
}
function renderSetup() {
  const content = $('setup-content'), h = snapshot.hardware;
  $('setup-error').hidden = true; $('setup-progress').textContent = `Step ${setupStep + 1} of 6`;
  $('setup-back').disabled = setupStep === 0 || setupBusy; $('setup-next').disabled = setupBusy;
  $('setup-next').textContent = setupStep === 5 ? 'Finish setup' : 'Continue';
  const titles = ['Check this computer', 'Install local models', 'Test your microphone', 'Set up text insertion', 'Connect your meetings', 'You’re ready'];
  $('setup-title').textContent = titles[setupStep];
  const introductions = ['We check memory, processor, disk space, and the bundled speech engine.', 'Models download once. The application and native software are already bundled.', 'Speak a short sentence. We check for a real audio signal; the test is not saved.', 'MatiQ Voice uses your original text field and keeps a copyable result if insertion fails.', 'Optional: connect calendars through your browser. Audio and transcripts stay local.', 'Dictation runs in the background. Closing the window keeps the menu-bar or tray icon.'];
  $('setup-intro').textContent = introductions[setupStep];
  if (setupStep === 0) {
    content.innerHTML = `<div class="device-grid">${deviceHTML()}</div><p class="caption">${escape(h.recommendation.reason)} ${escape(h.recommendation.performanceNote)}</p>${h.issues.map(issue => `<p class="error">${escape(issue)}</p>`).join('')}`;
    $('setup-next').disabled ||= h.issues.length > 0;
  } else if (setupStep === 1) {
    content.innerHTML = `<label for="setup-model">English speech model</label><select id="setup-model">${Object.entries(snapshot.models).map(([id, model]) => `<option value="${id}" ${id === snapshot.settings.model ? 'selected' : ''}>${escape(model.label)}</option>`).join('')}</select><p class="caption">Recommended: ${escape(h.recommendation.model)}. Speaker-label models add 33 MB. Downloads are verified by SHA-256.</p><button id="setup-download" class="primary" ${setupBusy ? 'disabled' : ''}>${snapshot.modelReady && snapshot.speakerReady ? 'Verify installed models' : 'Download recommended components'}</button><progress id="setup-download-progress" max="100" value="0"></progress><p id="setup-download-label" class="caption">${snapshot.modelReady && snapshot.speakerReady ? 'All required models are installed.' : 'Internet is needed for the download.'}</p>`;
    $('setup-model').onchange = async () => { try { $('model').value = $('setup-model').value; await savePreferences(); renderSetup(); } catch (error) { setupError(error); } };
    $('setup-download').onclick = async () => {
      setupBusy = true; renderSetup();
      try { await api.download(); await refresh(); setupBusy = false; renderSetup(); }
      catch (error) { await refresh(); setupBusy = false; renderSetup(); setupError(error); }
    };
    $('setup-next').disabled ||= !snapshot.modelReady || !snapshot.speakerReady;
  } else if (setupStep === 2) {
    content.innerHTML = `<p>Current input: ${escape($('microphone').selectedOptions[0]?.textContent || 'System default')}</p><button id="setup-test-microphone" ${setupBusy ? 'disabled' : ''}>${setupBusy ? 'Listening to the microphone…' : 'Test microphone'}</button><progress id="setup-microphone-level" max="1" value="0"></progress><p class="caption">${snapshot.setup.microphoneTested ? 'Audio signal detected. You can continue.' : 'The test listens for two seconds. Check your selected microphone in Settings if necessary.'}</p>`;
    $('setup-test-microphone').onclick = async () => {
      setupBusy = true; renderSetup(); let capture;
      try { capture = await captureAudio(await microphone(snapshot.settings.microphone), {maxSeconds: 5, onLevel: level => { const meter = $('setup-microphone-level'); if (meter) meter.value = level; }}); const deadline = performance.now() + 10000; while (capture.seconds < 2 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100)); if (capture.seconds < 2) throw new Error('The microphone is not supplying audio quickly enough. Check the selected input and test again.'); await api.microphoneTest(await capture.stop()); capture = null; await refresh(); setupBusy = false; renderSetup(); }
      catch (error) { await capture?.stop().catch(() => {}); setupBusy = false; renderSetup(); setupError(error); }
    };
    $('setup-next').disabled ||= !snapshot.setup.microphoneTested;
  } else if (setupStep === 3) {
    content.innerHTML = `<p>${snapshot.platform === 'darwin' ? 'Accessibility permission allows MatiQ Voice to send a paste shortcut to the destination app.' : 'Windows can reject insertion into protected or administrator-level apps. Copy remains available.'}</p><div class="field-row"><button id="setup-permission">Open paste permissions</button><button id="setup-permission-refresh">Check again</button></div><label class="check"><input id="setup-copy-only" type="checkbox" ${snapshot.settings.autoPaste ? '' : 'checked'}> Use Copy for now</label><p class="caption">${snapshot.permissions.pasteError || (snapshot.permissions.accessibility ? 'The native paste helper has Accessibility access. Changed or unsupported target fields can still require Copy.' : 'The native paste helper does not have Accessibility access. Enable the installed MatiQ Voice app, then click Check again. If an old entry is already enabled, remove it, add the installed app again, and restart MatiQ Voice.')}</p>`;
    if (snapshot.hosted) content.querySelectorAll('p').forEach(paragraph => { paragraph.textContent = paragraph.textContent.replaceAll('MatiQ Voice', snapshot.applicationName); });
    $('setup-permission').onclick = () => api.accessibility().catch(setupError);
    $('setup-permission-refresh').onclick = async () => { await refresh(); renderSetup(); };
    $('setup-copy-only').onchange = async event => { $('autoPaste').checked = !event.target.checked; await savePreferences(); renderSetup(); };
    $('setup-next').disabled ||= snapshot.settings.autoPaste && !snapshot.permissions.accessibility;
  } else if (setupStep === 4) { content.innerHTML = '<div id="setup-connections"></div><p class="caption">Connections are optional. Local recording works without calendar access. Connecting a calendar does not create an independently joining meeting bot.</p>'; renderConnections($('setup-connections')); }
  else content.innerHTML = `<ul class="setup-step-list"><li>English speech model <small>${escape(snapshot.settings.model)} installed and verified</small></li><li>Speaker labels <small>Local segmentation and English speaker-embedding models installed</small></li><li>Microphone <small>Audio input tested</small></li><li>Background dictation <small>${escape(bindingLabel(snapshot.settings.bindings.toggle))} toggles dictation</small></li></ul><p class="caption">Meeting audio is saved locally only when you explicitly start recording. Recognition and speaker labels can still contain errors.</p>`;
}
$('setup-next').onclick = async () => { try { if (setupStep === 5) { await api.completeSetup(); await refresh(); $('setup-dialog').close(); message('Setup complete. Start dictation from any text field with your shortcut.'); } else { setupStep++; renderSetup(); } } catch (error) { setupError(error); } };
$('setup-back').onclick = () => { if (!setupBusy && setupStep > 0) { setupStep--; renderSetup(); } };
$('setup-close').onclick = () => { if (!setupBusy) $('setup-dialog').close(); };
$('setup-dialog').addEventListener('cancel', event => { if (setupBusy) event.preventDefault(); });
$('open-setup').onclick = openSetup;
async function begin() {
  if (starting || recorder || state !== 'idle') return;
  if (!snapshot.setup.completed) { openSetup(); return; }
  shortcutStopPending=false; starting = true; const ticket = ++generation; paint(); message(''); let capture;
  try {
    await api.begin(); if (ticket !== generation) return;
    const stream = await microphone(snapshot.settings.microphone);
    if (ticket !== generation) { stream.getTracks().forEach(track => track.stop()); return; }
    capture = await captureAudio(stream, {maxSeconds: snapshot.maxSeconds, onLevel: (level, seconds) => { $('level').value = level; $('timer').textContent = formatTime(seconds); api.meter({level, seconds}).catch(showError); }, onLimit: () => { if (!starting) finish().catch(showError); }, onError: error => { message(error.message); finish().catch(showError); }});
    if (ticket !== generation) { await capture.stop(); return; }
    recorder = capture; await api.recordingReady();
  } catch (error) { await capture?.stop().catch(() => {}); recorder = null; if (ticket === generation) { await api.cancel(); showError(error); await refresh(); } }
  finally { if (ticket === generation) starting = false; paint(); if (shortcutStopPending && recorder) { shortcutStopPending=false; await finish(); } }
}
async function finish() {
  if (!recorder || starting) return;
  starting = true; const recording = recorder; recorder = null; const ticket = generation; paint();
  try { const audio = await recording.stop(); if (ticket !== generation) return; if (!audio || audio.byteLength <= 44) { await api.cancel(); message('No audio captured. Hold the binding until Listening appears, then speak.'); return; } await api.transcribe(audio); }
  catch (error) { showError(error); if (state === 'recording') await api.cancel(); }
  finally { if (ticket === generation) starting = false; await refresh(); }
}
async function cancel() {
  shortcutStopPending=false;
  if (state.startsWith('meeting')) { if (state === 'meeting-processing') await api.cancel(); else await stopMeeting(); return; }
  generation++; const recording = recorder; recorder = null; await recording?.stop().catch(() => {}); await api.cancel(); starting = false; await refresh(); message('Dictation cancelled.');
}
async function toggle() { if (starting) { if (state !== 'processing') shortcutStopPending=true; return; } if (recorder) await finish(); else if (state === 'idle') await begin(); else message('Finish the current operation before dictating.'); }
async function loadMeetings() {
  const items = await api.listMeetings(); $('meeting-list').replaceChildren();
  if (!items.length) $('meeting-list').innerHTML = '<p class="caption">No saved meetings yet. Start a local recording to create one.</p>';
  for (const item of items) {
    const button = document.createElement('button'); button.className = `meeting-item ${selectedMeeting?.id === item.id ? 'selected' : ''}`;
    button.innerHTML = `<strong>${escape(item.title)}</strong><span>${escape(new Date(item.created).toLocaleDateString())} · ${formatTime(item.durationMs / 1000)}</span><span>${escape(item.status)}</span>`;
    button.onclick = async () => { selectedMeeting = await api.getMeeting(item.id); meetingTab = 'transcript'; await loadMeetings(); renderMeeting(); };
    $('meeting-list').append(button);
  }
}
function renderMeeting() {
  const target = $('meeting-detail'), meeting = selectedMeeting;
  if (!meeting) { target.innerHTML = '<p class="empty">Select a saved meeting or start recording.</p>'; return; }
  const capturing = meeting.id === snapshot.activeMeeting && ['meeting-recording', 'meeting-paused', 'meeting-preparing'].includes(state);
  target.innerHTML = `<h2>${escape(meeting.title)}</h2><p class="caption">${escape(meeting.provider === 'microsoft' ? 'Microsoft Teams' : meeting.provider === 'google' ? 'Google Meet' : 'Meeting')} · ${escape(meeting.status)} · stored on this computer</p>${meeting.error ? `<p class="error">${escape(meeting.error)}</p>` : ''}<div id="meeting-controls" class="meeting-controls"></div><div id="meeting-meters" class="meters" ${capturing ? '' : 'hidden'}><div>Microphone<progress id="mic-meter" max="1" value="0"></progress></div><div>System audio<progress id="system-meter" max="1" value="0"></progress></div></div><div class="tabs"><button id="tab-transcript" class="${meetingTab === 'transcript' ? 'active' : ''}">Transcript</button><button id="tab-notes" class="${meetingTab === 'notes' ? 'active' : ''}">Notes</button></div><div id="meeting-content"></div>`;
  const controls = $('meeting-controls');
  function button(label, action, disabled = false) { const element = document.createElement('button'); element.textContent = label; element.disabled = disabled; element.onclick = () => Promise.resolve(action()).catch(showError); controls.append(element); }
  if (capturing) { button(state === 'meeting-paused' ? 'Resume' : 'Pause', pauseMeeting, state === 'meeting-preparing'); button('Stop & process', () => stopMeeting()); }
  else { button(meeting.status === 'ready' ? 'Process again' : 'Process saved audio', () => processMeeting(meeting.id), state !== 'idle' || !meeting.chunks.length); button('Export', async () => { await api.exportMeeting(meeting.id); }); button('Delete', async () => { if (confirm('Delete this meeting’s saved audio, transcript and notes?')) { await api.deleteMeeting(meeting.id); selectedMeeting = null; await loadMeetings(); renderMeeting(); } }, state !== 'idle'); }
  $('tab-transcript').onclick = () => { meetingTab = 'transcript'; renderMeeting(); };
  $('tab-notes').onclick = () => { meetingTab = 'notes'; renderMeeting(); };
  const content = $('meeting-content');
  if (meetingTab === 'transcript') {
    content.innerHTML = meeting.segments.length ? meeting.segments.map(segment => `<div class="turn" id="turn-${escape(segment.id)}" tabindex="-1"><div class="turn-meta"><strong>${escape(meeting.speakers[segment.speaker] || 'Unassigned')}</strong><span>${formatTime(segment.startMs / 1000)}</span>${segment.uncertain ? '<span>Review speaker</span>' : ''}</div><p>${escape(segment.text)}</p></div>`).join('') : '<p class="empty">The transcript appears after local processing. Saved audio remains available if processing fails.</p>';
    const speakers = document.createElement('div'); speakers.className = 'speaker-list'; speakers.innerHTML = '<h3>Speaker labels</h3><p class="caption">Voice grouping does not identify a person. Assign names only when you know the speaker.</p>';
    for (const [key, name] of Object.entries(meeting.speakers)) {
      const row = document.createElement('div'); row.className = 'speaker-row'; const label = document.createElement('label'); const input = document.createElement('input'); const save = document.createElement('button');
      input.id = `speaker-${key}`; input.value = name; input.defaultValue = name; input.maxLength = 80; label.htmlFor = input.id; label.textContent = name; save.textContent = 'Save name';
      save.onclick = async () => { try { selectedMeeting = await api.renameSpeaker(meeting.id, key, input.value); renderMeeting(); } catch (error) { showError(error); } }; row.append(label, input, save); speakers.append(row);
    }
    content.append(speakers);
  } else {
    content.innerHTML = '<p class="caption">Extracted passages from the transcript, not an AI rewrite. Owners and deadlines are not inferred.</p>';
    for (const [key, title] of [['summary', 'Opening passages'], ['decisions', 'Decisions mentioned'], ['actions', 'Actions mentioned']]) {
      const heading = document.createElement('h3'); heading.textContent = title; content.append(heading);
      const notes = meeting.notes?.[key] || [];
      if (!notes.length) { const empty = document.createElement('p'); empty.className = 'caption'; empty.textContent = 'No matching passages extracted. Add your own notes below.'; content.append(empty); }
      for (const note of notes) { const row = document.createElement('div'); row.className = 'note-item'; const text = document.createElement('p'); text.textContent = note.text; const link = document.createElement('button'); link.textContent = `View transcript · ${formatTime(note.startMs / 1000)}`; link.onclick = () => { meetingTab = 'transcript'; renderMeeting(); const turn = document.getElementById(`turn-${note.sourceId}`); turn?.scrollIntoView({block: 'center'}); turn?.focus(); }; row.append(text, link); content.append(row); }
    }
    const label = document.createElement('label'); label.htmlFor = 'personal-notes'; label.textContent = 'Your notes'; const notes = document.createElement('textarea'); notes.id = 'personal-notes'; notes.value = meeting.personalNotes || ''; notes.defaultValue = notes.value; const save = document.createElement('button'); save.textContent = 'Save notes'; save.onclick = async () => { try { const saved = notes.value; selectedMeeting = await api.saveNotes(meeting.id, saved); notes.defaultValue = saved; message(notes.value === saved ? 'Meeting notes saved on this computer.' : 'Prior notes saved. Your newer edits are still unsaved.'); } catch (error) { showError(error); } }; content.append(label, notes, save);
  }
}
function openMeetingDialog(event = null) {
  if (!snapshot.setup.completed) { openSetup(); return; }
  $('meeting-title').value = event?.title || ''; $('meeting-link').value = event?.url || ''; $('meeting-provider').value = event?.provider || 'microsoft'; $('meeting-consent').checked = false; $('meeting-error').hidden = true; $('meeting-dialog').showModal();
}
$('meeting-start').onclick = async () => {
  if (!$('meeting-consent').checked) { $('meeting-error').textContent = 'Choose whether to save this meeting before starting.'; $('meeting-error').hidden = false; return; }
  const ticket = ++captureGeneration; let mic, system;
  try {
    selectedMeeting = await api.beginMeeting({title: $('meeting-title').value, provider: $('meeting-provider').value, url: $('meeting-link').value});
    $('meeting-dialog').close(); await refresh(); navigate('meetings'); renderMeeting();
    mic = await microphone(snapshot.settings.microphone);
    system = await navigator.mediaDevices.getDisplayMedia({video: true, audio: true});
    if (!system.getAudioTracks().length) throw new Error('The chosen screen has no system audio. Enable audio sharing in the picker and retry.');
    if (ticket !== captureGeneration) { [...mic.getTracks(), ...system.getTracks()].forEach(track => track.stop()); return; }
    const id = selectedMeeting.id; let warned = false;
    for (const [channel, stream] of [['microphone', mic], ['system', system]]) {
      const capture = await captureAudio(stream, {maxSeconds: 4 * 3600, chunkSeconds: 30, onChunk: (sequence, wav) => api.appendMeeting(id, channel, sequence, wav), onLevel: (level, seconds) => {
        const meter = $(channel === 'microphone' ? 'mic-meter' : 'system-meter'); if (meter) meter.value = level; api.meter({level, seconds}).catch(showError);
        if (channel === 'system' && seconds > 10 && level === 0 && !warned) { warned = true; message('No system audio detected yet. If others are speaking, check capture permissions and the selected output.'); }
      }, onLimit: () => stopMeeting().catch(showError), onError: error => stopMeeting(error).catch(showError)});
      captures.push(capture);
    }
    await api.meetingReady(); await refresh(); selectedMeeting = await api.getMeeting(id); renderMeeting();
  } catch (error) {
    [...(mic?.getTracks() || []), ...(system?.getTracks() || [])].forEach(track => track.stop());
    if (selectedMeeting && snapshot.activeMeeting === selectedMeeting.id) await stopMeeting(error);
    else showError(error);
  }
};
async function pauseMeeting() {
  const paused = state !== 'meeting-paused'; await Promise.all(captures.map(capture => capture.pause(paused))); await api.pauseMeeting(paused); await refresh(); renderMeeting();
}
async function stopMeeting(problem = null, processSaved = true) {
  if (meetingStopping || !snapshot?.activeMeeting || state === 'meeting-processing') return;
  meetingStopping = true; captureGeneration++; const id = snapshot.activeMeeting;
  try {
    const results = await Promise.allSettled(captures.map(capture => capture.stop())); captures = [];
    const failed = results.find(result => result.status === 'rejected'); if (failed) problem ||= failed.reason;
    selectedMeeting = await api.stopMeeting(id, problem?.message || ''); await refresh(); await loadMeetings(); renderMeeting();
    if (problem) showError(problem); else if (processSaved && selectedMeeting.chunks.length) await processMeeting(id);
  } finally { meetingStopping = false; }
}
async function processMeeting(id) {
  try { message('Processing saved audio locally. You can review the result when processing completes.'); selectedMeeting = await api.processMeeting(id); message('Meeting transcript and source-linked notes are ready. Review the speaker labels.'); }
  catch (error) { selectedMeeting = await api.getMeeting(id); showError(error); }
  finally { await refresh(); await loadMeetings(); renderMeeting(); }
}
async function loadCalendar() {
  $('calendar-status').textContent = 'Loading upcoming meetings…'; $('calendar-list').replaceChildren(); let count = 0;
  for (const provider of ['microsoft', 'google']) if (snapshot.connections[provider].connected) {
    try {
      for (const event of await api.calendarEvents(provider)) {
        count++; const row = document.createElement('div'); row.className = 'calendar-item'; row.innerHTML = `<div><strong>${escape(event.title)}</strong><span>${escape(event.start)} · ${escape(provider === 'microsoft' ? 'Teams' : 'Google Meet')}</span></div>`;
        const open = document.createElement('button'); open.textContent = 'Open meeting'; open.onclick = () => api.openMeeting(event.url).catch(showError);
        const record = document.createElement('button'); record.textContent = 'Record locally'; record.onclick = () => openMeetingDialog(event); row.append(open, record); $('calendar-list').append(row);
      }
    } catch (error) { showError(error); }
  }
  $('calendar-status').textContent = count ? `${count} upcoming meeting${count === 1 ? '' : 's'}` : 'No upcoming conference links found. Connect an account in Settings or record manually.';
}
$('update-check').onclick = () => api.checkUpdates().catch(showError);
$('update-install').onclick = () => api.installUpdate().catch(showError);
api.onEvent(event => {
  if (event.type === 'updates' && snapshot) { snapshot.updates = event.update; paint(); }
  if (event.type === 'toggle') toggle().catch(showError);
  if (event.type === 'dictation-start' && !starting && !recorder && state==='idle') {shortcutStopPending=false;begin().catch(showError);}
  if (event.type === 'dictation-stop') { if(starting && state!=='processing') shortcutStopPending=true; else if(recorder) finish().catch(showError); }
  if (event.type === 'keyboard-status') {snapshot.shortcutReady=event.ready;snapshot.keyboardError=event.error;paint();}
  if (event.type === 'binding-preview' && bindingMode) $('binding-live').textContent=bindingLabel(event.keys);
  if (event.type === 'binding-recorded' && bindingMode===event.mode) {candidateBinding=event.keys;$('binding-live').textContent=bindingLabel(event.keys);$('binding-save').disabled=false;}
  if (event.type === 'binding-cancelled') {bindingMode=null;$('binding-dialog').close();message(event.message);}

  if (event.type === 'cancel') cancel().catch(showError);
  if (event.type === 'state') { state = event.state; paint(); }
  if (event.type === 'notice') message(event.message);
  if (event.type === 'transcript') { $('transcript').value = event.text; paint(); }
  if (event.type === 'navigate') navigate(event.page);
  if (event.type === 'stop-meeting') stopMeeting().catch(showError);
  if (event.type === 'quit-after-meeting') stopMeeting(null, false).then(() => api.quit()).catch(showError);
  if (event.type === 'connections') { snapshot.connections = event.connections; renderConnections($('connections')); }
  if (event.type === 'download') { $('status').textContent = `Installing ${event.file} · ${event.percent}%`; if ($('setup-download-progress')) $('setup-download-progress').value = event.overall; if ($('setup-download-label')) $('setup-download-label').textContent = `${event.file} · ${event.percent}%`; }
});
for (const button of document.querySelectorAll('[data-page]')) button.onclick = () => navigate(button.dataset.page);
$('record').onclick = () => toggle().catch(showError); $('cancel').onclick = () => cancel().catch(showError);
$('copy').onclick = () => api.copy().then(() => message('Transcript copied.')).catch(showError);
$('clear').onclick = () => api.clear().then(refresh).catch(showError);
$('retry').onclick = () => api.retry().catch(showError).finally(refresh);
$('refresh').onclick = () => microphones(true).catch(showError);
for (const mode of ['toggle','hold']) {
  $(`record-${mode}`).onclick=()=>recordBinding(mode);
  $(`clear-${mode}`).onclick=()=>saveBinding(mode,[]).then(()=>message('Binding cleared.')).catch(showError);
}
$('keyboard-enable').onclick=()=>api.enableKeyboard().then(refresh).catch(showError);
$('binding-cancel').onclick=()=>cancelBinding().catch(showError);
$('binding-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelBinding().catch(showError);});
$('binding-save').onclick=async()=>{try{if(candidateBinding){await saveBinding(bindingMode,candidateBinding);await cancelBinding();message('Binding saved.');}}catch(error){$('binding-error').textContent=cleanError(error);$('binding-error').hidden=false;}};
$('save').onclick = () => savePreferences().then(() => message('Preferences saved.')).catch(showError);
$('download').onclick = async () => { try { await savePreferences(); await api.download(); } catch (error) { showError(error); } finally { await refresh(); } };
$('accessibility').onclick = () => api.accessibility().catch(showError);
$('launch-login').onchange = event => api.loginAtStartup(event.target.checked).catch(showError);
$('new-meeting').onclick = () => openMeetingDialog(); $('meeting-dialog-cancel').onclick = () => $('meeting-dialog').close(); $('calendar-refresh').onclick = () => loadCalendar().catch(showError);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && state !== 'idle' && !$('setup-dialog').open) cancel().catch(showError); });
navigator.mediaDevices.addEventListener('devicechange', () => microphones().catch(showError));
try {
  await refresh();
  for (const [id, model] of Object.entries(snapshot.models)) $('model').add(new Option(model.label, id));
  $('model').value = snapshot.settings.model; $('autoPaste').checked = snapshot.settings.autoPaste; $('launch-login').checked = snapshot.setup.launchAtLogin;
  $('transcript').value = snapshot.lastTranscript;
  await microphones(); paint();
  if (snapshot.startupNotice) message(snapshot.startupNotice);
  if (!snapshot.shortcutReady) message('Background keyboard access is unavailable. Open Settings and check keyboard access.');
  if (!snapshot.setup.completed) openSetup();
} catch (error) { showError(error); }

$('show-app').hidden=navigator.platform.indexOf('Mac')===-1;
$('show-app').onclick=()=>api.showApp().catch(showError);

$('quit-app').onclick=()=>api.quit().catch(showError);

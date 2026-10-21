import {encodeWav} from './audio.mjs';

const api = window.verbatim;
const $ = id => document.getElementById(id);
let snapshot, state = 'idle', recorder = null, starting = false, generation = 0;
let engineReady = false, modelReady = false;
const message = text => { $('notice').textContent = text; $('notice').hidden = !text; };
const showError = error => message(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));

function paint() {
  const idle = state === 'idle';
  $('record').disabled = starting || (!idle && state !== 'recording') || !engineReady || !modelReady;
  $('record').textContent = state === 'recording' ? 'Stop & transcribe' : 'Start dictation';
  $('record').dataset.recording = String(state === 'recording');
  $('cancel').hidden = idle;
  for (const id of ['model', 'microphone', 'autoPaste', 'save', 'refresh', 'clear', 'download', 'retry']) $(id).disabled = !idle || starting;
  $('download').disabled ||= modelReady;
  $('copy').disabled = !$('transcript').value;
  const labels = {idle: 'Ready when you are.', preparing: 'Preparing dictation…', recording: 'Listening. Your microphone is active.', processing: 'Transcribing on this machine…', downloading: 'Downloading speech model…', cancelling: 'Cancelling…'};
  $('status').textContent = !engineReady ? 'Speech engine missing. Install a complete build or follow the developer setup.' : !modelReady && idle ? 'Download a speech model to get started.' : labels[state];
}

async function refresh() {
  snapshot = await api.status();
  state = snapshot.state; engineReady = snapshot.engineReady; modelReady = snapshot.modelReady;
  $('retry').hidden = !snapshot.canRetry;
  $('model-status').textContent = modelReady ? 'Downloaded and ready for offline dictation.' : 'Download required. The model stays on this device.';
  paint();
}

async function microphones(requestPermission = false) {
  if (requestPermission) {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    stream.getTracks().forEach(track => track.stop());
  }
  const selected = $('microphone').value;
  $('microphone').replaceChildren(new Option('System default', ''));
  const devices = await navigator.mediaDevices.enumerateDevices();
  for (const device of devices.filter(device => device.kind === 'audioinput' && device.deviceId)) {
    $('microphone').add(new Option(device.label || `Microphone ${$('microphone').length}`, device.deviceId));
  }
  const desired = selected || snapshot.settings.microphone;
  if ([...$('microphone').options].some(option => option.value === desired)) $('microphone').value = desired;
}

async function release(recording) {
  clearInterval(recording.timer);
  recording.stream.getTracks().forEach(track => track.stop());
  recording.node?.disconnect(); recording.source?.disconnect();
  if (recording.context.state !== 'closed') await recording.context.close();
  $('level').value = 0;
}

async function begin() {
  if (starting || recorder || state !== 'idle') return;
  starting = true; const ticket = ++generation; paint(); message('');
  let stream, context;
  try {
    await api.begin();
    if (ticket !== generation) return;
    stream = await navigator.mediaDevices.getUserMedia({audio: {
      ...(snapshot.settings.microphone ? {deviceId: {exact: snapshot.settings.microphone}} : {}),
      channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false
    }});
    if (ticket !== generation) { stream.getTracks().forEach(track => track.stop()); return; }
    context = new AudioContext({sampleRate: 16000});
    await context.audioWorklet.addModule('recorder-worklet.js');
    await context.resume();
    if (ticket !== generation) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
    if (context.sampleRate !== 16000 || context.state !== 'running') throw new Error('Audio capture could not start at 16 kHz. Check microphone access and retry.');
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'verbatim-recorder');
    const recording = {stream, context, source, node, chunks: [], samples: 0, finishing: false, started: Date.now(), maxSamples: snapshot.maxSeconds * 16000};
    recorder = recording;
    node.port.onmessage = event => {
      if (event.data.stopped) { recording.acknowledge?.(); return; }
      if (recorder !== recording) return;
      const samples = event.data.samples.subarray(0, recording.maxSamples - recording.samples);
      if (samples.length) {
        recording.chunks.push(samples); recording.samples += samples.length;
        $('level').value = Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 4);
      }
      if (recording.samples >= recording.maxSamples && !recording.finishing) {
        message('Five-minute limit reached. Transcribing the recording.'); finish().catch(showError);
      }
    };
    source.connect(node); node.connect(context.destination);
    await api.recordingReady();
    recording.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - recording.started) / 1000);
      $('timer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds >= snapshot.maxSeconds && !recording.finishing) {
        message('Five-minute limit reached. Transcribing the recording.'); finish().catch(showError);
      }
    }, 200);
    stream.getAudioTracks()[0].onended = () => {
      if (recorder === recording && !recording.finishing) { message('Microphone disconnected. Transcribing the audio captured so far.'); finish().catch(showError); }
    };
    $('timer').textContent = '0:00';
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') await context.close();
    if (ticket !== generation) return;
    await api.cancel(); await refresh();
    showError(new Error(`Recording could not start: ${error.message}. Check microphone permission and the selected input.`));
  } finally { if (ticket === generation) starting = false; paint(); }
}

async function finish() {
  const recording = recorder;
  if (!recording || recording.finishing) return;
  recording.finishing = true; starting = true; paint();
  const ticket = generation;
  try {
    // Wait for the worklet's final samples before closing the audio graph.
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Audio capture stopped responding. Cancel dictation and retry.')), 3000);
      recording.acknowledge = () => { clearTimeout(timeout); resolve(); };
      recording.node.port.postMessage('stop');
    });
    await release(recording);
    if (ticket !== generation) return;
    recorder = null;
    const wav = encodeWav(recording.chunks);
    recording.chunks.length = 0;
    await api.transcribe(wav);
  } catch (error) {
    if (recorder === recording) { recorder = null; await release(recording); await api.cancel(); }
    showError(error);
  } finally { if (ticket === generation) starting = false; await refresh(); }
}

async function cancel() {
  generation++;
  const recording = recorder; recorder = null;
  if (recording) { recording.acknowledge?.(); await release(recording); }
  await api.cancel(); starting = false; await refresh(); message('Dictation cancelled.');
}

async function toggle() {
  if (starting) return;
  if (recorder) await finish(); else if (state === 'idle') await begin();
}

api.onEvent(event => {
  if (event.type === 'toggle') toggle().catch(showError);
  if (event.type === 'cancel') cancel().catch(showError);
  if (event.type === 'state') { state = event.state; paint(); }
  if (event.type === 'notice') message(event.message);
  if (event.type === 'transcript') { $('transcript').value = event.text; paint(); }
  if (event.type === 'download') $('status').textContent = `Downloading speech model… ${event.percent}%`;
});
$('record').onclick = () => toggle().catch(showError);
$('cancel').onclick = () => cancel().catch(showError);
$('copy').onclick = () => api.copy().then(() => message('Transcript copied.')).catch(showError);
$('clear').onclick = () => api.clear().then(refresh).catch(showError);
$('retry').onclick = () => api.retry().catch(showError).finally(refresh);
$('refresh').onclick = () => microphones(true).catch(showError);
$('accessibility').onclick = () => api.accessibility().catch(showError);
$('save').onclick = async () => {
  try {
    await api.settings({model: $('model').value, microphone: $('microphone').value, autoPaste: $('autoPaste').checked});
    await refresh(); message('Preferences saved.');
  } catch (error) { showError(error); }
};
$('download').onclick = async () => {
  try {
    if ($('model').value !== snapshot.settings.model) throw new Error('Save preferences before downloading the selected model.');
    await api.download();
  } catch (error) { showError(error); }
  finally { await refresh(); }
};
document.addEventListener('keydown', event => { if (event.key === 'Escape' && state !== 'idle') cancel().catch(showError); });
navigator.mediaDevices.addEventListener('devicechange', () => microphones().catch(showError));

try {
  await refresh();
  for (const [id, model] of Object.entries(snapshot.models)) $('model').add(new Option(model.label, id));
  $('model').value = snapshot.settings.model; $('autoPaste').checked = snapshot.settings.autoPaste;
  $('transcript').value = snapshot.lastTranscript;
  $('shortcut').textContent = snapshot.platform === 'darwin' ? '⌘ + ⌥ + Space' : 'Ctrl + Alt + Space';
  if (snapshot.startupNotice) message(snapshot.startupNotice);
  if (!snapshot.shortcutReady) message('The global shortcut is unavailable. Close another dictation app using it, then restart Verbatim. Recording from this window still works.');
  await microphones(); paint();
} catch (error) { showError(error); }

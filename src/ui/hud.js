const control = window.recordingControl;
const indicator = document.querySelector('.indicator');
const waveform = document.querySelector('#waveform');
const bars = Array.from({length: 19}, () => { const bar = document.createElement('span'); waveform.append(bar); return bar; });
let recording = false;
function drawLevel(level) {
  const amplitude = recording ? Math.min(1, Math.max(0, (level - .025) / .7)) : 0;
  bars.forEach((bar, i) => { bar.style.height = `${3 + amplitude * 25 * (.3 + .7 * Math.sin(Math.PI * i / (bars.length - 1)) ** 2)}px`; });
}
control.onState(({state}) => {
  const labels = {preparing: 'Preparing', recording: 'Recording', processing: 'Transcribing locally', 'meeting-preparing': 'Preparing meeting', 'meeting-recording': 'Recording meeting', 'meeting-processing': 'Processing meeting'};
  recording = ['recording', 'meeting-recording'].includes(state);
  indicator.dataset.state = state;
  indicator.title = labels[state] || state;
  document.querySelector('#state').textContent = labels[state] || state;
  document.querySelector('#stop').disabled = !recording;
  if (['preparing', 'meeting-preparing'].includes(state)) document.querySelector('#time').textContent = '0:00';
  drawLevel(0);
});
control.onMeter(({level, seconds}) => {
  if (!recording) return;
  drawLevel(level);
  document.querySelector('#time').textContent = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
});
document.querySelector('#stop').onclick = () => control.stop();

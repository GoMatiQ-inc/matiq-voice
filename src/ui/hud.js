const control = window.recordingControl;
control.onState(({state}) => {
  const labels = {preparing: 'Preparing', recording: 'Listening', processing: 'Transcribing locally', 'meeting-preparing': 'Preparing meeting', 'meeting-recording': 'Recording meeting', 'meeting-processing': 'Processing meeting'};
  document.querySelector('#state').textContent = labels[state] || state;
  document.querySelector('#cancel').hidden = state.startsWith('meeting');
  document.querySelector('#stop').disabled = ['processing', 'meeting-processing'].includes(state);
});
control.onMeter(({level, seconds}) => { document.querySelector('#level').value = level; document.querySelector('#time').textContent = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`; });
document.querySelector('#stop').onclick = () => control.stop();
document.querySelector('#cancel').onclick = () => control.cancel();

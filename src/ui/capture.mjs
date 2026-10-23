import {encodeWav} from './audio.mjs';

export async function captureAudio(stream, {onLevel = () => {}, onError = () => {}, onLimit = () => {}, onChunk = null, chunkSeconds = 30, maxSeconds = 300} = {}) {
  if (!stream.getAudioTracks().length) { stream.getTracks().forEach(track => track.stop()); throw new Error('The selected source has no audio track. Choose a source with meeting audio.'); }
  const context = new AudioContext({sampleRate: 16000});
  let node, source;
  try {
    await context.audioWorklet.addModule('recorder-worklet.js'); await context.resume();
    if (context.sampleRate !== 16000 || context.state !== 'running') throw new Error('Audio capture could not start. Check microphone and system-audio permissions.');
    source = context.createMediaStreamSource(stream); node = new AudioWorkletNode(context, 'matiq-recorder');
  } catch (error) { stream.getTracks().forEach(track => track.stop()); await context.close(); throw error; }
  let chunks = [], count = 0, total = 0, sequence = 0, pending = Promise.resolve(), failure = null, closed = false, stopping = null, lastMeter = 0;
  let commandNumber = 0; const acknowledgements = new Map();
  function flush() {
    if (!count) return;
    const wav = encodeWav(chunks); chunks = []; count = 0;
    if (onChunk) {
      const current = sequence++;
      pending = pending.then(() => { if (failure) throw failure; return onChunk(current, wav); }).catch(error => { if (!failure) { failure = error; onError(error); } });
    }
    return wav;
  }
  function command(value) {
    return new Promise((resolve, reject) => {
      const id = ++commandNumber, timeout = setTimeout(() => { acknowledgements.delete(id); reject(new Error('Audio capture stopped responding. Stop recording and retry.')); }, 3000);
      acknowledgements.set(id, () => { clearTimeout(timeout); resolve(); }); node.port.postMessage({...value, id});
    });
  }
  node.port.onmessage = ({data}) => {
    if (data.ack) { acknowledgements.get(data.ack)?.(); acknowledgements.delete(data.ack); return; }
    if (closed || failure) return;
    const samples = data.samples.subarray(0, Math.max(0, maxSeconds * 16000 - total));
    if (!samples.length) return;
    chunks.push(samples); count += samples.length; total += samples.length;
    const now = performance.now();
    if (now - lastMeter > 100) { lastMeter = now; onLevel(Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 4), total / 16000); }
    if (onChunk && count >= chunkSeconds * 16000) flush();
    if (total >= maxSeconds * 16000) onLimit();
  };
  stream.getAudioTracks()[0].onended = () => { if (!closed && !stopping) onError(new Error('An audio source disconnected. Completed audio chunks are retained.')); };
  source.connect(node); node.connect(context.destination);
  return {
    get seconds() { return total / 16000; },
    async pause(paused) { await command({command: 'pause', paused}); if (onChunk) { flush(); await pending; if (failure) throw failure; } },
    stop() {
      if (stopping) return stopping;
      stopping = (async () => {
        let audio;
        try { await command({command: 'stop'}); audio = flush(); await pending; if (failure) throw failure; return audio; }
        finally { closed = true; stream.getTracks().forEach(track => track.stop()); source.disconnect(); node.disconnect(); await context.close(); }
      })();
      return stopping;
    }
  };
}
export function microphone(deviceId = '') {
  return navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(deviceId ? {deviceId: {exact: deviceId}} : {})}});
}

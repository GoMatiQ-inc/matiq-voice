const fs = require('node:fs/promises');
const path = require('node:path');
const {run} = require('./engine.cjs');
const {sourceNotes, speakerFor} = require('./meetings.cjs');

async function combine(directory, chunks, channel) {
  const selected = chunks.filter(chunk => chunk.channel === channel).sort((a, b) => a.sequence - b.sequence);
  if (!selected.length) return null;
  const file = path.join(directory, `${channel}-complete.wav`);
  const handle = await fs.open(file, 'w', 0o600); let total = 0;
  try {
    await handle.writeFile(Buffer.alloc(44));
    for (const chunk of selected) {
      const wav = await fs.readFile(path.join(directory, chunk.file));
      await handle.writeFile(wav.subarray(44)); total += wav.length - 44;
    }
    const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(total + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(total, 40);
    await handle.write(header, 0, 44, 0);
  } finally { await handle.close(); }
  return file;
}
async function analyze(job,{runEngine=run}={}) {
  const meeting = JSON.parse(await fs.readFile(path.join(job.directory, 'meeting.json'), 'utf8'));
  const segments = []; const speakers = {microphone: 'Microphone', unknown: 'Unassigned'};
  for (const channel of ['microphone', 'system']) {
    const audio = await combine(job.directory, meeting.chunks, channel);
    if (!audio) continue;
    const output = path.join(job.directory, `${channel}-recognition`);
    await runEngine(job.binary, ['--model', job.model, '--file', audio, '--language', 'en', '--output-json', '--output-file', output, '--max-len', '96', '--split-on-word'], {timeout: 4 * 3600000});
    const result = JSON.parse(await fs.readFile(`${output}.json`, 'utf8'));
    let turns = [];
    if (channel === 'system') {
      const sherpa = require('sherpa-onnx-node');
      const diarizer = new sherpa.OfflineSpeakerDiarization({segmentation: {pyannote: {model: path.join(job.models, 'speaker-segmentation.onnx')}}, embedding: {model: path.join(job.models, 'speaker-embedding.onnx')}, clustering: {numClusters: -1, threshold: .5}, minDurationOn: .2, minDurationOff: .5});
      // Electron's V8 memory cage rejects the addon's external-buffer WAV
      // helper. Keep PCM storage owned by JavaScript and pass it to inference.
      const pcm = await fs.readFile(audio);
      const samples = new Float32Array((pcm.length - 44) / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(44 + i * 2) / 32768;
      turns = diarizer.process(samples);
      for (const turn of turns) speakers[`remote-${turn.speaker}`] = `Speaker ${turn.speaker + 1}`;
    }
    for (const item of result.transcription || []) {
      const segment = {id: `${channel}-${segments.length}`, channel, startMs: item.offsets.from, endMs: item.offsets.to, text: item.text.trim()};
      if (!segment.text) continue;
      Object.assign(segment, channel === 'microphone' ? {speaker: 'microphone', uncertain: true} : speakerFor(segment, turns));
      segments.push(segment);
    }
    await fs.rm(audio, {force: true}); await fs.rm(`${output}.json`, {force: true});
  }
  segments.sort((a, b) => a.startMs - b.startMs || a.channel.localeCompare(b.channel));
  return {segments, speakers, notes: sourceNotes(segments)};
}
if (process.parentPort) {
  const pending=new Map();let nextRequest=0,started=false;
  process.parentPort.on('message',({data})=>{
    if(data.type==='engine-result'){
      const request=pending.get(data.requestId);if(!request)return;pending.delete(data.requestId);
      data.ok?request.resolve(data.output):request.reject(new Error(data.error));return;
    }
    if(started)throw Error('Meeting worker received a duplicate processing job.');started=true;
    // The parent owns external processes, including their actual exit. Keep
    // only CPU-heavy diarization and local result assembly in this worker.
    const runEngine=(_binary,args)=>new Promise((resolve,reject)=>{
      const requestId=++nextRequest;pending.set(requestId,{resolve,reject});
      process.parentPort.postMessage({type:'engine-run',requestId,args});
    });
    analyze(data,{runEngine}).then(result=>process.parentPort.postMessage({ok:true,result})).catch(error=>process.parentPort.postMessage({ok:false,error:`Meeting processing failed: ${error.message}. Recorded audio is retained; retry processing.`}));
  });
}
module.exports = {combine, analyze};

const test=require('node:test'),assert=require('node:assert/strict');
test('capture retains failed meeting chunks through final stop and delivers each once on explicit retry',async t=>{
 const previous={AudioContext:global.AudioContext,AudioWorkletNode:global.AudioWorkletNode};let node,stopped=false;
 t.after(()=>Object.assign(global,previous));
 global.AudioWorkletNode=class{
  constructor(){node=this;this.port={postMessage:message=>queueMicrotask(()=>{if(message.command==='stop')this.port.onmessage({data:{samples:new Float32Array(1600).fill(.2)}});this.port.onmessage({data:{ack:message.id}});})};}
  connect(){}disconnect(){}
 };
 global.AudioContext=class{
  constructor(){this.sampleRate=16000;this.state='running';this.destination={};this.audioWorklet={addModule:async()=>{}};}
  async resume(){}async close(){}
  createMediaStreamSource(){return {connect:()=>queueMicrotask(()=>node.port.onmessage({data:{samples:new Float32Array(16000).fill(.1)}})),disconnect(){}};}
 };
 let fail=true;const writes=[],errors=[];
 const stream={getAudioTracks:()=>[{}],getTracks:()=>[{stop(){stopped=true;}}]};
 const {captureAudio}=await import('../src/ui/capture.mjs');
 const capture=await captureAudio(stream,{chunkSeconds:1,onChunk:async(sequence,wav)=>{if(fail)throw Error('disk full');writes.push({sequence,bytes:wav.byteLength});},onError:error=>errors.push(error.message)});
 await assert.rejects(capture.stop(),/disk full/);assert.equal(stopped,true);assert.deepEqual(writes,[]);assert.deepEqual(errors,['disk full']);
 fail=false;await capture.stop();assert.deepEqual(writes,[{sequence:0,bytes:32044},{sequence:1,bytes:3244}]);
 await capture.stop();assert.equal(writes.length,2);
});

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createQuitSave}=require('../src/quit-save.cjs');
test('confirmed Quit saves validated audio before acknowledgement; failures stay retryable',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'voice-quit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {encodeWav}=await import('../src/ui/audio.mjs');const audio=encodeWav([new Float32Array(1600).fill(.1)]);
 let event,saved=false;const directory=path.join(root,'recovery');
 const quit=createQuitSave({directory,send:value=>{event=value;},finishMeeting:async()=>{},afterSave:async file=>{assert.deepEqual(await fs.readFile(file),Buffer.from(audio));saved=true;}});
 const pending=quit.request();assert.equal(saved,false);
 await assert.rejects(quit.accept({token:'wrong',audio}),/matching/);
 const result=await quit.accept({token:event.token,audio});await pending;assert.equal(result.saved,true);assert.equal(saved,true);
 assert.equal((await fs.readdir(directory)).length,1);if(process.platform!=='win32')assert.equal((await fs.stat(path.join(directory,(await fs.readdir(directory))[0]))).mode&0o777,0o600);
 const blocked=path.join(root,'blocked');await fs.writeFile(blocked,'fixture');
 const retry=createQuitSave({directory:blocked,send:value=>{event=value;},finishMeeting:async()=>{},afterSave:async()=>{}});
 const failed=retry.request();const failure=assert.rejects(failed,/EEXIST|ENOTDIR/);
 await assert.rejects(retry.accept({token:event.token,audio}),/EEXIST|ENOTDIR/);await failure;
 await fs.unlink(blocked);const again=retry.request();await retry.accept({token:event.token,audio});await again;
 assert.equal((await fs.readdir(blocked)).length,1,'Retry saves the same retained audio.');
});
test('meeting flush failure and renderer timeout never acknowledge a successful Quit',async()=>{
 let event;const quit=createQuitSave({directory:'unused',send:value=>{event=value;},finishMeeting:async()=>{throw Error('pending meeting audio');},afterSave:async()=>{}});
 const pending=quit.request();const failure=assert.rejects(pending,/pending meeting audio/);
 await assert.rejects(quit.accept({token:event.token}),/pending meeting audio/);await failure;
 const timeout=createQuitSave({directory:'unused',send:()=>{},finishMeeting:async()=>{},afterSave:async()=>{},timeout:10});
 await assert.rejects(timeout.request(),/did not finish saving/);
});

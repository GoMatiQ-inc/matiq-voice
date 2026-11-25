const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const lifecycle=require('@matiq-solutions/sdk/fixture-lifecycle.cjs');
const {cleanupDesktop}=require('@matiq-solutions/sdk/fixture-cleanup.cjs');
async function qualifyRecordingQuit({app,page,hostPage,dataDir}){
 await (hostPage||page).getByRole('button',{name:'Dictation',exact:true}).click();
 await page.evaluate(()=>{
  navigator.mediaDevices.getUserMedia=async()=>{
   const context=new AudioContext({sampleRate:16000,sinkId:{type:'none'}}),source=context.createOscillator(),gain=context.createGain(),output=context.createMediaStreamDestination();
   gain.gain.value=.2;source.connect(gain);gain.connect(output);gain.connect(context.destination);source.start();await context.resume();return output.stream;
  };
 });
 await app.evaluate(({dialog})=>{
  global.fixtureQuitChoice=0;global.fixtureQuitWarning=null;global.fixtureQuitError='';
  dialog.showMessageBox=async(...args)=>{global.fixtureQuitWarning=args.at(-1);return {response:global.fixtureQuitChoice};};
  dialog.showErrorBox=(_title,detail)=>{global.fixtureQuitError=detail;};
 });
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 async function poll(operation,test,label){
  const until=Date.now()+20000;
  while(Date.now()<until){const value=await operation();if(test(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error(label+' did not complete. Preserve the owned native diagnostic.');
 }
 await poll(()=>page.evaluate(()=>window.matiqVoice.status()),value=>value.state==='recording','Synthetic microphone capture');
 await poll(()=>page.locator('#level').getAttribute('value'),value=>Number(value)>0,'Synthetic microphone signal');
 await app.evaluate(({app})=>{setTimeout(()=>app.quit(),50);});
 const warning=await poll(()=>app.evaluate(()=>global.fixtureQuitWarning),Boolean,'Quit warning');
 assert.deepEqual(warning.buttons,['Keep recording','Stop, save, and quit']);
 assert.equal((await page.evaluate(()=>window.matiqVoice.status())).state,'recording');
 await app.evaluate(({app})=>{
  const fs=process.getBuiltinModule('fs/promises'),rename=fs.rename;
  fs.rename=async(from,to)=>{if(String(to).includes('recovered-dictation'))throw Error('Controlled recording save failure');return rename(from,to);};
  global.fixtureRestoreQuitWrite=()=>{fs.rename=rename;};
  global.fixtureQuitChoice=1;setTimeout(()=>app.quit(),50);
 });
 await poll(()=>app.evaluate(()=>global.fixtureQuitError),Boolean,'Failed recording save');
 assert.match(await app.evaluate(()=>global.fixtureQuitError),/Controlled recording save failure/);
 assert.equal(app.process().exitCode,null);
 assert.equal((await page.evaluate(()=>window.matiqVoice.status())).state,'recording');
 await app.evaluate(()=>global.fixtureRestoreQuitWrite());
 const owned=lifecycle.captureTree(lifecycle.capture(app.process())),child=app.process();
 await app.evaluate(({app})=>{setTimeout(()=>app.quit(),50);});
 await poll(async()=>child.exitCode,value=>value!==null,'Confirmed recording Quit');
 await cleanupDesktop({owned});
 const directory=path.join(dataDir,'recovered-dictation'),files=(await fs.readdir(directory)).filter(name=>name.endsWith('.wav'));
 assert.equal(files.length,1,'Save one final recording on successful retry.');
 const audio=await fs.readFile(path.join(directory,files[0]));
 require('../src/core.cjs').validateWav(audio);assert.ok(audio.length>3244,'The final capture buffer must be saved.');
 console.log('PASS: actual Voice recording Quit warns, cancellation keeps capture, failed save prevents exit, and retry saves the final WAV before exit.');
 return {savedAudioBytes:audio.length,checks:['recording-quit-warning','cancel-preserves-recording','failed-save-keeps-app-open','retry-saves-final-wav-before-exit','owned-process-and-listener-cleanup']};
}
module.exports={qualifyRecordingQuit};

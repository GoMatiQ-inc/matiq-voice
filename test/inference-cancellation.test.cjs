const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../src/engine.cjs'),{watch,hasExited,waitForExit}=require('../src/child-lifecycle.cjs');
test('cancelled inference waits for actual exit even when the child ignores termination',{timeout:6000},async()=>{
 const controller=new AbortController();let child;
 const script="process.on('SIGTERM',()=>{});process.stdout.write('ready');setTimeout(()=>process.exit(2),5000);";
 try{
  const pending=run(process.execPath,['-e',script],{signal:controller.signal,onSpawn:value=>{child=watch(value);child.stdout.once('data',()=>controller.abort());}});
  await assert.rejects(pending,/abort/i);
  assert.equal(hasExited(child),true);
  assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
  if(process.platform!=='win32')assert.equal(child.signalCode,'SIGKILL');
 }finally{if(child&&!hasExited(child)){child.kill('SIGKILL');await waitForExit(child,1000);}}
});

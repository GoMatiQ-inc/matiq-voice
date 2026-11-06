const test=require('node:test'),assert=require('node:assert/strict');
const {captureTarget}=require('../src/input.cjs'),{watch,waitForExit,hasExited}=require('../src/child-lifecycle.cjs');
test('destination helper remains owned until cancellation actually exits',{timeout:5000},async()=>{
 let child;
 try {
  const target=await captureTarget(process.execPath,['-e',"process.stdout.write('ready\\n');process.stdin.on('data',()=>process.exit(0));setTimeout(()=>process.exit(2),2000);"],{onSpawn:value=>{child=watch(value);}});
  assert.ok(child.pid);assert.equal(hasExited(child),false);
  target.cancel();await waitForExit(child,3000);assert.equal(child.exitCode,0);
 }finally{if(child&&!hasExited(child)){child.kill();await waitForExit(child,1000);}}
});
test('failed destination handshake still exposes its process for shutdown verification',{timeout:5000},async()=>{
 let child;
 try {
  await assert.rejects(captureTarget(process.execPath,['-e',"process.stdout.write('invalid\\n');setTimeout(()=>process.exit(2),2000);"],{onSpawn:value=>{child=watch(value);}}),/Destination tracking failed/);
  await waitForExit(child,1000);assert.equal(hasExited(child),true);
 }finally{if(child&&!hasExited(child)){child.kill();await waitForExit(child,1000);}}
});

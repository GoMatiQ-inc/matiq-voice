const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readPasteAccess}=require('../src/input.cjs');
test('paste access checks query a fresh native helper and distinguish denied access from probe failure',async()=>{
  const calls=[];let allowed=false;
  const run=async(executable,args)=>{calls.push({executable,args});return {stdout:JSON.stringify({accessibility:allowed})};};
  assert.deepEqual(await readPasteAccess('/app/mac-input',{run}),{accessibility:false});
  allowed=true;assert.deepEqual(await readPasteAccess('/app/mac-input',{run}),{accessibility:true});
  await readPasteAccess('/app/mac-input',{request:true,run});
  assert.deepEqual(calls.map(call=>call.args),[['permissions'],['permissions'],['request-permissions']]);
  await assert.rejects(readPasteAccess('/app/mac-input',{run:async()=>({stdout:'{"accessibility":"yes"}'})}),/invalid permission status/);
  await assert.rejects(readPasteAccess('/app/mac-input',{run:async()=>{throw new Error('Helper signature rejected');}}),/signature rejected/);
});

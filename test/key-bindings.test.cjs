const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BindingRouter,validateBindings,migrateBindings,MAC_KEYS,WINDOWS_KEYS}=require('../src/key-bindings.cjs');
const {validateSettings}=require('../src/core.cjs');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {Keyboard}=require('../src/keyboard.cjs');
function router(bindings={toggle:['MetaRight'],hold:['AltRight']}) {const events=[];return {events,keys:new BindingRouter(bindings,event=>events.push(event))};}
test('side-specific modifier-only capture waits for release and preserves the physical side',()=>{
  const {keys,events}=router();keys.record('hold');keys.key('ControlRight',true);keys.key('MetaLeft',true);keys.key('ControlRight',false);assert.equal(events.some(e=>e.type==='binding-recorded'),false);keys.key('MetaLeft',false);
  assert.deepEqual(events.at(-1),{type:'binding-recorded',mode:'hold',keys:['ControlRight','MetaLeft']});
  assert.equal(events.some(e=>['toggle','dictation-start'].includes(e.type)),false);
});
test('toggle fires once per physical press and ignores repeat and opposite-side modifiers',()=>{
  const {keys,events}=router();keys.key('MetaLeft',true);keys.key('MetaLeft',false);keys.key('MetaRight',true);keys.key('MetaRight',true);keys.key('KeyA',true);keys.key('KeyA',false);assert.deepEqual(events,[{type:'toggle'}]);keys.key('MetaRight',false);keys.key('MetaRight',true);assert.equal(events.length,2);
});
test('push to talk starts once, stops on any constituent release and handles reset',()=>{
  const {keys,events}=router({toggle:[],hold:['ControlRight','AltLeft']});keys.key('ControlLeft',true);keys.key('AltLeft',true);assert.equal(events.length,0);keys.key('ControlRight',true);keys.key('ControlRight',true);keys.key('AltLeft',false);assert.deepEqual(events,[{type:'dictation-start'},{type:'dictation-stop'}]);keys.key('AltLeft',true);keys.reset();assert.deepEqual(events.slice(-2),[{type:'dictation-start'},{type:'dictation-stop'}]);
});
test('binding validation rejects overlapping chords and unknown keys but accepts a single ordinary key',()=>{
  assert.deepEqual(validateBindings({toggle:['KeyA'],hold:['ControlRight']},'darwin'),{toggle:['KeyA'],hold:['ControlRight']});
  for(const value of [{toggle:['MetaRight'],hold:['MetaRight','Space']},{toggle:['Unknown'],hold:[]},{toggle:['ControlRight','ControlRight'],hold:[]}])assert.throws(()=>validateBindings(value,'darwin'));
  assert.notEqual(MAC_KEYS.MetaLeft,MAC_KEYS.MetaRight);assert.notEqual(WINDOWS_KEYS.ControlLeft,WINDOWS_KEYS.ControlRight);
});
test('legacy settings migrate without losing model or microphone preferences',()=>{
  assert.deepEqual(migrateBindings({shortcut:'Control+Alt+Shift+J'},'darwin'),{toggle:['AltLeft','ControlLeft','KeyJ','ShiftLeft'],hold:[]});
  const settings=validateSettings({model:'medium.en',microphone:'selected-mic',autoPaste:true,shortcut:'Control+Alt+Shift+J'});
  assert.equal(settings.model,'medium.en');assert.equal(settings.microphone,'selected-mic');assert.ok(!('shortcut' in settings));
});
test('cancelled key recording cannot leave a learned shortcut or activate hold',()=>{
  const {keys,events}=router();keys.record('hold');keys.key('AltRight',true);keys.cancelRecord();keys.key('AltRight',false);assert.equal(events.some(e=>e.type==='binding-recorded'||e.type==='dictation-start'),false);
});
test('keyboard stream reports permission failure and stops a held dictation on helper failure',async()=>{
  let child;const events=[];
  const keyboard=new Keyboard({engineDir:'.',nativeDir:'.',bindings:{toggle:[],hold:['AltRight']},emit:event=>events.push(event),platform:'darwin',spawnProcess:()=>{
    child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};queueMicrotask(()=>child.stdout.write('{"ready":true}\n'));return child;
  }});
  await keyboard.start();child.stdout.write('{"key":61,"down":true}\n');child.stderr.write('Enable Accessibility');child.stdin.emit('error',new Error('Enable Accessibility'));child.stdout.write('{"ready":true}\n');child.emit('close',77);
  assert.equal(keyboard.ready,false);assert.match(keyboard.error,/Accessibility/);assert.ok(events.some(e=>e.type==='dictation-stop'));keyboard.stop();
});

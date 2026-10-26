const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const path=require('node:path');
const {BindingRouter,keyMap}=require('./key-bindings.cjs');
class Keyboard {
  constructor({engineDir,nativeDir,bindings,emit,platform=process.platform,spawnProcess=spawn}) {
    Object.assign(this,{engineDir,nativeDir,emit,platform,spawnProcess}); this.router=new BindingRouter(bindings,event=>{
      if(event.type==='binding-recorded') {clearTimeout(this.timer);this.configureNative();}
      emit(event);
    }); this.ready=false; this.error=''; this.child=null;
  }
  configureNative() {
    if(!this.child || !this.ready) return;
    const map=keyMap(this.platform);
    this.child.stdin.write(JSON.stringify({bindings:Object.values(this.router.bindings).map(keys=>keys.map(key=>map[key])),learning:Boolean(this.router.recording)})+'\n');
  }
  async start() {
    if(this.ready) return;
    if(this.starting) return this.starting;
    this.starting=this.open().finally(()=>{this.starting=null;}); return this.starting;
  }
  open() {
    return new Promise((resolve,reject)=>{
      const child=this.platform==='darwin'?this.spawnProcess(path.join(this.engineDir,'mac-keys'),[],{windowsHide:true}):this.spawnProcess('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.nativeDir,'windows-keys.ps1')],{windowsHide:true});
      this.child=child;let stderr='',settled=false,failed=false;
      const lines=createInterface({input:child.stdout});
      const fail=message=>{ if(this.child!==child||failed)return;failed=true;clearTimeout(timeout);this.ready=false;this.error=message;clearTimeout(this.timer);this.router.cancelRecord();this.emit({type:'dictation-stop'});this.emit({type:'binding-cancelled',message});this.emit({type:'keyboard-status',ready:false,error:message});if(!settled){settled=true;reject(new Error(message));}child.kill(); };
      const timeout=setTimeout(()=>{fail('Keyboard access did not start. Open Settings and check keyboard access.');child.kill();},10000);
      child.stderr.on('data',data=>{stderr=(stderr+data).slice(-1500);});
      child.once('error',error=>{clearTimeout(timeout);fail(error.message);});
      child.stdin.on('error',error=>fail(error.message));
      child.once('close',code=>{clearTimeout(timeout);lines.close();fail(stderr.trim()||`Keyboard access stopped (${code}). Check permissions and reconnect in Settings.`);});
      const names=new Map(Object.entries(keyMap(this.platform)).map(([name,code])=>[code,name]));
      lines.on('line',line=>{
        if(this.child!==child||failed)return;
        let event;try{event=JSON.parse(line);}catch{fail('Keyboard helper returned an invalid event. Reinstall MatiQ Voice.');child.kill();return;}
        if(event.ready){clearTimeout(timeout);this.ready=true;this.error='';this.configureNative();this.emit({type:'keyboard-status',ready:true,error:''});if(!settled){settled=true;resolve();}return;}
        if(event.reset){this.router.reset();this.emit({type:'dictation-stop'});return;}
        if(!Number.isInteger(event.key)||typeof event.down!=='boolean')return;
        const code=names.get(event.key);
        if(code)this.router.key(code,event.down);
        else if(this.router.recording){this.cancelRecord();this.emit({type:'binding-cancelled',message:'The system did not identify that key. Try another binding.'});}
      });
    });
  }
  configure(bindings){this.router.configure(bindings);this.configureNative();}
  record(mode){if(!this.ready)throw new Error(this.error||'Enable keyboard access before recording a binding.');clearTimeout(this.timer);this.router.record(mode);this.configureNative();this.timer=setTimeout(()=>{this.cancelRecord();this.emit({type:'binding-cancelled',message:'Binding recording timed out. Click Record binding and try again.'});},15000);}
  cancelRecord(){clearTimeout(this.timer);this.router.cancelRecord();this.configureNative();}
  reset(){this.router.reset();this.configureNative();this.emit({type:'dictation-stop'});}
  stop(){clearTimeout(this.timer);this.router.cancelRecord();const child=this.child;this.child=null;this.ready=false;child?.stdin.end();}
}
module.exports={Keyboard};

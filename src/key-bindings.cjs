const MAC_KEYS = {
  KeyA:0, KeyS:1, KeyD:2, KeyF:3, KeyH:4, KeyG:5, KeyZ:6, KeyX:7, KeyC:8, KeyV:9, IntlBackslash:10, KeyB:11,
  KeyQ:12, KeyW:13, KeyE:14, KeyR:15, KeyY:16, KeyT:17, Digit1:18, Digit2:19, Digit3:20, Digit4:21, Digit6:22, Digit5:23,
  Equal:24, Digit9:25, Digit7:26, Minus:27, Digit8:28, Digit0:29, BracketRight:30, KeyO:31, KeyU:32, BracketLeft:33,
  KeyI:34, KeyP:35, Enter:36, KeyL:37, KeyJ:38, Quote:39, KeyK:40, Semicolon:41, Backslash:42, Comma:43, Slash:44,
  KeyN:45, KeyM:46, Period:47, Tab:48, Space:49, Backquote:50, Backspace:51, Escape:53, MetaRight:54, MetaLeft:55,
  ShiftLeft:56, CapsLock:57, AltLeft:58, ControlLeft:59, ShiftRight:60, AltRight:61, ControlRight:62, Fn:63,
  F17:64, NumpadDecimal:65, NumpadMultiply:67, NumpadAdd:69, NumLock:71, NumpadDivide:75, NumpadEnter:76, NumpadSubtract:78,
  F18:79, F19:80, NumpadEqual:81, Numpad0:82, Numpad1:83, Numpad2:84, Numpad3:85, Numpad4:86, Numpad5:87,
  Numpad6:88, Numpad7:89, F20:90, Numpad8:91, Numpad9:92, IntlYen:93, IntlRo:94, NumpadComma:95, F5:96, F6:97, F7:98, F3:99,
  F8:100, F9:101, Lang2:102, F11:103, Lang1:104, F13:105, F16:106, F14:107, F10:109, F12:111, F15:113, Home:115, PageUp:116,
  Delete:117, F4:118, End:119, F2:120, PageDown:121, F1:122, ArrowLeft:123, ArrowRight:124, ArrowDown:125, ArrowUp:126
};
const WINDOWS_KEYS = {Backspace:8, Tab:9, Enter:13, CapsLock:20, Escape:27, Space:32, PageUp:33, PageDown:34, End:35, Home:36,
  ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40, Insert:45, Delete:46, MetaLeft:91, MetaRight:92, ContextMenu:93,
  NumpadMultiply:106, NumpadAdd:107, NumpadSubtract:109, NumpadDecimal:110, NumpadDivide:111, NumLock:144, ScrollLock:145,
  ShiftLeft:160, ShiftRight:161, ControlLeft:162, ControlRight:163, AltLeft:164, AltRight:165, Semicolon:186, Equal:187,
  Comma:188, Minus:189, Period:190, Slash:191, Backquote:192, BracketLeft:219, Backslash:220, BracketRight:221, Quote:222,
  NumpadEnter:269};
for (let i=0;i<26;i++) WINDOWS_KEYS[`Key${String.fromCharCode(65+i)}`]=65+i;
for (let i=0;i<10;i++) { WINDOWS_KEYS[`Digit${i}`]=48+i; WINDOWS_KEYS[`Numpad${i}`]=96+i; }
for (let i=1;i<=24;i++) WINDOWS_KEYS[`F${i}`]=111+i;
const keyMap = platform => platform === 'darwin' ? MAC_KEYS : WINDOWS_KEYS;
const DEFAULT_BINDINGS = {toggle:['MetaLeft','AltLeft','ShiftLeft','Space'], hold:[]};
function validateBindings(value, platform = process.platform) {
  if (!value || typeof value !== 'object') throw new Error('Record a toggle or push-to-talk binding.');
  const result = {};
  for (const mode of ['toggle','hold']) {
    const keys=value[mode];
    if (!Array.isArray(keys) || keys.length>32 || keys.some(key=>!Object.hasOwn(keyMap(platform),key)) || new Set(keys).size!==keys.length) throw new Error('That binding contains an unsupported key. Record it again.');
    result[mode]=[...keys].sort();
  }
  if (result.toggle.length && result.hold.length && (result.toggle.every(key=>result.hold.includes(key)) || result.hold.every(key=>result.toggle.includes(key)))) throw new Error('Toggle and push to talk overlap. Record combinations that do not contain one another.');
  return result;
}
function migrateBindings(settings, platform = process.platform) {
  if (settings.bindings) return validateBindings(settings.bindings,platform);
  const modifiers={Command:'MetaLeft',Control:'ControlLeft',Alt:'AltLeft',Shift:'ShiftLeft',Super:'MetaLeft'};
  if (settings.shortcut) {
    const parts=settings.shortcut.split('+'), key=parts.pop();
    const punctuation={'.':'Period',',':'Comma','/':'Slash',';':'Semicolon',"'":'Quote','`':'Backquote','=':'Equal','-':'Minus','[':'BracketLeft',']':'BracketRight','\\':'Backslash'};
    return validateBindings({toggle:[...parts.map(part=>modifiers[part]),/^[A-Z]$/.test(key)?`Key${key}`:/^[0-9]$/.test(key)?`Digit${key}`:punctuation[key]||key],hold:[]},platform);
  }
  return validateBindings(platform==='darwin'?DEFAULT_BINDINGS:{toggle:['ControlLeft','AltLeft','ShiftLeft','Space'],hold:[]},platform);
}
class BindingRouter {
  constructor(bindings, emit) { this.emit=emit; this.bindings=bindings; this.pressed=new Set(); this.active={toggle:false,hold:false}; this.recording=null; this.peak=[]; }
  reset() {
    if(this.active.hold) this.emit({type:'dictation-stop'});
    this.pressed.clear(); this.active={toggle:false,hold:false};
  }
  configure(bindings) { this.reset(); this.bindings=bindings; }
  record(mode) { this.reset(); this.recording=mode; this.peak=[]; }
  cancelRecord() { this.recording=null; this.peak=[]; this.reset(); }
  key(code,down) {
    if(down===this.pressed.has(code)) return;
    if(down) this.pressed.add(code); else this.pressed.delete(code);
    if(this.recording) {
      if(this.pressed.size>this.peak.length) this.peak=[...this.pressed].sort();
      this.emit({type:'binding-preview',mode:this.recording,keys:[...this.pressed].sort()});
      if(!this.pressed.size && this.peak.length) { const mode=this.recording,keys=this.peak; this.cancelRecord(); this.emit({type:'binding-recorded',mode,keys}); }
      return;
    }
    for(const mode of ['toggle','hold']) {
      const keys=this.bindings[mode],matched=keys.length>0 && keys.every(key=>this.pressed.has(key));
      if(matched && !this.active[mode]) this.emit({type:mode==='toggle'?'toggle':'dictation-start'});
      if(!matched && this.active[mode] && mode==='hold') this.emit({type:'dictation-stop'});
      this.active[mode]=matched;
    }
  }
}
module.exports={MAC_KEYS,WINDOWS_KEYS,keyMap,DEFAULT_BINDINGS,validateBindings,migrateBindings,BindingRouter};

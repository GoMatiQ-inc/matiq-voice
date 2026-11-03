const {spawn,execFile} = require('node:child_process');
const execFileAsync=require('node:util').promisify(execFile);
const {createInterface} = require('node:readline');

function captureTarget(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {windowsHide: true});
    const lines = createInterface({input: child.stdout});
    let ready = false, terminal = false, stderr = '', pasteResolve, pasteReject;
    let timeout = setTimeout(() => { child.kill(); reject(new Error('Destination tracking could not start. Use Copy.')); }, 10000);
    child.stderr.on('data', value => { stderr = (stderr + value).slice(-1500); });
    child.once('error', error => { clearTimeout(timeout); reject(error); pasteReject?.(error); });
    child.stdin.on('error', error => { child.kill(); reject(error); pasteReject?.(error); });
    child.once('close', code => {
      clearTimeout(timeout); terminal = true; lines.close();
      if (!ready) reject(new Error(stderr || `Destination tracking failed (${code}). Use Copy.`));
      if (code === 0) pasteResolve?.(); else pasteReject?.(new Error(stderr || 'The destination changed. Copy your transcript into the intended text field.'));
    });
    lines.once('line', line => {
      if (line !== 'ready') { child.kill(); return; }
      ready = true;
      clearTimeout(timeout);
      timeout = setTimeout(() => { child.kill(); pasteReject?.(new Error('Destination tracking expired. Copy the transcript manually.')); }, 20 * 60000);
      resolve({
        paste(text) { return new Promise((done, fail) => { if (terminal) { fail(new Error('Destination tracking ended. Use Copy.')); return; } pasteResolve = done; pasteReject = fail; child.stdin.end('paste\n' + (process.platform === 'darwin' ? JSON.stringify(text) + '\n' : '')); }); },
        cancel() { if (!terminal) child.stdin.end('cancel\n'); }
      });
    });
  });
}
async function readPasteAccess(executable,{request=false,run=execFileAsync}={}) {
  const {stdout}=await run(executable,[request?'request-permissions':'permissions'],{timeout:5000,maxBuffer:1024,windowsHide:true});
  const result=JSON.parse(stdout);
  if(typeof result.accessibility!=='boolean') throw new Error('Paste helper returned an invalid permission status. Reinstall MatiQ Voice.');
  return {accessibility:result.accessibility};
}
module.exports = {captureTarget,readPasteAccess};

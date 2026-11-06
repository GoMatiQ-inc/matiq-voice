const exited=new WeakSet(),watched=new WeakSet();
function watch(child){if(!watched.has(child)){watched.add(child);child.once('exit',()=>exited.add(child));child.once('close',()=>exited.add(child));}return child;}
function hasExited(child){return exited.has(child)||(child.exitCode!==undefined&&child.exitCode!==null)||(child.signalCode!==undefined&&child.signalCode!==null);}
function waitForExit(child,timeoutMs=5000){watch(child);if(hasExited(child))return Promise.resolve();return new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);child.removeListener('exit',finish);child.removeListener('close',finish);resolve();};const timer=setTimeout(()=>{child.removeListener('exit',finish);child.removeListener('close',finish);reject(Error('Voice helper did not stop. Inspect its owned process before closing.'));},timeoutMs);child.once('exit',finish);child.once('close',finish);});}
module.exports={watch,hasExited,waitForExit};

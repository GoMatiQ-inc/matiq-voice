import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
if(process.platform!=='darwin') throw new Error('Regenerate the Mac icon on macOS with sips and iconutil. The generated ICNS is committed for other build hosts.');
const root=path.resolve(import.meta.dirname,'..'), temporary=await fs.mkdtemp(path.join(os.tmpdir(),'matiq-icon-'));
function run(command,args) {const r=spawnSync(command,args,{encoding:'utf8'});if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr || r.stdout);}
try {
  const iconset=path.join(temporary,'MatiQ.iconset');await fs.mkdir(iconset);
  for(const size of [16,32,128,256,512]) for(const scale of [1,2]) run('/usr/bin/sips',['-z',String(size*scale),String(size*scale),path.join(root,'src/ui/assets/app-icon.png'),'--out',path.join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`)]);
  await fs.mkdir(path.join(root,'build'),{recursive:true});
  run('/usr/bin/iconutil',['--convert','icns','--output',path.join(root,'build/icon.icns'),iconset]);
  console.log('Mac icon generated with native encoders at all standard sizes.');
} finally {await fs.rm(temporary,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
if (process.platform !== 'darwin') throw new Error('Run installer verification on macOS, where pkgutil is available.');
const root=path.resolve(import.meta.dirname,'..');
const pkg=process.argv[2] || path.join(root,'dist',`MatiQ-Voice-${JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version}-mac-${process.arch}.pkg`);
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'matiq-installer-check-'));
function run(args) {
  const result=spawnSync('/usr/sbin/pkgutil',args,{encoding:'utf8',maxBuffer:8*1024*1024});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`pkgutil failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
try {
  const expanded=path.join(temporary,'expanded');run(['--expand-full',pkg,expanded]);
  const distribution=await fs.readFile(path.join(expanded,'Distribution'),'utf8');
  assert.match(distribution,/<domains[^>]*enable_anywhere="false"[^>]*enable_currentUserHome="false"[^>]*enable_localSystem="true"/,'Installer must offer only the system installation domain.');
  const component=path.join(expanded,'com.matiq.voice.pkg');
  const info=await fs.readFile(path.join(component,'PackageInfo'),'utf8');
  assert.match(info,/install-location="\/Applications"/,'Install into the Finder Applications folder.');
  assert.match(info,/relocatable="false"/,'Upgrades must not follow a moved copy into another folder.');
  assert.match(info,/<preinstall\b/,'Refuse replacement while the app is running.');
  assert.ok((await fs.stat(path.join(component,'Scripts','preinstall'))).mode & 0o111,'The packaged preinstall guard must be executable.');
  const embeddedIcon=await fs.readFile(path.join(component,'Payload','MatiQ Voice.app','Contents','Resources','icon.icns'));
  assert.ok(embeddedIcon.equals(await fs.readFile(path.join(root,'build/icon.icns'))),'Installer must retain the native-encoded icon, including its verified 16-pixel representation.');
  const files=run(['--payload-files',pkg]).trim().split('\n');
  assert.ok(files.includes('./MatiQ Voice.app/Contents/MacOS/MatiQ Voice'),'Package must contain the application executable.');
  assert.ok(files.every(file=>file==='.' || file==='./MatiQ Voice.app' || file.startsWith('./MatiQ Voice.app/')),'Installer must not write into user profiles or permission databases.');
  console.log('Mac installer verified: /Applications only, relocation disabled, running-app guard present, application-only payload and native-encoded icon.');
} finally {await fs.rm(temporary,{recursive:true,force:true});}

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {downloadAsset, verifyAsset} = require('./assets.cjs');
const {MODELS} = require('./core.cjs');
function sharedRoot(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'MatiQ', 'Models');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'MatiQ', 'Models');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'matiq', 'models');
}
function speechAsset(id) {
  if (!Object.hasOwn(MODELS,id)) throw new Error('Choose a listed speech model.');
  return {...MODELS[id], file:`ggml-${id}.bin`, url:`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`};
}
function locations(asset, directory, root) {
  if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !/^[A-Za-z0-9._-]+$/.test(asset.file) || !Number.isSafeInteger(asset.bytes) || asset.bytes<1) throw new Error('Use a verified model catalog entry.');
  const kind=asset.file.startsWith('ggml-')?'asr':'speaker';
  return {kind,shared:path.join(root,kind,asset.sha256,asset.file),local:path.join(directory,asset.file)};
}
async function linkOrCopy(source,destination,bytes) {
  try { await fs.link(source,destination); }
  catch(error) {
    if (!['EXDEV','ENOTSUP','EPERM'].includes(error.code)) throw error;
    const disk=await fs.statfs(path.dirname(destination));
    if(Number(disk.bavail)*Number(disk.bsize)<bytes+2*1024**3) throw new Error('Free disk space before copying a shared model; leave at least 2 GiB afterwards.');
    await fs.copyFile(source,destination,require('node:fs').constants.COPYFILE_EXCL);
  }
}
async function sharedDownloadAsset(asset,directory,progress,signal,root=sharedRoot(),{allowDownload=true}={}) {
  signal?.throwIfAborted();
  const {kind,shared,local}=locations(asset,directory,root);
  await fs.mkdir(path.dirname(shared),{recursive:true,mode:0o700});
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const lock=await fs.open(shared+'.lock','wx',0o600).catch(error=>{
    if(error.code==='EEXIST') throw new Error('Another MatiQ app is using this model. Wait for it to finish; inspect a stale lock before removing it.');
    throw error;
  });
  try {
    if(!await verifyAsset(shared,asset)) {
      if(await verifyAsset(local,asset)) {
        await linkOrCopy(local,shared+'.adopt',asset.bytes);
        await fs.rename(shared+'.adopt',shared);
      } else {
        if(!allowDownload) throw new Error('No verified offline model is available. Use Verify/download models to retrieve it.');
        await downloadAsset(asset,path.dirname(shared),progress,signal);
      }
    }
    signal?.throwIfAborted();
    if(!await verifyAsset(shared,asset)) throw new Error('The shared model did not pass verification. Download again.');
    await fs.writeFile(shared+'.json.partial',JSON.stringify({schema:1,id:asset.file,kind,format:kind==='asr'?'ggml':'onnx',sha256:asset.sha256,bytes:asset.bytes,license:'See bundled Voice model notices'})+'\n',{mode:0o600});
    await fs.rename(shared+'.json.partial',shared+'.json');
    if(!await verifyAsset(local,asset)) {
      await linkOrCopy(shared,local+'.shared-download',asset.bytes);
      await fs.rename(local+'.shared-download',local);
    }
    progress(100);
  } finally {
    await fs.rm(shared+'.adopt',{force:true});
    await fs.rm(shared+'.json.partial',{force:true});
    await fs.rm(local+'.shared-download',{force:true});
    await lock.close();await fs.rm(shared+'.lock',{force:true});
  }
}
async function adoptExistingAssets(assets,directory,root=sharedRoot()) {
  const adopted=[];
  for(const asset of assets) {
    const {shared,local}=locations(asset,directory,root);
    if(!await verifyAsset(local,asset) && !await verifyAsset(shared,asset)) continue;
    await sharedDownloadAsset(asset,directory,()=>{},undefined,root,{allowDownload:false});
    adopted.push(asset.file);
  }
  return adopted;
}
module.exports={sharedRoot,speechAsset,sharedDownloadAsset,adoptExistingAssets};

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {sharedRoot, sharedDownloadAsset} = require('../src/shared-models.cjs');
test('existing verified Voice weights become a typed shared artifact without another download', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-shared-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const data = Buffer.from('speech test'), asset = {file: 'ggml-test.bin', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')};
  const local = path.join(root, 'voice'), shared = path.join(root, 'store');
  await fs.mkdir(local); await fs.writeFile(path.join(local, asset.file), data);
  await sharedDownloadAsset(asset, local, () => {}, undefined, shared);
  const file = path.join(shared, 'asr', asset.sha256, asset.file);
  assert.equal(await fs.readFile(file, 'utf8'), 'speech test');
  assert.equal(JSON.parse(await fs.readFile(file + '.json', 'utf8')).kind, 'asr');
  await fs.unlink(file); await fs.writeFile(file, 'corrupt shared bytes');
  await sharedDownloadAsset(asset, local, () => {}, undefined, shared);
  assert.equal(await fs.readFile(file, 'utf8'), 'speech test');
  await sharedDownloadAsset(asset, path.join(root, 'second-app'), () => {}, undefined, shared);
  assert.equal(await fs.readFile(path.join(root, 'second-app', asset.file), 'utf8'), 'speech test');
  assert.equal(sharedRoot('darwin', '/Users/test', {}), path.join('/Users/test', 'Library', 'Application Support', 'MatiQ', 'Models'));
});

test('startup adopts verified cached or local weights offline, leaving missing models for explicit download',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'voice-offline-share-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {adoptExistingAssets}=require('../src/shared-models.cjs');
 const data=Buffer.from('verified speech bytes'),asset={file:'ggml-test.bin',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
 const original=path.join(root,'original'),second=path.join(root,'second'),store=path.join(root,'store');await fs.mkdir(original);await fs.writeFile(path.join(original,asset.file),data);
 const fetchBefore=global.fetch;global.fetch=()=>{throw Error('Offline startup must not access the network');};t.after(()=>{global.fetch=fetchBefore;});
 assert.deepEqual(await adoptExistingAssets([asset],original,store),[asset.file]);
 assert.deepEqual(await adoptExistingAssets([asset],second,store),[asset.file]);
 assert.deepEqual(await fs.readFile(path.join(second,asset.file)),data);
 const missing={...asset,file:'missing.bin',sha256:'a'.repeat(64)};
 assert.deepEqual(await adoptExistingAssets([missing],second,store),[]);
 assert.equal((await fs.stat(path.join(original,asset.file))).ino,(await fs.stat(path.join(second,asset.file))).ino);
});
test('sharing never breaks another app lock and refuses corrupted offline weights',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'voice-share-lock-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const data=Buffer.from('good'),asset={file:'ggml-test.bin',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')},store=path.join(root,'store'),local=path.join(root,'voice');
 const file=path.join(store,'asr',asset.sha256,asset.file);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.lock','another owner');
 await assert.rejects(sharedDownloadAsset(asset,local,()=>{},undefined,store,{allowDownload:false}),/Another MatiQ app/);
 assert.equal(await fs.readFile(file+'.lock','utf8'),'another owner');await fs.unlink(file+'.lock');
 await fs.writeFile(file,'bad!');await assert.rejects(sharedDownloadAsset(asset,local,()=>{},undefined,store,{allowDownload:false}),/No verified offline model/);
 await assert.rejects(fs.stat(file+'.lock'),{code:'ENOENT'});
});

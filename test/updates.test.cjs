const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createUpdates} = require('../src/updates.cjs');
function fixture(enabled = true) {
  const updater = new EventEmitter(), events = [];
  let idle = true, installs = 0, downloads = 0, checks = 0;
  updater.setFeedURL = feed => assert.deepEqual(feed, {provider:'github', owner:'GoMatiQ-inc', repo:'matiq-voice'});
  updater.checkForUpdates = async () => { checks++; return {isUpdateAvailable:true, cancellationToken:{}, updateInfo:{version:'0.3.8'}}; };
  updater.downloadUpdate = async () => { downloads++; updater.emit('update-downloaded', {version:'0.3.8'}); };
  updater.quitAndInstall = (silent, restart) => { assert.equal(silent,false); assert.equal(restart,true); installs++; };
  const service = createUpdates({updater, enabled, isIdle:()=>idle, emit:event=>events.push(event)});
  return {updater, service, events, setIdle:value=>idle=value, counts:()=>({installs,downloads,checks})};
}
test('official updates download once, require explicit idle restart, and preserve safe updater settings', async () => {
  const f=fixture();
  assert.equal(f.updater.autoInstallOnAppQuit,false); assert.equal(f.updater.autoDownload,false);
  assert.equal(f.updater.allowDowngrade,false); assert.equal(f.updater.allowPrerelease,false);
  await f.service.check(); assert.equal(f.service.status.phase,'ready');
  f.setIdle(false); assert.throws(()=>f.service.install(),/Finish dictation/);
  assert.equal(f.counts().installs,0);
  f.setIdle(true); f.service.install(); assert.equal(f.service.installing,true);
  assert.throws(()=>f.service.install(),/Download an update/);
  await f.service.check(); assert.deepEqual(f.counts(),{checks:1,downloads:1,installs:1});
  f.service.dispose(); assert.equal(f.updater.listenerCount('error'),0);
});
test('development and unsigned previews never check or install', async () => {
  const f=fixture(false); await f.service.check(); assert.equal(f.service.status.phase,'disabled');
  assert.throws(()=>f.service.install(),/Download an update/); assert.deepEqual(f.counts(),{checks:0,downloads:0,installs:0});
});
test('no newer version does not download; connection and verification failures are visible and retryable', async () => {
  const f=fixture(); f.updater.checkForUpdates=async()=>({isUpdateAvailable:false});
  await f.service.check(); assert.equal(f.service.status.phase,'current'); assert.equal(f.counts().downloads,0);
  f.updater.checkForUpdates=async()=>{throw new Error('Network unavailable');};
  await f.service.check(); assert.match(f.service.status.message,/Network unavailable/);
  f.updater.checkForUpdates=async()=>({cancellationToken:{},updateInfo:{version:'0.3.8'}});
  f.updater.downloadUpdate=async()=>{throw new Error('SHA512 mismatch');};
  await f.service.check(); assert.equal(f.service.status.phase,'error'); assert.match(f.service.status.message,/SHA512 mismatch/);
  assert.throws(()=>f.service.install(),/Download an update/);
});
test('concurrent checks are serialized and installation failures are visible', async () => {
  const f=fixture(); let release;
  f.updater.checkForUpdates=()=>new Promise(resolve=>release=resolve);
  const pending=f.service.check(); await f.service.check(); assert.equal(f.service.status.phase,'checking');
  release({cancellationToken:{},updateInfo:{version:'0.3.8'}}); await pending;
  f.updater.quitAndInstall=()=>{throw new Error('Installer unavailable');};
  assert.throws(()=>f.service.install(),/Installer unavailable/); assert.equal(f.service.installing,false);
  assert.equal(f.service.status.phase,'error');
  f.updater.checkForUpdates=async()=>({isUpdateAvailable:false});
  await f.service.check(); assert.equal(f.service.status.phase,'current');
});

test('asynchronous native install failure remains visible and cannot resume audio before reopening', async () => {
  const f=fixture(); await f.service.check(); f.service.install();
  assert.equal(f.service.status.phase,'installing');
  f.updater.emit('error',new Error('Signature rejected'));
  assert.equal(f.service.installing,true); assert.equal(f.service.status.restartPending,true);
  assert.match(f.service.status.message,/Quit and reopen/);
});

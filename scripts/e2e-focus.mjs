import {_electron as electron} from 'playwright';
import {expect} from 'playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-focus-'));
let app, clipboardText;
try {
  await fs.writeFile(path.join(temporary, 'fixture.html'), '<!doctype html><html><title>MatiQ Voice focus test</title><body><label>First text field<textarea id="first"></textarea></label><label>Second text field<textarea id="second"></textarea></label></body></html>');
  await fs.writeFile(path.join(temporary, 'entry.cjs'), `const {app,BrowserWindow,Menu}=require('electron');app.setName('MatiQ Voice Focus Test');globalThis.verifyForeground=()=>{if(process.platform==='darwin'){const actual=Number(require('node:child_process').execFileSync(${JSON.stringify(path.join(root, 'engine/mac-input'))},['capture'],{encoding:'utf8'}).trim());if(actual!==process.pid)throw new Error('Test window is not the foreground app; no key events will be posted.');}};globalThis.startFocus=()=>require(${JSON.stringify(path.join(root, 'src/input.cjs'))}).captureTarget(${JSON.stringify(process.platform === 'darwin' ? path.join(root, 'engine/mac-input') : 'powershell.exe')},${JSON.stringify(process.platform === 'darwin' ? ['session'] : ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'native/windows-input.ps1'),'-Action','session'])});app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))});app.whenReady().then(()=>{app.accessibilitySupportEnabled=true;Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'}]));const win=new BrowserWindow({width:700,height:500,webPreferences:{nodeIntegration:false,contextIsolation:true}});win.loadFile(${JSON.stringify(path.join(temporary, 'fixture.html'))});win.show();app.focus({steal:true});win.focus();});`);
  app = await electron.launch({executablePath: require('electron'), args: ['--force-renderer-accessibility', path.join(temporary, 'entry.cjs')]});
  const page = await app.firstWindow(); await page.locator('#first').waitFor();
  await page.evaluate(() => { window.keyEvents = []; addEventListener('keydown', event => window.keyEvents.push({key: event.key, meta: event.metaKey})); });
  clipboardText = await app.evaluate(({clipboard}) => clipboard.readText());
  async function capture() { await app.evaluate(async () => { globalThis.verifyForeground();globalThis.focusTarget = await globalThis.startFocus(); }); }
  await page.locator('#first').click(); await capture();
  await app.evaluate(async ({clipboard}) => { clipboard.writeText('Native insertion E2E.'); await globalThis.focusTarget.paste(); });
  try { await expect(page.locator('#first')).toHaveValue('Native insertion E2E.', {timeout: 5000}); } catch (error) { console.log('Fixture key events:', await page.evaluate(() => window.keyEvents)); throw error; }
  await page.locator('#first').fill(''); await page.locator('#first').click(); await capture(); await page.locator('#second').click();
  const rejected = await app.evaluate(async ({clipboard}) => { clipboard.writeText('Must not reach the wrong field.'); try { await globalThis.focusTarget.paste(); return false; } catch { return true; } });
  if (!rejected) throw new Error('Changed text field was not rejected.');
  await expect(page.locator('#first')).toHaveValue(''); await expect(page.locator('#second')).toHaveValue('');
  console.log('PASS: native insertion into the selected field; changed field rejected without insertion.');
} finally {
  if (app) { await app.evaluate(({clipboard}) => globalThis.focusTarget?.cancel()).catch(() => {}); if (clipboardText !== undefined) await app.evaluate(({clipboard}, text) => clipboard.writeText(text), clipboardText).catch(() => {}); await app.close(); }
  await fs.rm(temporary, {recursive: true, force: true});
}

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
  clipboardText = await app.evaluate(({clipboard}) => clipboard.readText());
  async function capture() { await app.evaluate(async () => { globalThis.verifyForeground();globalThis.focusTarget = await globalThis.startFocus(); }); }
  const field = page.locator('#first');
  async function position(text, start, end = start) {
    await field.fill(text);
    await field.evaluate((input, range) => { input.focus(); input.setSelectionRange(...range); }, [start, end]);
    await capture();
    expect(await field.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([start, end]);
  }
  async function insert(text, expected, caret) {
    await app.evaluate(async ({clipboard}, text) => { clipboard.writeText(text); await globalThis.focusTarget.paste(text); }, text);
    await expect(field).toHaveValue(expected, {timeout: 5000});
    await expect.poll(() => field.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([caret, caret]);
  }
  await position('', 0);
  await insert('Native insertion E2E.', 'Native insertion E2E.', 21);
  for (const [caret, expected] of [[0, 'said Before 🌍 after'], [7, 'Before said 🌍 after'], [15, 'Before 🌍 aftersaid ']]) {
    await position('Before 🌍 after', caret);
    await insert('said ', expected, caret + 5);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(field).toHaveValue('Before 🌍 after');
  }
  await position('Before 🌍 after', 9);
  await insert(' first', 'Before 🌍 first after', 15);
  await capture();
  await insert(' second', 'Before 🌍 first second after', 22);
  await position('Before 🌍 after', 7, 9);
  await insert('world ', 'Before world 🌍 after', 13);
  await position('Keep this text', 5);
  await field.evaluate(input => input.setSelectionRange(0, 0));
  const moved = await app.evaluate(async ({clipboard}) => { clipboard.writeText('wrong'); try { await globalThis.focusTarget.paste('wrong'); return false; } catch { return true; } });
  expect(moved).toBe(true);
  await expect(field).toHaveValue('Keep this text');
  await position('', 0);
  await page.locator('#second').click();
  const rejected = await app.evaluate(async ({clipboard}) => { clipboard.writeText('Must not reach the wrong field.'); try { await globalThis.focusTarget.paste('Must not reach the wrong field.'); return false; } catch { return true; } });
  expect(rejected).toBe(true);
  await expect(field).toHaveValue(''); await expect(page.locator('#second')).toHaveValue('');
  console.log('PASS: native paste at beginning/middle/end, unchanged capture caret, Unicode, repeated insertion, preserved selection and Undo; moved caret/field rejected.');

} finally {
  if (app) { await app.evaluate(({clipboard}) => globalThis.focusTarget?.cancel()).catch(() => {}); if (clipboardText !== undefined) await app.evaluate(({clipboard}, text) => clipboard.writeText(text), clipboardText).catch(() => {}); await app.close(); }
  await fs.rm(temporary, {recursive: true, force: true});
}

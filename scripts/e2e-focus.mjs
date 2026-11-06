import {_electron as electron, chromium} from 'playwright';
import {expect} from 'playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-focus-'));
let app, overlay, browser, clipboardText;
try {
  await fs.writeFile(path.join(temporary, 'fixture.html'), '<!doctype html><html><title>MatiQ Voice focus test</title><body><div id="rich" contenteditable="true" role="textbox" aria-label="Rich text field"></div><label>First text field<textarea id="first"></textarea></label><label>Second text field<textarea id="second"></textarea></label></body></html>');
  await fs.writeFile(path.join(temporary, 'entry.cjs'), `const {app,BrowserWindow,Menu}=require('electron');app.setName('MatiQ Voice Focus Test');globalThis.verifyForeground=()=>{if(process.platform==='darwin'){const actual=Number(require('node:child_process').execFileSync(${JSON.stringify(path.join(root, 'engine/mac-input'))},['capture'],{encoding:'utf8'}).trim());if(actual!==process.pid)throw new Error('Test window is not the foreground app; no key events will be posted.');}};globalThis.startFocus=()=>require(${JSON.stringify(path.join(root, 'src/input.cjs'))}).captureTarget(${JSON.stringify(process.platform === 'darwin' ? path.join(root, 'engine/mac-input') : 'powershell.exe')},${JSON.stringify(process.platform === 'darwin' ? ['session'] : ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'native/windows-input.ps1'),'-Action','session'])});app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))});globalThis.startKeyboard=async()=>{globalThis.keyEvents=[];globalThis.keyboard=new(require(${JSON.stringify(path.join(root,'src/keyboard.cjs'))}).Keyboard)({engineDir:${JSON.stringify(path.join(root,'engine'))},nativeDir:${JSON.stringify(path.join(root,'native'))},bindings:{toggle:['ArrowLeft','ArrowRight','ArrowUp'],hold:[]},emit:event=>globalThis.keyEvents.push(event)});await globalThis.keyboard.start();};app.whenReady().then(()=>{if(process.platform!=='darwin')app.accessibilitySupportEnabled=true;Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'}]));const win=new BrowserWindow({width:700,height:500,webPreferences:{nodeIntegration:false,contextIsolation:true}});win.loadFile(${JSON.stringify(path.join(temporary, 'fixture.html'))});win.show();app.focus({steal:true});win.focus();});`);
  app = await electron.launch({executablePath: require('electron'), args: [...(process.platform === 'darwin' ? [] : ['--force-renderer-accessibility']), path.join(temporary, 'entry.cjs')]});
  const page = await app.firstWindow(); await page.locator('#first').waitFor();
  clipboardText = await app.evaluate(({clipboard}) => clipboard.readText());
  async function capture() {
    await expect.poll(async () => {
      try { await app.evaluate(async () => { globalThis.verifyForeground(); globalThis.focusTarget = await globalThis.startFocus(); }); return 'ready'; }
      catch (error) { return error.message; }
    }, {timeout: 10000}).toBe('ready');
  }
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
  if (process.platform === 'darwin') {
    await fs.writeFile(path.join(temporary, 'overlay.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temporary,'overlay-profile'))});app.whenReady().then(async()=>{globalThis.hud=new BrowserWindow({width:248,height:60,frame:false,transparent:true,hasShadow:false,resizable:false,focusable:false,alwaysOnTop:true,skipTaskbar:true,show:false});hud.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});await hud.loadURL('data:text/html,<body>Recording indicator</body>');app.dock?.hide();});`);
    overlay = await electron.launch({executablePath: require('electron'), args:[path.join(temporary,'overlay.cjs')]});
    await overlay.firstWindow();
    await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});
    for (let attempt=0;attempt<3;attempt++) {
      await field.fill('Before 🌍 after');
      await field.evaluate(input=>{input.focus();input.setSelectionRange(7,7);});
      await overlay.evaluate(()=>globalThis.hud.showInactive());
      await capture();
      await page.waitForTimeout(200);
      await overlay.evaluate(()=>globalThis.hud.showInactive());
      await insert('said ', 'Before said 🌍 after',12);
      await overlay.evaluate(()=>globalThis.hud.hide());
    }
    // Exercise a normal rich editor without pre-enabling its accessibility tree.
    const rich=page.locator('#rich');
    for (let attempt=0;attempt<3;attempt++) {
      await rich.fill('Before 🌍 after');
      await rich.evaluate(input=>{input.focus();const range=document.createRange();range.setStart(input.firstChild,7);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
      await capture();
      await page.waitForTimeout(200);
      await app.evaluate(async ({clipboard})=>{clipboard.writeText('said ');await globalThis.focusTarget.paste('said ');});
      await expect(rich).toHaveText('Before said 🌍 after');
    }
    console.log('PASS: background overlay preserves focus; cold rich-editor capture and delayed insertion work.');
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
  if (process.platform === 'darwin') {
    browser = await chromium.launch({channel: 'chrome', headless: false});
    const editor = await browser.newPage();
    await editor.setContent('<textarea id="browser-field">Before 🌍 after</textarea>');
    const browserField = editor.locator('#browser-field');
    await browserField.evaluate(input => { input.focus(); input.setSelectionRange(7, 7); });
    await editor.bringToFront();
    const session = await browser.newBrowserCDPSession();
    const {processInfo} = await session.send('SystemInfo.getProcessInfo');
    const ownedPid = processInfo.find(process => process.type === 'browser').id;
    const foreground = Number((await run(path.join(root, 'engine/mac-input'), ['capture'])).stdout.trim());
    expect(foreground, 'Only the owned Chrome fixture may receive test text.').toBe(ownedPid);
    await app.evaluate(async () => { globalThis.focusTarget = await globalThis.startFocus(); });
    await app.evaluate(async ({clipboard}) => { clipboard.writeText('said '); await globalThis.focusTarget.paste('said '); });
    await expect(browserField).toHaveValue('Before said 🌍 after');
    await browser.close(); browser = null;
    await app.evaluate(({app, BrowserWindow}) => { app.focus({steal: true}); BrowserWindow.getAllWindows()[0].focus(); });
    console.log('PASS: cold Chrome textarea receives native insertion at its existing caret.');
    const injector = path.join(temporary, 'key-events');
    await run('clang', ['-O2', '-framework', 'Cocoa', '-framework', 'ApplicationServices', path.join(root, 'test/fixtures/mac-key-events.m'), '-o', injector], {timeout: 30000});
    await app.evaluate(() => globalThis.startKeyboard());
    await page.evaluate(() => { window.nativeKeys = []; document.addEventListener('keydown', event => window.nativeKeys.push(event.key)); });
    await field.fill('Before after');
    await field.evaluate(input => { input.focus(); input.setSelectionRange(7, 7); });
    async function keys(...events) {
      const pid = await app.evaluate(() => { globalThis.verifyForeground(); return process.pid; });
      await run(injector, [String(pid), ...events], {timeout: 5000});
    }
    await keys('126d', '123d', '124d', '124u', '123u', '126u');
    await expect.poll(() => app.evaluate(() => globalThis.keyEvents.filter(event => event.type === 'toggle').length)).toBe(1);
    expect(await field.evaluate(input => input.selectionStart)).toBe(7);
    expect(await page.evaluate(() => window.nativeKeys)).toEqual([]);
    await keys('123d', '123u');
    await expect.poll(() => field.evaluate(input => input.selectionStart)).toBe(6);
    await keys('123d', '123r', '123u');
    await expect.poll(() => field.evaluate(input => input.selectionStart)).toBe(4);
    await keys('123d', '124d', '124u', '123u');
    await expect.poll(() => field.evaluate(input => input.selectionStart)).toBe(4);
    await field.evaluate(input => input.setSelectionRange(7, 7));
    await keys('126d', '124d', '7d', '7u', '124u', '126u');
    await expect(field).toHaveValue('Bxefore after');
    expect(await app.evaluate(() => globalThis.keyEvents.some(event => event.type === 'keyboard-status' && !event.ready))).toBe(false);
    console.log('PASS: native arrow chord leaves the caret unchanged; individual arrows, repeat and incomplete chords retain navigation.');
    await app.evaluate(() => globalThis.keyboard.stop());
  }
  console.log('PASS: native paste at beginning/middle/end, unchanged capture caret, Unicode, repeated insertion, preserved selection and Undo; moved caret/field rejected.');

} finally {
  if (browser) await browser.close();
  if (overlay) await overlay.close();
  if (app) { await app.evaluate(({clipboard}) => (globalThis.focusTarget?.cancel(), globalThis.keyboard?.stop())).catch(() => {}); if (clipboardText !== undefined) await app.evaluate(({clipboard}, text) => clipboard.writeText(text), clipboardText).catch(() => {}); await app.close(); }
  await fs.rm(temporary, {recursive: true, force: true});
}

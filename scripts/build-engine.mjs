import {spawnSync} from 'node:child_process';
import {mkdir, rm, copyFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, '.engine-build');
const destination = path.join(root, 'engine');
const commit = 'd1be6fde11ac6e0407606b4e42fe72d34add8037'; // whisper.cpp v1.9.5
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, stdio: 'inherit', shell: false});
  if (result.error) throw new Error(`Cannot run ${command}: ${result.error.message}. Install CMake and a C/C++ compiler; see README.md.`);
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}). Fix the build error above and retry.`);
}
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Build on macOS or Windows for the matching platform.');
run('cmake', ['--version']);
await mkdir(build, {recursive: true});
await mkdir(destination, {recursive: true});
const source = path.join(build, `whisper.cpp-${commit}`);
const response = await fetch(`https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/${commit}`);
if (!response.ok) throw new Error(`Cannot download pinned engine source (${response.status}).`);
const archive = Buffer.from(await response.arrayBuffer());
await writeFile(path.join(build, 'source.tar.gz'), archive);
run('tar', ['-xzf', path.join(build, 'source.tar.gz'), '-C', build]);
run('cmake', ['-S', source, '-B', path.join(build, 'output'), '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF',
  '-DGGML_METAL_EMBED_LIBRARY=ON', ...(process.platform === 'win32' ? ['-DGGML_OPENMP=OFF', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded$<$<CONFIG:Debug>:Debug>'] : ['-DCMAKE_OSX_DEPLOYMENT_TARGET=14.2'])]);
run('cmake', ['--build', path.join(build, 'output'), '--config', 'Release', '--target', 'whisper-cli', '--parallel', '4']);
const windows = process.platform === 'win32';
const filename = windows ? 'whisper-cli.exe' : 'whisper-cli';
await copyFile(path.join(build, 'output', 'bin', ...(windows ? ['Release'] : []), filename), path.join(destination, filename));
await copyFile(path.join(source, 'LICENSE'), path.join(destination, 'WHISPER-LICENSE'));
if (process.platform === 'darwin') run('clang', ['-O2', '-mmacosx-version-min=14.2', '-framework', 'Cocoa', '-framework', 'ApplicationServices', path.join(root, 'native', 'mac-input.m'), '-o', path.join(destination, 'mac-input')]);
await writeFile(path.join(destination, 'build.json'), JSON.stringify({engine: 'whisper.cpp', nativeInputVersion: 2, commit, version: '1.9.5', platform: process.platform, arch: process.arch, sourceSha256: createHash('sha256').update(archive).digest('hex')}, null, 2));
await rm(build, {recursive: true, force: true});
console.log(`Engine ready for ${process.platform}/${process.arch}. Source/build output removed.`);

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import yaml from 'js-yaml';
export async function verifyUpdateAssets(directory, version, platform) {
  const mac = platform === 'darwin';
  const name = `MatiQ-Voice-${version}-${mac ? 'mac-arm64.zip' : 'windows-x64.exe'}`;
  const metadataName = mac ? 'latest-mac.yml' : 'latest.yml';
  const metadata = yaml.load(await readFile(path.join(directory, metadataName), 'utf8'));
  const bytes = await readFile(path.join(directory, name));
  assert.equal(metadata.version, version, 'Update metadata must match the release version.');
  assert.equal(metadata.files?.length, 1, 'Publish only the qualified update package.');
  assert.equal(metadata.files[0].url, name, 'Update URL must identify the local qualified package.');
  assert.equal(metadata.files[0].sha512, createHash('sha512').update(bytes).digest('base64'), 'Update checksum does not match the package.');
  assert.equal(metadata.files[0].size, bytes.length, 'Update size does not match the package.');
  // Older updater clients may read these legacy fields.
  if (metadata.path !== undefined) assert.equal(metadata.path, name);
  if (metadata.sha512 !== undefined) assert.equal(metadata.sha512, metadata.files[0].sha512);
  return [name, metadataName];
}

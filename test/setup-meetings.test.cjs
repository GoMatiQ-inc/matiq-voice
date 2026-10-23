const {test} = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
const {recommendModel, GiB} = require('../src/hardware.cjs');
const {MeetingStore, sourceNotes, speakerFor} = require('../src/meetings.cjs');
test('hardware recommendations respect memory/CPU and reject unsupported systems', () => {
  const hardware = {platform: 'darwin', arch: 'arm64', memoryBytes: 24 * GiB, cores: 10};
  assert.equal(recommendModel(hardware).model, 'medium.en'); assert.equal(recommendModel({...hardware, memoryBytes: 8 * GiB}).model, 'small.en'); assert.equal(recommendModel({...hardware, memoryBytes: 4 * GiB}).model, 'base.en'); assert.equal(recommendModel({...hardware, cores: 2}).model, 'base.en');
  assert.throws(() => recommendModel({...hardware, memoryBytes: 2 * GiB}), /memory/); assert.throws(() => recommendModel({...hardware, platform: 'linux'}), /macOS or Windows/);
});
test('meeting audio survives restart with ordered chunks and visible interruption', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matiq-meetings-')); t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const {encodeWav} = await import('../src/ui/audio.mjs'); const audio = encodeWav([Float32Array.from({length: 16000}, (_, i) => Math.sin(i / 10) * .1)]);
  const store = new MeetingStore(directory); const meeting = await store.create({title: 'Fixture meeting', provider: 'google'});
  await store.append(meeting.id, 'microphone', 0, audio);
  await assert.rejects(store.append(meeting.id, 'microphone', 2, audio), /order/);
  await store.recover(); const recovered = await store.get(meeting.id); assert.equal(recovered.status, 'interrupted'); assert.equal(recovered.chunks.length, 1); assert.equal(recovered.durationMs, 1000);
  assert.equal((await fs.readFile(path.join(store.folder(meeting.id), 'microphone-0.wav'))).length, 32044);
  await store.renameSpeaker(meeting.id, 'microphone', 'Alex'); assert.equal((await store.get(meeting.id)).speakers.microphone, 'Alex');
  await store.setNotes(meeting.id, 'A personal note.'); assert.equal((await store.get(meeting.id)).personalNotes, 'A personal note.');
  assert.throws(() => store.folder('../escape')); await store.remove(meeting.id); assert.equal((await store.list()).length, 0);
});
test('speaker attribution preserves uncertain overlap instead of inventing identities', () => {
  const result = speakerFor({startMs: 0, endMs: 3000}, [{start: 0, end: 2, speaker: 0}, {start: 2, end: 3, speaker: 1}]); assert.equal(result.speaker, 'remote-0'); assert.equal(result.uncertain, true);
  assert.equal(speakerFor({startMs: 0, endMs: 1000}, []).speaker, 'unknown');
});
test('extracted notes cite unchanged transcript passages and do not infer metadata', () => {
  const segments = [{id: 'a', startMs: 0, text: 'Um, we decided to keep all the words.'}, {id: 'b', startMs: 4000, text: 'I will send the checklist.'}]; const notes = sourceNotes(segments);
  assert.equal(notes.decisions[0].text, segments[0].text); assert.equal(notes.actions[0].sourceId, 'b'); assert.equal(notes.actions[0].owner, undefined); assert.equal(notes.actions[0].deadline, undefined);
});

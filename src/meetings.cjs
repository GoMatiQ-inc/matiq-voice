const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {validateWav} = require('./core.cjs');

function sourceNotes(segments) {
  // Extract supporting words, never invent an owner, date, or a paraphrase.
  const decisions = [], actions = [];
  for (const segment of segments) {
    const note = {text: segment.text, sourceId: segment.id, startMs: segment.startMs};
    if (/\b(agreed|decided|decision|we will|we’ll|let’s|let us)\b/i.test(segment.text)) decisions.push(note);
    if (/\b(i will|i’ll|action item|follow up|prepare|send|schedule|next step)\b/i.test(segment.text)) actions.push(note);
  }
  return {kind: 'extractive', summary: segments.slice(0, 3).map(segment => ({text: segment.text, sourceId: segment.id, startMs: segment.startMs})), decisions, actions};
}
function speakerFor(segment, turns) {
  const scores = new Map();
  for (const turn of turns) {
    const overlap = Math.max(0, Math.min(segment.endMs, turn.end * 1000) - Math.max(segment.startMs, turn.start * 1000));
    scores.set(turn.speaker, (scores.get(turn.speaker) || 0) + overlap);
  }
  const ordered = [...scores].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  return ordered.length ? {speaker: `remote-${ordered[0][0]}`, uncertain: ordered.length > 1 && ordered[1][1] > ordered[0][1] * .3} : {speaker: 'unknown', uncertain: true};
}

class MeetingStore {
  constructor(directory) { this.directory = directory; this.busy = new Map(); }
  folder(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid meeting identifier.'); return path.join(this.directory, id); }
  async write(value) {
    const destination = path.join(this.folder(value.id), 'meeting.json');
    await fs.writeFile(`${destination}.tmp`, JSON.stringify(value), {mode: 0o600});
    await fs.rename(`${destination}.tmp`, destination);
  }
  async get(id) { return JSON.parse(await fs.readFile(path.join(this.folder(id), 'meeting.json'), 'utf8')); }
  async list() {
    await fs.mkdir(this.directory, {recursive: true, mode: 0o700});
    const entries = await fs.readdir(this.directory, {withFileTypes: true});
    const result = [];
    for (const entry of entries.filter(item => item.isDirectory() && /^[a-f0-9-]{36}$/.test(item.name))) {
      const meeting = await this.get(entry.name);
      result.push({id: meeting.id, title: meeting.title, created: meeting.created, status: meeting.status, chunks: meeting.chunks.length, durationMs: meeting.durationMs});
    }
    return result.sort((a, b) => b.created.localeCompare(a.created));
  }
  async recover() {
    for (const item of await this.list()) if (['recording', 'processing'].includes(item.status)) {
      const meeting = await this.get(item.id); meeting.status = 'interrupted'; meeting.error = 'The app stopped before this meeting finished. Recorded audio was retained; process it again.'; await this.write(meeting);
    }
  }
  async create({title, provider, url = ''}) {
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || !['microsoft', 'google', 'other'].includes(provider)) throw new Error('Enter a meeting title and select its source.');
    const value = {id: randomUUID(), title: title.trim(), provider, url, created: new Date().toISOString(), status: 'recording', durationMs: 0, chunks: [], segments: [], speakers: {microphone: 'Microphone', unknown: 'Unassigned'}, notes: null, personalNotes: '', error: ''};
    await fs.mkdir(this.folder(value.id), {recursive: true, mode: 0o700}); await this.write(value); return value;
  }
  async append(id, channel, sequence, input) {
    if (!['microphone', 'system'].includes(channel) || !Number.isInteger(sequence) || sequence < 0) throw new Error('Invalid meeting audio chunk.');
    const previous = this.busy.get(id) || Promise.resolve();
    const task = previous.then(async () => {
      const meeting = await this.get(id);
      if (meeting.status !== 'recording') throw new Error('This meeting is not recording.');
      const existing = meeting.chunks.filter(chunk => chunk.channel === channel);
      if (sequence !== existing.length) throw new Error('Audio chunks arrived out of order. Stop recording and preserve the captured audio.');
      const audio = validateWav(input), durationMs = (audio.length - 44) / 32;
      if (durationMs > 65000) throw new Error('Meeting chunks must be shorter than 65 seconds.');
      const startMs = existing.reduce((sum, chunk) => sum + chunk.durationMs, 0);
      if (startMs + durationMs > 4 * 3600000) throw new Error('Four-hour meeting limit reached. Stop and start a new recording.');
      const disk = await fs.statfs(this.folder(id));
      if (Number(disk.bavail) * Number(disk.bsize) < audio.length + 128 * 1024 ** 2) throw new Error('Disk space is low. Stop recording and free space; earlier chunks are retained.');
      const file = `${channel}-${sequence}.wav`;
      await fs.writeFile(path.join(this.folder(id), `${file}.partial`), audio, {mode: 0o600});
      await fs.rename(path.join(this.folder(id), `${file}.partial`), path.join(this.folder(id), file));
      meeting.chunks.push({file, channel, sequence, startMs, durationMs});
      meeting.durationMs = Math.max(meeting.durationMs, startMs + durationMs);
      await this.write(meeting); return {durationMs: meeting.durationMs};
    });
    this.busy.set(id, task.catch(() => {}));
    return task;
  }
  async stop(id) {
    await this.busy.get(id);
    const meeting = await this.get(id); meeting.status = 'recorded'; await this.write(meeting); return meeting;
  }
  async renameSpeaker(id, speaker, name) {
    if (typeof name !== 'string' || name.length > 80 || !name.trim()) throw new Error('Enter a speaker name of 1–80 characters.');
    const meeting = await this.get(id);
    if (!Object.hasOwn(meeting.speakers, speaker)) throw new Error('Select an existing speaker.');
    meeting.speakers[speaker] = name.trim(); await this.write(meeting); return meeting;
  }
  async setNotes(id, personalNotes) {
    if (typeof personalNotes !== 'string' || personalNotes.length > 100000) throw new Error('Keep personal notes below 100,000 characters.');
    const meeting = await this.get(id); meeting.personalNotes = personalNotes; await this.write(meeting); return meeting;
  }
  async remove(id) { await fs.rm(this.folder(id), {recursive: true}); }
}
module.exports = {MeetingStore, sourceNotes, speakerFor};

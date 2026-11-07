const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
test("prototype capture and account actions cannot invoke a real microphone or account flow", async () => {
  let microphoneCalls = 0;
  const navigator = {
    mediaDevices: {
      getUserMedia: () => {
        microphoneCalls++;
        throw Error("Real audio must stay inaccessible.");
      },
    },
  };
  const sandbox = {
    window: {},
    location: { search: "?mode=hosted" },
    URLSearchParams,
    structuredClone,
    EventTarget,
    navigator,
    document: { addEventListener() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../prototype/bridge.js"), "utf8"),
    sandbox,
  );
  const api = sandbox.window.matiqVoice,
    events = [];
  api.onEvent((e) => events.push(e));
  await api.begin();
  await api.recordingReady();
  await api.transcribe();
  assert.match((await api.status()).lastTranscript, /sample transcript/);
  assert.equal(microphoneCalls, 0);
  assert.equal(events.at(-1).type, "transcript");
  await assert.rejects(api.connect("google"), /Prototype only/);
});

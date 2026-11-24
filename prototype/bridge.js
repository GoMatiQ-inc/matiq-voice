const voiceSetupBridgeURL = document.currentScript.src;
"use strict";
// In-memory design data only. Never requests microphone, screen, account, or OS access.
(() => {
  const hosted =
    new URLSearchParams(location.search).get("mode") !== "standalone";
  const listeners = [],
    clone = (x) => structuredClone(x),
    emit = (e) => listeners.forEach((fn) => fn(e));
  let binding = null;
  const state = {
    state: "idle",
    hosted,
    applicationName: hosted ? "MatiQ Solutions" : "MatiQ Voice",
    platform: "darwin",
    packaged: true,
    engineReady: true,
    modelReady: true,
    speakerReady: true,
    shortcutReady: true,
    lastTranscript: "",
    canRetry: false,
    maxSeconds: 300,
    models: {
      "base.en": { label: "Base English · lighter" },
      "small.en": { label: "Small English · balanced" },
      "medium.en": { label: "Medium English · more demanding" },
    },
    settings: {
      model: "medium.en",
      microphone: "",
      autoPaste: true,
      bindings: { toggle: ["ControlRight"], hold: [] },
    },
    setup: { completed: true, microphoneTested: true, launchAtLogin: false },
    permissions: { accessibility: true, pasteError: "" },
    updates: {
      phase: "idle",
      restartPending: false,
      message: "No updates available.",
    },
    installation: {
      version: "0.3.13",
      path: hosted
        ? "MatiQ Solutions / Voice"
        : "/Applications/MatiQ Voice.app",
    },
    hardware: {
      platform: "darwin",
      arch: "arm64",
      memoryBytes: 32 * 1024 ** 3,
      freeBytes: 80 * 1024 ** 3,
      cpu: "Apple silicon · preview data",
      cores: 10,
      engineCompatible: true,
      recommendation: { model: "medium.en" },
    },
    connections: {
      microsoft: { configured: true, connected: false },
      google: { configured: true, connected: false },
    },
  };
  const media = new EventTarget();
  media.enumerateDevices = async () => [];
  media.getUserMedia = async () => ({
    getTracks: () => [{ stop() {} }],
    getAudioTracks: () => [{}],
  });
  media.getDisplayMedia = async () => {
    throw Error("Prototype only: no screen or system audio is captured.");
  };
  Object.defineProperty(navigator, "mediaDevices", {
    value: media,
    configurable: true,
  });
  function setState(next) {
    state.state = next;
    emit({ type: "state", state: next });
  }
  const api = {
    onEvent: (fn) => {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
    status: async () => clone(state),
    settings: async (value) => {
      Object.assign(state.settings, value);
      return clone(state);
    },
    begin: async () => { if (!window.matiqPrototypeSetupReady) throw Error("Finish Voice setup before recording."); setState("preparing"); },
    recordingReady: async () => setState("recording"),
    transcribe: async () => {
      state.lastTranscript =
        "Your words, as spoken. This is a sample transcript for the design preview.";
      setState("idle");
      emit({ type: "transcript", text: state.lastTranscript });
    },
    cancel: async () => setState("idle"),
    clear: async () => {
      state.lastTranscript = "";
      emit({ type: "transcript", text: "" });
    },
    copy: async () => {
      throw Error("Prototype only: your system clipboard is unchanged.");
    },
    retry: async () => api.transcribe(),
    meter: async () => {},
    download: async () => {
      state.modelReady = true;
      state.speakerReady = true;
    },
    microphoneTest: async () => {
      state.setup.microphoneTested = true;
    },
    completeSetup: async () => {
      state.setup.completed = true;
    },
    loginAtStartup: async (value) => {
      state.setup.launchAtLogin = value;
    },
    recordBinding: async (mode) => {
      binding = mode;
    },
    cancelBinding: async () => {
      binding = null;
    },
    enableKeyboard: async () => {},
    checkUpdates: async () => {
      emit({ type: "updates", update: clone(state.updates) });
      return clone(state.updates);
    },
    listMeetings: async () => [],
    calendarEvents: async () => [],
    cancelConnect: async () => {},
  };
  for (const name of [
    "showApp",
    "installUpdate",
    "accessibility",
    "connect",
    "disconnect",
    "openMeeting",
    "beginMeeting",
    "getMeeting",
    "meetingReady",
    "appendMeeting",
    "pauseMeeting",
    "stopMeeting",
    "processMeeting",
    "renameSpeaker",
    "saveNotes",
    "deleteMeeting",
    "exportMeeting",
    "quit",
  ])
    api[name] = async () => {
      throw Error(
        "Prototype only: " +
          name +
          " does not access accounts, audio, files or system settings.",
      );
    };
  window.matiqVoice = api;
  window.addEventListener("matiq:setup-preview-complete", event => { state.settings.model = event.detail.model; state.settings.autoPaste = event.detail.paste === "paste"; state.settings.bindings = {toggle: event.detail.shortcuts === "toggle" ? ["ControlRight"] : [], hold: event.detail.shortcuts === "hold" ? ["ControlRight"] : []}; });
  document.addEventListener("keyup", (e) => {
    if (binding) {
      e.preventDefault();
      emit({ type: "binding-recorded", mode: binding, keys: [e.code] });
    }
  });
})();

// First-run design review uses the shared shell preview; production behavior is unchanged.
document.addEventListener('DOMContentLoaded',()=>{const script=document.createElement('script');script.src=new URL('../.matiq-shell/setup-preview.js',voiceSetupBridgeURL).href;script.onload=()=>window.matiqSetupPreview({"id": "com.matiq.voice", "name": "Voice", "steps": [{"id": "model", "title": "Choose your speech model", "body": "Models stay on this computer. Choose a size for its memory and processing power.", "kind": "choice", "label": "English speech model", "options": [["base.en", "Base English · lighter"], ["small.en", "Small English · balanced"], ["medium.en", "Medium English · more demanding"]]}, {"id": "download", "title": "Install and verify models", "body": "Download the chosen speech model and speaker-label models. Every file must pass its size and SHA-256 checks. A failure stays here for retry.", "kind": "check", "action": "Preview verified download", "success": "Speech and speaker models verified."}, {"id": "microphone", "title": "Choose and test your microphone", "body": "Confirm that Voice receives an audio signal before dictation is enabled. The short test is not saved.", "kind": "check", "action": "Preview microphone test", "success": "Audio signal detected."}, {"id": "shortcuts", "title": "Choose your dictation controls", "body": "Review toggle and push-to-talk bindings. You can also choose on-screen controls without global keyboard access. Custom bindings remain configurable in Settings.", "kind": "choice", "label": "Dictation controls", "options": [["toggle", "Right Control toggles dictation; push-to-talk off"], ["hold", "Hold Right Control to talk; toggle off"], ["onscreen", "On-screen controls; both global bindings off"]]}, {"id": "paste", "title": "Choose text insertion", "body": "Copy mode keeps results ready for manual paste. Automatic insertion requires Accessibility access for {app}.", "kind": "choice", "label": "Text insertion", "options": [["copy", "Copy results manually"], ["paste", "Automatic paste after shortcut dictation"]]}, {"id": "permissions", "title": "Review keyboard and paste permissions", "body": "For the controls you choose, check Accessibility and Input Monitoring for {app}. In the real setup, only checks required by your choices will be mandatory.", "kind": "check", "permission": true, "action": "Preview required permission checks", "success": "Required access verified; unused capabilities remain off."}, {"id": "meetings", "title": "Review meeting settings", "body": "Calendar connections are optional. Meeting recording always asks for local audio retention and system audio access when needed. No recording bot joins calls.", "kind": "choice", "label": "Calendar integration", "options": [["none", "Skip calendar connections"], ["microsoft", "Connect Microsoft calendar"], ["google", "Connect Google calendar"]]}, {"id": "startup", "title": "Review startup and updates", "body": "{app} manages startup and updates. Closing the window can leave background tools running; Quit stops them after active work is saved.", "kind": "review", "label": "I reviewed startup, update ownership, and how to quit."}, {"id": "ready", "title": "Ready to use Voice", "body": "Setup is complete only after required checks and all settings choices. You can change these later in Settings.", "kind": "summary"}]});document.head.append(script);});

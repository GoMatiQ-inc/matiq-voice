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
      base: { label: "Base English · lighter" },
      small: { label: "Small English · balanced" },
      medium: { label: "Medium English · more accurate" },
    },
    settings: {
      model: "medium",
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
      recommendation: { model: "medium" },
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
    begin: async () => setState("preparing"),
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
  document.addEventListener("keyup", (e) => {
    if (binding) {
      e.preventDefault();
      emit({ type: "binding-recorded", mode: binding, keys: [e.code] });
    }
  });
})();

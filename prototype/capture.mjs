// UI-only capture adapter; no AudioContext, microphone, or recording occurs.
export async function microphone() {
  return { getTracks: () => [{ stop() {} }], getAudioTracks: () => [{}] };
}
export async function captureAudio(stream, { onLevel = () => {} } = {}) {
  onLevel(0.2, 2);
  return {
    seconds: 2,
    stop: async () => new ArrayBuffer(48),
    pause: async () => {},
  };
}

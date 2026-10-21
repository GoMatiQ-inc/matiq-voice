class Recorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.port.onmessage = event => {
      if (event.data === 'stop') { this.active = false; this.port.postMessage({stopped: true}); }
    };
  }
  process(inputs) {
    if (this.active && inputs[0]?.[0]) {
      const samples = inputs[0][0].slice();
      this.port.postMessage({samples}, [samples.buffer]);
    }
    return true;
  }
}
registerProcessor('verbatim-recorder', Recorder);

class Recorder extends AudioWorkletProcessor {
  constructor() {
    super(); this.active = true; this.paused = false;
    this.port.onmessage = ({data}) => {
      if (data.command === 'stop') this.active = false;
      if (data.command === 'pause') this.paused = data.paused;
      this.port.postMessage({ack: data.id});
    };
  }
  process(inputs) {
    if (this.active && !this.paused && inputs[0]?.[0]) {
      const samples = inputs[0][0].slice(); this.port.postMessage({samples}, [samples.buffer]);
    }
    return true;
  }
}
registerProcessor('matiq-recorder', Recorder);

// Records what the music plays and turns it into a WAV file (for Bhavini's app to save in R2).
//
//   const rec = makeRecorder(Tone.getContext(), outputNode, Tone.getDestination());
//   rec.start();  … the piece plays …  const blob = rec.stop();   // a WAV Blob
//   rec.cancel(); // throw a recording away (the user pressed stop)
//
// It uses a tiny AudioWorklet "tap" that copies every block of sound to the page while recording.

const TAP = `
class ChromaTap extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = (e) => { this.on = e.data; }; }
  process(inputs) {
    const i = inputs[0];
    if (this.on && i && i.length) this.port.postMessage([i[0].slice(), (i[1] || i[0]).slice()]);
    return true;
  }
}
registerProcessor("chroma-tap", ChromaTap);`;

export function makeRecorder(toneCtx, source, sink) {
  let left = null, right = null, node = null;
  // load the worklet in the background; recording works once it's ready (a few ms)
  const url = URL.createObjectURL(new Blob([TAP], { type: "application/javascript" }));
  const ready = toneCtx.addAudioWorkletModule(url).then(() => {
    node = toneCtx.createAudioWorkletNode("chroma-tap", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit",
    });
    node.port.onmessage = (e) => { if (left) { left.push(e.data[0]); right.push(e.data[1]); } };
    source.connect(node);
    node.connect(sink ?? toneCtx.rawContext.destination); // outputs silence; being connected keeps it running
  }).catch((err) => console.warn("recorder unavailable:", err));
  return {
    ready,
    get recording() { return !!left; },
    start() { left = []; right = []; node?.port.postMessage(true); },
    cancel() { left = right = null; node?.port.postMessage(false); },
    stop() {
      node?.port.postMessage(false);
      if (!left) return null;
      const blob = encodeWav(join(left), join(right), toneCtx.sampleRate);
      left = right = null;
      return blob;
    },
  };
}

function join(chunks) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  // trim silence at the start (the transport starts 0.1 s late) and at the very end
  let a = 0, b = out.length;
  while (a < b && Math.abs(out[a]) < 1e-4) a++;
  while (b > a && Math.abs(out[b - 1]) < 1e-4) b--;
  return out.subarray(a, b);
}

// 16-bit stereo PCM WAV
export function encodeWav(l, r, rate) {
  const n = Math.min(l.length, r.length);
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    v.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
    v.setInt16(o + 2, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
    o += 4;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * AudioWorklet processor that emits raw PCM-16 frames for live streaming.
 *
 * Why not MediaRecorder: only the first chunk of a WebM/Opus stream carries the
 * container header, so later chunks cannot be decoded independently. Streaming
 * them to a server yields exactly one decodable chunk and then failures — the
 * trap the previous implementation fell into.
 *
 * This processor instead taps the raw float32 graph, resamples to the server's
 * rate, converts to signed 16-bit, and posts fixed-size frames. Every frame is
 * self-contained and needs no decoding at all.
 *
 * Resampling uses linear interpolation. For a 48 kHz -> 16 kHz downshift with
 * speech content that is adequate; the anti-alias error sits well above the
 * 8 kHz band Whisper's mel filterbank actually looks at.
 */

const DEFAULT_TARGET_RATE = 16000;
const DEFAULT_FRAME_SAMPLES = 1024;

class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = (options && options.processorOptions) || {};

    this.targetRate = config.targetSampleRate || DEFAULT_TARGET_RATE;
    this.frameSamples = config.frameSamples || DEFAULT_FRAME_SAMPLES;

    // `sampleRate` is a global provided by the AudioWorklet scope.
    this.ratio = sampleRate / this.targetRate;

    this.buffer = new Float32Array(this.frameSamples);
    this.bufferIndex = 0;

    // Fractional read position into the incoming block, carried across blocks
    // so resampling does not click at block boundaries.
    this.readPosition = 0;
    this.lastSample = 0;

    this.running = true;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'stop') {
        this.running = false;
      }
    };
  }

  /** Convert float32 in [-1, 1] to little-endian PCM-16 bytes. */
  static toPCM16(samples) {
    const output = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      // 0x7fff for positive, 0x8000 for negative: the int16 range is asymmetric.
      output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return output;
  }

  /** Emit the accumulated frame and report its peak level for the UI. */
  flushFrame() {
    const frame = this.buffer.slice(0, this.bufferIndex);

    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const magnitude = Math.abs(frame[i]);
      if (magnitude > peak) peak = magnitude;
      sumSquares += frame[i] * frame[i];
    }
    const rms = frame.length > 0 ? Math.sqrt(sumSquares / frame.length) : 0;

    const pcm = PCMWorkletProcessor.toPCM16(frame);
    // Transfer the buffer rather than copying: this runs on the audio thread
    // and any avoidable allocation risks a dropout.
    this.port.postMessage({ type: 'audio', pcm: pcm.buffer, peak, rms }, [pcm.buffer]);

    this.bufferIndex = 0;
  }

  process(inputs) {
    if (!this.running) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Walk the input at `ratio` steps, interpolating between neighbours.
    while (this.readPosition < channel.length) {
      const index = Math.floor(this.readPosition);
      const fraction = this.readPosition - index;

      const current = channel[index];
      const previous = index > 0 ? channel[index - 1] : this.lastSample;
      const interpolated = previous + (current - previous) * fraction;

      this.buffer[this.bufferIndex] = interpolated;
      this.bufferIndex += 1;

      if (this.bufferIndex >= this.frameSamples) {
        this.flushFrame();
      }

      this.readPosition += this.ratio;
    }

    // Carry the remainder into the next block so no sample is lost or repeated.
    this.readPosition -= channel.length;
    this.lastSample = channel[channel.length - 1];

    return true;
  }
}

registerProcessor('pcm-worklet', PCMWorkletProcessor);

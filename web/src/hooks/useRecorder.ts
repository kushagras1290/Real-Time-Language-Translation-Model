/**
 * Microphone recording for batch mode, with a live amplitude signal.
 *
 * Records via MediaRecorder (correct for batch: the whole blob is decoded
 * server-side in one pass) while running a parallel AnalyserNode so the 3D
 * scene can react to the user's voice as they speak.
 *
 * The blob is labelled with the MIME type the browser actually produced rather
 * than a hardcoded `audio/wav`. Mislabelling was what made the previous
 * implementation's uploads undecodable.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'error';

interface UseRecorderResult {
  status: RecorderStatus;
  /** Smoothed input amplitude in [0, 1], for driving visuals. */
  level: number;
  /**
   * Live frequency magnitudes in [0, 1], newest frame only.
   *
   * Held in a ref-backed array that is mutated in place rather than replaced,
   * because allocating a new typed array 60 times a second would churn the
   * garbage collector during recording.
   */
  spectrum: Float32Array | null;
  /** Recording duration in seconds. */
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  /** Stops recording and resolves with the captured audio. */
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

/** Frequency bins published to the visualiser. */
const SPECTRUM_BINS = 64;

/** Container preferences, best first. Browsers differ in what they support. */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

/** Pick the first container this browser can actually record. */
function selectMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useRecorder(): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  // Mutated in place each frame; see the note on `spectrum` above.
  const spectrumRef = useRef<Float32Array>(new Float32Array(SPECTRUM_BINS));
  // Explicitly backed by ArrayBuffer: since TypeScript 5.7 typed arrays are
  // generic over their buffer, and the Web Audio signatures reject the
  // SharedArrayBuffer-compatible default.
  const frequencyBytesRef = useRef<Uint8Array<ArrayBuffer>>(
    new Uint8Array(new ArrayBuffer(0)),
  );

  /** Release every audio resource. Safe to call repeatedly. */
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // An AudioContext that is never closed holds the microphone indicator on
    // and counts against the browser's per-page context limit.
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  /** Sample the analyser once per frame and publish level plus spectrum. */
  const pollLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sumSquares += samples[i]! * samples[i]!;
    }
    const rms = Math.sqrt(sumSquares / samples.length);

    // Frequency data for the ribbon. Only the lower ~60% of bins carry speech
    // energy, so the upper bins are skipped rather than rendered as dead space.
    const binCount = analyser.frequencyBinCount;
    if (frequencyBytesRef.current.length !== binCount) {
      frequencyBytesRef.current = new Uint8Array(new ArrayBuffer(binCount));
    }
    const bytes = frequencyBytesRef.current;
    analyser.getByteFrequencyData(bytes);

    const usableBins = Math.floor(binCount * 0.6);
    const step = usableBins / SPECTRUM_BINS;
    const spectrum = spectrumRef.current;
    for (let i = 0; i < SPECTRUM_BINS; i += 1) {
      spectrum[i] = (bytes[Math.floor(i * step)] ?? 0) / 255;
    }

    // Speech RMS sits around 0.05-0.15, so scale up before clamping or the
    // visuals barely move. Exponential smoothing removes frame-rate jitter.
    const scaled = Math.min(1, rms * 6);
    setLevel((previous) => previous * 0.75 + scaled * 0.25);
    setSeconds((Date.now() - startedAtRef.current) / 1000);

    rafRef.current = requestAnimationFrame(pollLevel);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (status === 'recording') return;

    setError(null);
    setStatus('requesting');
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings and try again.'
          : 'No microphone is available.';
      setError(message);
      setStatus('error');
      return;
    }

    streamRef.current = stream;

    const context = new AudioContext();
    audioContextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    context.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;

    const mimeType = selectMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      teardown();
      setError('This browser cannot record audio.');
      setStatus('error');
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start();

    startedAtRef.current = Date.now();
    setSeconds(0);
    setStatus('recording');
    rafRef.current = requestAnimationFrame(pollLevel);
  }, [pollLevel, status, teardown]);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      teardown();
      setStatus('idle');
      return Promise.resolve(null);
    }

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        // Use the recorder's own MIME type; relabelling it is what broke the
        // previous implementation's server-side decode.
        const type = recorder.mimeType || 'audio/webm';
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type })
          : null;
        chunksRef.current = [];
        teardown();
        setStatus('idle');
        resolve(blob);
      };
      recorder.stop();
    });
  }, [teardown]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    teardown();
    setStatus('idle');
  }, [teardown]);

  return {
    status,
    level,
    spectrum: status === 'recording' ? spectrumRef.current : null,
    seconds,
    error,
    start,
    stop,
    cancel,
  };
}

/**
 * Live streaming translation over WebSocket.
 *
 * Captures raw PCM via the AudioWorklet in `public/pcm-worklet.js` and streams
 * it to `/ws/stream`, receiving partial and final captions as the user speaks.
 *
 * Partials replace the in-progress caption; finals append and carry the
 * translation. That distinction is what makes the transcript settle instead of
 * flickering.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { streamUrl } from '../lib/api';
import type { Caption, SpeechPayload, StreamEvent } from '../lib/types';

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'error';

interface UseLiveStreamOptions {
  sourceLang: string | null;
  targetLang: string;
  speak: boolean;
  /** Called for each finished utterance that produced audio. */
  onSpeech?: (speech: SpeechPayload) => void;
}

interface UseLiveStreamResult {
  status: StreamStatus;
  captions: Caption[];
  /** Text of the utterance currently being spoken, if any. */
  partial: string;
  /** True while the server's VAD believes the user is speaking. */
  isSpeaking: boolean;
  /** Server-reported input level in [0, 1], for visuals. */
  level: number;
  /**
   * Live frequency magnitudes in [0, 1].
   *
   * Measured locally rather than taken from the server: the level events
   * arrive at the VAD's frame rate, which is far too coarse to drive a
   * visualiser, and sending a spectrum over the socket would waste bandwidth
   * on data the browser already has.
   */
  spectrum: Float32Array | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/** Samples per frame sent to the server; ~64 ms at 16 kHz. */
const FRAME_SAMPLES = 1024;

/** Frequency bins published to the visualiser. */
const SPECTRUM_BINS = 64;

export function useLiveStream(options: UseLiveStreamOptions): UseLiveStreamResult {
  const { sourceLang, targetLang, speak, onSpeech } = options;

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [partial, setPartial] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const spectrumRef = useRef<Float32Array>(new Float32Array(SPECTRUM_BINS));
  // Explicitly backed by ArrayBuffer: since TypeScript 5.7 typed arrays are
  // generic over their buffer, and the Web Audio signatures reject the
  // SharedArrayBuffer-compatible default.
  const frequencyBytesRef = useRef<Uint8Array<ArrayBuffer>>(
    new Uint8Array(new ArrayBuffer(0)),
  );
  // Held in a ref so the worklet callback always sees the current handler
  // without needing to be torn down and rebuilt on every render.
  const onSpeechRef = useRef(onSpeech);

  useEffect(() => {
    onSpeechRef.current = onSpeech;
  }, [onSpeech]);

  /** Release the socket and every audio resource. Safe to call repeatedly. */
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    nodeRef.current?.port.postMessage({ type: 'stop' });
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (contextRef.current && contextRef.current.state !== 'closed') {
      void contextRef.current.close();
    }
    contextRef.current = null;

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      // Ask the server to flush buffered speech before it closes, so a final
      // mid-sentence utterance is not lost.
      socket.send(JSON.stringify({ type: 'stop' }));
      socket.close();
    }
    socketRef.current = null;

    setIsSpeaking(false);
    setLevel(0);
    setPartial('');
  }, []);

  useEffect(() => teardown, [teardown]);

  /** Sample the local analyser each frame to feed the visualiser. */
  const pollSpectrum = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const binCount = analyser.frequencyBinCount;
    if (frequencyBytesRef.current.length !== binCount) {
      frequencyBytesRef.current = new Uint8Array(new ArrayBuffer(binCount));
    }
    const bytes = frequencyBytesRef.current;
    analyser.getByteFrequencyData(bytes);

    // Only the lower bins carry speech energy; the rest would render as a flat
    // dead band across most of the ribbon.
    const usableBins = Math.floor(binCount * 0.6);
    const step = usableBins / SPECTRUM_BINS;
    const spectrum = spectrumRef.current;
    for (let i = 0; i < SPECTRUM_BINS; i += 1) {
      spectrum[i] = (bytes[Math.floor(i * step)] ?? 0) / 255;
    }

    rafRef.current = requestAnimationFrame(pollSpectrum);
  }, []);

  const handleEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'ready':
        setStatus('live');
        break;

      case 'speech_start':
        setIsSpeaking(true);
        break;

      case 'speech_end':
        setIsSpeaking(false);
        break;

      case 'level':
        // Server RMS is small for speech; scale so visuals have usable range.
        setLevel(Math.min(1, (event.rms ?? 0) * 8));
        break;

      case 'partial':
        setPartial(event.text ?? '');
        break;

      case 'final': {
        setPartial('');
        const text = event.text ?? '';
        if (!text) break;
        setCaptions((previous) => [
          ...previous,
          {
            id: event.utterance ?? previous.length,
            source: text,
            translation: event.translation ?? null,
            isFinal: true,
          },
        ]);
        if (event.speech) onSpeechRef.current?.(event.speech);
        break;
      }

      case 'error':
        setError(event.message ?? 'The streaming session failed.');
        setStatus('error');
        break;

      case 'closed':
        setStatus('idle');
        break;

      default:
        break;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (status === 'live' || status === 'connecting') return;

    setError(null);
    setStatus('connecting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings.'
          : 'No microphone is available.',
      );
      setStatus('error');
      return;
    }
    streamRef.current = stream;

    const context = new AudioContext();
    contextRef.current = context;

    try {
      await context.audioWorklet.addModule('/pcm-worklet.js');
    } catch {
      teardown();
      setError('Could not load the audio processor. Live mode needs a modern browser.');
      setStatus('error');
      return;
    }

    const socket = new WebSocket(streamUrl());
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'config',
          source_lang: sourceLang,
          target_lang: targetLang,
          speak,
        }),
      );

      const node = new AudioWorkletNode(context, 'pcm-worklet', {
        processorOptions: { targetSampleRate: 16000, frameSamples: FRAME_SAMPLES },
      });

      node.port.onmessage = (message: MessageEvent) => {
        const data = message.data as { type: string; pcm?: ArrayBuffer };
        if (data.type !== 'audio' || !data.pcm) return;
        if (socket.readyState === WebSocket.OPEN) socket.send(data.pcm);
      };

      const source = context.createMediaStreamSource(stream);
      source.connect(node);

      // A parallel analyser taps the same source for the visualiser, so the
      // ribbon reacts at frame rate rather than at the server's VAD rate.
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Route to a muted gain node rather than the speakers: connecting to
      // `destination` would echo the microphone back at the user.
      const silence = context.createGain();
      silence.gain.value = 0;
      node.connect(silence).connect(context.destination);

      nodeRef.current = node;
      rafRef.current = requestAnimationFrame(pollSpectrum);
    };

    socket.onmessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') return;
      try {
        handleEvent(JSON.parse(message.data) as StreamEvent);
      } catch {
        // A malformed frame must not kill the session.
      }
    };

    socket.onerror = () => {
      setError('The streaming connection failed. Is the backend running?');
      setStatus('error');
    };

    socket.onclose = () => {
      setStatus((current) => (current === 'error' ? current : 'idle'));
    };
  }, [handleEvent, pollSpectrum, sourceLang, speak, status, targetLang, teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
  }, [teardown]);

  const clear = useCallback(() => {
    setCaptions([]);
    setPartial('');
  }, []);

  return {
    status,
    captions,
    partial,
    isSpeaking,
    level,
    spectrum: status === 'live' ? spectrumRef.current : null,
    error,
    start,
    stop,
    clear,
  };
}

/**
 * Application root.
 *
 * Layout is an editorial console: a thin instrument bar, a masthead where the
 * two languages face each other in display type, the working surface, and the
 * audio ribbon anchored at the foot next to the record control.
 *
 * The ordering is deliberate. The previous iteration put a decorative orb in
 * the centre and pushed the actual content to the margins; here the content
 * occupies the full measure and the visualiser sits where it is useful — beside
 * the button that produces the signal it displays.
 */

import { AnimatePresence } from 'framer-motion';
import { ArrowLeftRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ErrorBanner,
  ModeSwitch,
  RecordButton,
  Status,
  type AppMode,
} from './components/Controls';
import { LanguagePicker } from './components/LanguagePicker';
import { LiveCaptions } from './components/LiveCaptions';
import { RibbonStage } from './components/RibbonStage';
import { TranslationPanel } from './components/TranslationPanel';
import { useLiveStream } from './hooks/useLiveStream';
import { useRecorder } from './hooks/useRecorder';
import {
  ApiError,
  base64ToObjectUrl,
  fetchHealth,
  fetchLanguages,
  runPipeline,
  speak as requestSpeech,
  translate as requestTranslation,
} from './lib/api';
import type { HealthResponse, Language, SpeechPayload } from './lib/types';

/** Opening pair; both support speech in and out. */
const DEFAULT_SOURCE = 'en';
const DEFAULT_TARGET = 'hi';

export default function App() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [sourceLang, setSourceLang] = useState(DEFAULT_SOURCE);
  const [targetLang, setTargetLang] = useState(DEFAULT_TARGET);
  const [mode, setMode] = useState<AppMode>('batch');

  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSynthesising, setIsSynthesising] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastEngine, setLastEngine] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);

  const recorder = useRecorder();

  /** Load and play synthesised audio, revoking the previous blob URL. */
  const playAudio = useCallback((url: string) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = url;
    const element = audioRef.current;
    if (!element) return;
    element.src = url;
    // Autoplay may be blocked before the first interaction; not worth surfacing.
    void element.play().catch(() => undefined);
  }, []);

  const handleStreamSpeech = useCallback(
    (speech: SpeechPayload) => {
      setLastEngine(speech.engine);
      playAudio(base64ToObjectUrl(speech.audio_base64, speech.mime_type));
    },
    [playAudio],
  );

  const live = useLiveStream({
    sourceLang: sourceLang || null,
    targetLang,
    speak: false,
    onSpeech: handleStreamSpeech,
  });

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const [languageData, healthData] = await Promise.all([
          fetchLanguages(),
          fetchHealth().catch(() => null),
        ]);
        if (cancelled) return;
        setLanguages(languageData.languages);
        setHealth(healthData);
      } catch (cause) {
        if (cancelled) return;
        setBootError(
          cause instanceof ApiError
            ? cause.message
            : 'Could not reach the backend.',
        );
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceLanguage = useMemo(
    () => languages.find((language) => language.code === sourceLang),
    [languages, sourceLang],
  );
  const targetLanguage = useMemo(
    () => languages.find((language) => language.code === targetLang),
    [languages, targetLang],
  );

  const isRecording = recorder.status === 'recording';
  const isLive = live.status === 'live';
  const isBusy = isTranslating || isProcessing || isSynthesising;

  // The ribbon reads from whichever mode is capturing.
  const spectrum = mode === 'live' ? live.spectrum : recorder.spectrum;
  const level = mode === 'live' ? live.level : recorder.level;
  const capturing = mode === 'live' ? isLive : isRecording;

  const handleTranslate = useCallback(async () => {
    const text = sourceText.trim();
    if (!text) return;

    setIsTranslating(true);
    setError(null);
    try {
      const result = await requestTranslation(text, sourceLang, targetLang);
      setTranslatedText(result.text);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Translation failed.');
    } finally {
      setIsTranslating(false);
    }
  }, [sourceLang, sourceText, targetLang]);

  const handleSpeak = useCallback(async () => {
    if (!translatedText) return;

    setIsSynthesising(true);
    setError(null);
    try {
      const { url, engine } = await requestSpeech(translatedText, targetLang);
      setLastEngine(engine);
      playAudio(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Speech synthesis failed.');
    } finally {
      setIsSynthesising(false);
    }
  }, [playAudio, targetLang, translatedText]);

  /** Record, then transcribe + translate + speak in a single request. */
  const handleBatchRecord = useCallback(async () => {
    if (recorder.status === 'recording') {
      const blob = await recorder.stop();
      if (!blob) return;

      setIsProcessing(true);
      setError(null);
      try {
        const result = await runPipeline(blob, sourceLang, targetLang, true);
        setSourceText(result.transcription.text);
        setTranslatedText(result.translation?.text ?? '');

        if (result.note) setError(result.note);
        else if (result.speech_error) setError(result.speech_error);

        if (result.speech) {
          setLastEngine(result.speech.engine);
          playAudio(
            base64ToObjectUrl(result.speech.audio_base64, result.speech.mime_type),
          );
        }
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'Processing failed.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    await recorder.start();
  }, [playAudio, recorder, sourceLang, targetLang]);

  const handleLiveToggle = useCallback(() => {
    if (live.status === 'live' || live.status === 'connecting') live.stop();
    else void live.start();
  }, [live]);

  const handleSwap = useCallback(() => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  }, [sourceLang, sourceText, targetLang, translatedText]);

  const activeError = error ?? recorder.error ?? live.error;

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md border-l-2 border-accent pl-6">
          <p className="label mb-3">Backend unreachable</p>
          <h1 className="display mb-4 text-3xl">Nothing is listening.</h1>
          <p className="mb-5 text-sm leading-relaxed text-ink-muted">{bootError}</p>
          <code className="mono block border border-rule bg-paper-raised px-3 py-2 text-xs text-ink">
            python backend/wsgi.py
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Instrument bar */}
      <header className="reveal border-b border-rule">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <span className="display text-lg tracking-tight">LinguaLive</span>
            <span className="mono hidden text-2xs uppercase tracking-[0.16em] text-ink-faint sm:inline">
              Speech Translation Console
            </span>
          </div>

          <div className="flex items-center gap-5">
            {health && (
              <span className="mono tabular hidden text-2xs uppercase tracking-[0.14em] text-ink-faint md:inline">
                {languages.length} lang ·{' '}
                {health.memory.rss_mb ? `${Math.round(health.memory.rss_mb)} MB` : 'ready'}
              </span>
            )}
            <ModeSwitch
              mode={mode}
              onChange={setMode}
              disabled={isRecording || isLive}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Masthead: the two languages facing each other */}
        <section
          className="reveal layer-raised grid items-end gap-8 py-10 md:grid-cols-[1fr_auto_1fr]"
          style={{ animationDelay: '60ms' }}
        >
          <LanguagePicker
            languages={languages}
            value={sourceLang}
            onChange={setSourceLang}
            label="Source"
            requires="transcribe"
            disabled={isRecording || isLive}
          />

          <button
            type="button"
            onClick={handleSwap}
            disabled={isRecording || isLive}
            aria-label="Swap source and target languages"
            className="group mx-auto flex h-11 w-11 items-center justify-center border border-rule-strong transition-colors hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-30 md:mb-3"
          >
            <ArrowLeftRight className="h-4 w-4 text-ink transition-transform duration-300 group-hover:rotate-180 group-hover:text-paper-raised" />
          </button>

          <LanguagePicker
            languages={languages}
            value={targetLang}
            onChange={setTargetLang}
            label="Target"
            align="right"
            disabled={isRecording || isLive}
          />
        </section>

        <AnimatePresence>
          {activeError && (
            <div className="pb-5">
              <ErrorBanner message={activeError} onDismiss={() => setError(null)} />
            </div>
          )}
        </AnimatePresence>

        {/* Working surface */}
        <div className="reveal layer-base pb-8" style={{ animationDelay: '120ms' }}>
          {mode === 'batch' ? (
            <TranslationPanel
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              sourceText={sourceText}
              translatedText={translatedText}
              isTranslating={isTranslating}
              isSpeaking={isSynthesising}
              lastEngine={lastEngine}
              onSourceTextChange={setSourceText}
              onTranslate={handleTranslate}
              onSpeak={handleSpeak}
            />
          ) : (
            <LiveCaptions
              captions={live.captions}
              partial={live.partial}
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              isLive={isLive}
            />
          )}
        </div>
      </main>

      {/* Transport: ribbon plus record control */}
      <footer
        className="reveal sticky bottom-0 border-t border-rule bg-paper/95 backdrop-blur-sm"
        style={{ animationDelay: '180ms' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <RecordButton
            active={capturing}
            busy={isProcessing || live.status === 'connecting'}
            // Speech input is unavailable for the 96 languages Whisper cannot
            // hear. Typing and translating them still works, which is why the
            // language stays selectable and only this control locks.
            disabled={
              languages.length === 0 ||
              (sourceLanguage ? !sourceLanguage.can_transcribe : false)
            }
            disabledReason={
              sourceLanguage && !sourceLanguage.can_transcribe
                ? `Speech input is not available for ${sourceLanguage.name}. Type instead, or pick another source language.`
                : undefined
            }
            level={level}
            onClick={mode === 'live' ? handleLiveToggle : handleBatchRecord}
            label={
              mode === 'live'
                ? capturing
                  ? 'Stop live translation'
                  : 'Start live translation'
                : capturing
                  ? 'Stop recording'
                  : 'Start recording'
            }
          />

          {/* The ribbon: real FFT data, not decoration. */}
          <div className="relative h-20 flex-1 overflow-hidden">
            <RibbonStage spectrum={spectrum} level={level} active={capturing} />
          </div>

          <div className="hidden w-36 flex-col items-end gap-1.5 sm:flex">
            {isRecording && (
              <Status tone="live">{recorder.seconds.toFixed(1)}s</Status>
            )}
            {isLive && (
              <Status tone="live">
                {live.isSpeaking ? 'Speech' : 'Listening'}
              </Status>
            )}
            {live.status === 'connecting' && <Status>Connecting</Status>}
            {isProcessing && <Status>Processing</Status>}
            {!capturing && !isBusy && live.status !== 'connecting' && (
              <Status>{mode === 'live' ? 'Live ready' : 'Ready'}</Status>
            )}
            <span className="mono text-2xs uppercase tracking-[0.14em] text-ink-faint">
              NLLB · Whisper
            </span>
          </div>
        </div>
      </footer>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}

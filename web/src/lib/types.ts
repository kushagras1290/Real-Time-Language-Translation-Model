/**
 * Shared types mirroring the backend API contract.
 *
 * These match `backend/app/api/routes.py` and `backend/app/languages.py`. Keep
 * them in sync: a drift here is the class of bug that left the previous
 * frontend calling routes that did not exist.
 */

/** One supported language and what the models can do with it. */
export interface Language {
  code: string;
  name: string;
  native_name: string;
  script: string;
  rtl: boolean;
  /** NLLB covers every language in the registry. */
  can_translate: boolean;
  /** False when Whisper cannot hear this language — disable the microphone. */
  can_transcribe: boolean;
  /** False when no engine can speak it — disable the speaker. */
  can_speak: boolean;
  /** False when only the fallback formant synthesiser can speak it. */
  has_neural_voice: boolean;
}

export interface LanguagesResponse {
  languages: Language[];
  counts: {
    total: number;
    transcribable: number;
    speakable: number;
  };
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob: number | null;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  language_probability: number | null;
  duration: number;
  segments: TranscriptionSegment[];
  engine: string;
}

export interface TranslationResult {
  text: string;
  source_lang: string;
  target_lang: string;
  engine: string;
}

export interface SpeechPayload {
  audio_base64: string;
  mime_type: string;
  engine: string;
}

export interface PipelineResult {
  transcription: TranscriptionResult;
  translation: TranslationResult | null;
  speech: SpeechPayload | null;
  speech_error?: string;
  note?: string;
}

export interface HealthResponse {
  status: string;
  environment: string;
  engines: Record<string, unknown>;
  warnings: string[];
  memory: { rss_mb: number | null };
  limits: {
    max_upload_bytes: number;
    max_audio_seconds: number;
    max_text_chars: number;
  };
}

/** The error envelope every failing endpoint returns. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// --------------------------------------------------------------------------
// Live streaming protocol (see backend/app/realtime/ws.py)
// --------------------------------------------------------------------------

export type StreamEventType =
  | 'ready'
  | 'partial'
  | 'final'
  | 'speech_start'
  | 'speech_end'
  | 'level'
  | 'error'
  | 'closed';

export interface StreamEvent {
  type: StreamEventType;
  /** `ready` */
  sample_rate?: number;
  frame_samples?: number;
  /** `partial` and `final` */
  text?: string;
  utterance?: number;
  seconds?: number;
  /** `final` */
  translation?: string | null;
  source_lang?: string;
  target_lang?: string;
  speech?: SpeechPayload | null;
  /** `level` */
  rms?: number;
  energy?: number;
  /** `error` */
  code?: string;
  message?: string;
  /** `closed` */
  utterances?: number;
  elapsed_seconds?: number;
  audio_seconds?: number;
}

/** One completed utterance in the live transcript. */
export interface Caption {
  id: number;
  source: string;
  translation: string | null;
  isFinal: boolean;
}

/** An entry in the batch-mode history list. */
export interface HistoryEntry {
  id: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  at: number;
}

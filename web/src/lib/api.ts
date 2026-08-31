/**
 * Typed client for the translation API.
 *
 * Every call goes through {@link request}, which normalises the backend's error
 * envelope into an {@link ApiError}. That means callers handle one error shape
 * regardless of whether a failure came from validation, an engine, or the
 * network.
 *
 * The base URL is empty in development because Vite proxies `/api` to Flask.
 * Deployed builds set `VITE_API_BASE` to the backend's origin.
 */

import type {
  ApiErrorBody,
  HealthResponse,
  LanguagesResponse,
  PipelineResult,
  TranscriptionResult,
  TranslationResult,
} from './types';

const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/** Requests that involve model inference need a generous deadline. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** A failed API call, carrying the backend's stable error code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the user can fix this by changing their input or selection. */
  get isUserFixable(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/** Build an absolute URL for an API path. */
function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Build the WebSocket URL for the live streaming endpoint. */
export function streamUrl(): string {
  if (API_BASE) {
    return `${API_BASE.replace(/^http/, 'ws')}/ws/stream`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/stream`;
}

/**
 * Perform a request and decode the response, converting failures to ApiError.
 *
 * @param path - API path beginning with `/api`.
 * @param init - Fetch options.
 * @param timeoutMs - Abort deadline in milliseconds.
 * @returns The decoded JSON body.
 * @throws {ApiError} On any non-2xx response, timeout, or network failure.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError(
        `The request timed out after ${Math.round(timeoutMs / 1000)}s. The model may still be loading.`,
        'timeout',
        0,
      );
    }
    throw new ApiError(
      'Could not reach the server. Check that the backend is running.',
      'network_error',
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let code = 'unknown_error';
    let message = `Request failed with status ${response.status}.`;
    let details: Record<string, unknown> | undefined;
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error) {
        code = body.error.code;
        message = body.error.message;
        details = body.error.details;
      }
    } catch {
      // A non-JSON error body (a proxy error page, say) leaves the defaults.
    }
    throw new ApiError(message, code, response.status, details);
  }

  return (await response.json()) as T;
}

/** Fetch service health, engine state and resident memory. */
export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health', {}, 10_000);
}

/** Fetch every supported language with its capability flags. */
export function fetchLanguages(): Promise<LanguagesResponse> {
  return request<LanguagesResponse>('/api/languages', {}, 15_000);
}

/**
 * Transcribe recorded audio.
 *
 * @param blob - Recorded audio in any container the browser produced. The
 *   backend decodes via FFmpeg, so WebM/Opus, Ogg and MP4 all work.
 * @param sourceLang - Application language code, or null to auto-detect.
 */
export function transcribe(
  blob: Blob,
  sourceLang: string | null,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('audio', blob, 'recording.webm');
  if (sourceLang) form.append('source_lang', sourceLang);
  return request<TranscriptionResult>('/api/transcribe', { method: 'POST', body: form });
}

/** Translate text between two languages. */
export function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslationResult> {
  return request<TranslationResult>('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
  });
}

/**
 * Synthesise speech and return it as a playable blob URL.
 *
 * @returns The object URL and the engine that produced the audio. The caller
 *   owns the URL and must revoke it to avoid leaking the blob.
 */
export async function speak(
  text: string,
  lang: string,
): Promise<{ url: string; engine: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl('/api/speak'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Could not reach the server.', 'network_error', 0);
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let message = 'Speech synthesis failed.';
    let code = 'tts_failed';
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error) {
        message = body.error.message;
        code = body.error.code;
      }
    } catch {
      // Keep the defaults for a non-JSON error body.
    }
    throw new ApiError(message, code, response.status);
  }

  const audio = await response.blob();
  return {
    url: URL.createObjectURL(audio),
    engine: response.headers.get('X-TTS-Engine') ?? 'unknown',
  };
}

/** Run transcribe, translate and synthesis in a single round trip. */
export function runPipeline(
  blob: Blob,
  sourceLang: string | null,
  targetLang: string,
  withSpeech: boolean,
): Promise<PipelineResult> {
  const form = new FormData();
  form.append('audio', blob, 'recording.webm');
  form.append('target_lang', targetLang);
  form.append('speak', String(withSpeech));
  if (sourceLang) form.append('source_lang', sourceLang);
  return request<PipelineResult>('/api/pipeline', { method: 'POST', body: form });
}

/** Decode a base64 audio payload into a playable object URL. */
export function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

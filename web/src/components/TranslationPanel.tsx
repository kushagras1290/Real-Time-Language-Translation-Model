/**
 * Batch-mode translation surface.
 *
 * Two facing columns separated by a hairline, with the source set in the UI
 * face and the translation set larger in the display face. The asymmetry is
 * intentional: the translation is the output the user came for, so it carries
 * more typographic weight than the input.
 */

import { Check, Copy, Loader2, Volume2 } from 'lucide-react';
import { useState } from 'react';

import type { Language } from '../lib/types';

interface TranslationPanelProps {
  sourceLanguage?: Language;
  targetLanguage?: Language;
  sourceText: string;
  translatedText: string;
  isTranslating: boolean;
  isSpeaking: boolean;
  /** Backend that produced the last audio, e.g. "mms_tts". */
  lastEngine: string | null;
  onSourceTextChange: (text: string) => void;
  onTranslate: () => void;
  onSpeak: () => void;
}

export function TranslationPanel({
  sourceLanguage,
  targetLanguage,
  sourceText,
  translatedText,
  isTranslating,
  isSpeaking,
  lastEngine,
  onSourceTextChange,
  onTranslate,
  onSpeak,
}: TranslationPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permission can be denied; the user can still select the text.
    }
  }

  const canSpeak = targetLanguage?.can_speak ?? false;

  return (
    <div className="grid border-t border-rule lg:grid-cols-2">
      {/* Source */}
      <section className="flex flex-col border-b border-rule px-6 py-6 lg:border-b-0 lg:border-r lg:pl-0 lg:pr-8">
        <header className="mb-4 flex items-baseline justify-between">
          <span className="label">Source</span>
          <span className="mono tabular text-2xs text-ink-faint">
            {sourceText.length}
          </span>
        </header>

        <textarea
          value={sourceText}
          onChange={(event) => onSourceTextChange(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter translates without reaching for the mouse.
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              onTranslate();
            }
          }}
          dir={sourceLanguage?.rtl ? 'rtl' : 'ltr'}
          placeholder="Type here, or record with the microphone below."
          rows={6}
          className="min-h-[9rem] flex-1 resize-none bg-transparent text-[17px] leading-[1.6] text-ink placeholder-ink-faint focus:outline-none"
        />

        <footer className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={onTranslate}
            disabled={isTranslating || !sourceText.trim()}
            className="flex h-10 items-center gap-2.5 border border-ink bg-ink px-5 text-paper-raised transition-colors hover:border-accent hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isTranslating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span className="mono text-2xs uppercase tracking-[0.16em]">
              {isTranslating ? 'Translating' : 'Translate'}
            </span>
          </button>

          <kbd className="mono text-2xs uppercase tracking-[0.12em] text-ink-faint">
            ⌘ ↵
          </kbd>
        </footer>
      </section>

      {/* Target */}
      <section className="flex flex-col px-6 py-6 lg:pl-8 lg:pr-0">
        <header className="mb-4 flex items-baseline justify-between">
          <span className="label">Translation</span>
          {lastEngine && (
            <span className="mono text-2xs uppercase tracking-[0.12em] text-ink-faint">
              {lastEngine.replace(/_/g, ' ')}
            </span>
          )}
        </header>

        <div
          dir={targetLanguage?.rtl ? 'rtl' : 'ltr'}
          className="min-h-[9rem] flex-1 whitespace-pre-wrap text-[21px] leading-[1.5] text-ink"
        >
          {translatedText || (
            <span className="text-[17px] text-ink-faint">
              The translation appears here.
            </span>
          )}
        </div>

        <footer className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onSpeak}
            disabled={!translatedText || isSpeaking || !canSpeak}
            title={
              targetLanguage && !canSpeak
                ? `No speech synthesis is available for ${targetLanguage.name}.`
                : 'Play the translation'
            }
            className="flex h-10 items-center gap-2.5 border border-rule-strong px-4 text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper-raised disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isSpeaking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            <span className="mono text-2xs uppercase tracking-[0.16em]">Listen</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!translatedText}
            className="flex h-10 items-center gap-2.5 border border-rule-strong px-4 text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper-raised disabled:cursor-not-allowed disabled:opacity-30"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="mono text-2xs uppercase tracking-[0.16em]">
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
        </footer>
      </section>
    </div>
  );
}

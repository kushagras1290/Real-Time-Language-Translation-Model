/**
 * Language selector, presented as an editorial masthead rather than a dropdown.
 *
 * The language name is set large in the display face and acts as the trigger.
 * That is the right emphasis for this product: choosing among 202 languages is
 * the primary act, not an incidental form field, so it should not look like a
 * select box wedged above a textarea.
 *
 * Search matches English name, endonym and code, so Hindi is reachable by
 * typing "hindi", "हिन्दी" or "hi".
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Language } from '../lib/types';

interface LanguagePickerProps {
  languages: Language[];
  value: string;
  onChange: (code: string) => void;
  /** Field label, e.g. "Source". */
  label: string;
  /**
   * Annotate languages lacking this capability.
   *
   * They stay **selectable**. A language Whisper cannot hear is still perfectly
   * translatable by typing, so disabling those rows blocked a working use case
   * — the microphone button disables itself instead.
   */
  requires?: 'transcribe' | 'speak';
  disabled?: boolean;
  /** Right-align the display type, for the target side of the layout. */
  align?: 'left' | 'right';
}

export function LanguagePicker({
  languages,
  value,
  onChange,
  label,
  requires,
  disabled = false,
  align = 'left',
}: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = languages.find((language) => language.code === value);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    searchRef.current?.focus();

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return languages;
    return languages.filter(
      (language) =>
        language.name.toLowerCase().includes(needle) ||
        language.native_name.toLowerCase().includes(needle) ||
        language.code.toLowerCase().includes(needle),
    );
  }, [languages, query]);

  /** The note shown against a language that lacks the requested capability. */
  function limitationOf(language: Language): string | null {
    if (requires === 'transcribe' && !language.can_transcribe) return 'type only';
    if (requires === 'speak' && !language.can_speak) return 'no voice';
    return null;
  }

  const alignment = align === 'right' ? 'items-end text-right' : 'items-start text-left';

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex flex-col ${alignment}`}>
        <span className="label mb-2">{label}</span>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((previous) => !previous)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`group flex flex-col ${alignment} transition-opacity disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <span className="display text-[clamp(2rem,5vw,3.25rem)] leading-[0.92] text-ink transition-colors group-hover:text-accent">
            {selected?.name ?? 'Select'}
          </span>

          <span className="mt-2 flex items-baseline gap-2.5">
            {selected && selected.native_name !== selected.name && (
              <span
                className="text-[15px] text-ink-muted"
                dir={selected.rtl ? 'rtl' : 'ltr'}
              >
                {selected.native_name}
              </span>
            )}
            {selected && (
              <span className="mono text-2xs uppercase tracking-[0.14em] text-ink-faint">
                {selected.code} · {selected.script}
              </span>
            )}
          </span>
        </button>

        {/* Capability strip: states plainly what this language can do, rather
            than relying on icons the user has to decode. */}
        {selected && (
          <div
            className={`mt-3 flex gap-3 ${align === 'right' ? 'flex-row-reverse' : ''}`}
          >
            <Capability enabled label="translate" />
            <Capability enabled={selected.can_transcribe} label="listen" />
            <Capability
              enabled={selected.can_speak}
              label={selected.has_neural_voice ? 'speak' : 'speak · basic'}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={`panel absolute z-50 mt-4 w-[min(26rem,calc(100vw-3rem))] shadow-[0_24px_60px_-24px_rgba(20,19,14,0.45)] ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            <div className="flex items-center gap-2.5 border-b border-rule px-4 py-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${languages.length} languages`}
                className="w-full bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
              />
              {query && (
                <span className="mono text-2xs tabular text-ink-faint">
                  {filtered.length}
                </span>
              )}
            </div>

            <ul role="listbox" className="max-h-[22rem] overflow-y-auto overscroll-contain">
              {filtered.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-ink-faint">
                  Nothing matches “{query}”.
                </li>
              )}

              {filtered.map((language) => {
                const limitation = limitationOf(language);
                const isSelected = language.code === value;
                return (
                  <li key={language.code} className="border-b border-rule last:border-0">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      title={
                        limitation === 'type only'
                          ? `Whisper cannot transcribe ${language.name}. You can still type and translate it.`
                          : limitation === 'no voice'
                            ? `No speech synthesis is available for ${language.name}.`
                            : undefined
                      }
                      onClick={() => {
                        onChange(language.code);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-paper-sunken ${
                        isSelected ? 'bg-accent-wash' : ''
                      }`}
                    >
                      {/* Name and endonym on one line: 202 rows of two-line
                          entries is an exhausting list to scan. */}
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm text-ink">
                          {language.name}
                        </span>
                        {language.native_name !== language.name && (
                          <span
                            className="truncate text-[12px] text-ink-faint"
                            dir={language.rtl ? 'rtl' : 'ltr'}
                          >
                            {language.native_name}
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 items-center gap-2.5">
                        {limitation && (
                          <span className="mono text-[9px] lowercase tracking-[0.06em] text-warn">
                            {limitation}
                          </span>
                        )}
                        {/* Fixed width and no wrapping: codes vary from 2 to 8
                            characters ("en" through "ace-Arab"), and letting
                            the long ones wrap made rows jump height. */}
                        <span className="mono w-[4.5rem] whitespace-nowrap text-right text-2xs uppercase tracking-[0.06em] text-ink-faint">
                          {language.code}
                        </span>
                        <Check
                          className={`h-3.5 w-3.5 text-accent ${
                            isSelected ? '' : 'invisible'
                          }`}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A single capability marker.
 *
 * Deliberately understated: an earlier pass set these in the same weight as the
 * mode switch, so "TRANSLATE LISTEN SPEAK" read as a row of navigation links
 * rather than a status line about the selected language.
 */
function Capability({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`mono flex items-center gap-1.5 text-[9px] lowercase tracking-[0.08em] ${
        enabled ? 'text-ink-muted' : 'text-ink-faint opacity-45'
      }`}
    >
      <span
        className={`h-[3px] w-[3px] rounded-full ${
          enabled ? 'bg-live' : 'bg-rule-strong'
        }`}
      />
      {label}
    </span>
  );
}

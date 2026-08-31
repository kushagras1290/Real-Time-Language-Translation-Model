/**
 * Live caption feed, laid out as a transcript rather than a chat log.
 *
 * Each utterance is numbered in the margin, the source is set small and muted,
 * and the translation carries the weight — the same hierarchy as the batch
 * panel, so switching modes does not feel like switching products.
 *
 * Auto-scroll follows new captions only while the reader is already at the
 * bottom. Yanking the view down while someone reads back is a standard and
 * irritating failure in caption UIs.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import type { Caption, Language } from '../lib/types';

interface LiveCaptionsProps {
  captions: Caption[];
  partial: string;
  sourceLanguage?: Language;
  targetLanguage?: Language;
  isLive: boolean;
}

/** Distance from the bottom still treated as "at the bottom". */
const STICK_THRESHOLD_PX = 56;

export function LiveCaptions({
  captions,
  partial,
  sourceLanguage,
  targetLanguage,
  isLive,
}: LiveCaptionsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (!stickToBottom) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [captions, partial, stickToBottom]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setStickToBottom(distance < STICK_THRESHOLD_PX);
  }

  const isEmpty = captions.length === 0 && !partial;

  return (
    <div className="border-t border-rule">
      <header className="flex items-baseline justify-between px-6 py-4 lg:px-0">
        <span className="label">Transcript</span>
        {captions.length > 0 && (
          <span className="mono tabular text-2xs text-ink-faint">
            {captions.length} {captions.length === 1 ? 'utterance' : 'utterances'}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[22rem] overflow-y-auto overscroll-contain border-t border-rule"
      >
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="display text-2xl text-ink-faint">
              {isLive ? 'Listening' : 'Idle'}
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-ink-faint">
              {isLive
                ? 'Captions appear as you speak and settle when you pause.'
                : 'Press Record to start a live session.'}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {captions.map((caption, index) => (
            <motion.article
              key={caption.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-rule px-6 py-4 lg:px-0"
            >
              <span className="mono tabular pt-1 text-2xs text-ink-faint">
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="min-w-0">
                <p
                  dir={sourceLanguage?.rtl ? 'rtl' : 'ltr'}
                  className="text-[13px] leading-relaxed text-ink-faint"
                >
                  {caption.source}
                </p>
                {caption.translation && (
                  <p
                    dir={targetLanguage?.rtl ? 'rtl' : 'ltr'}
                    className="mt-1.5 text-[17px] leading-[1.5] text-ink"
                  >
                    {caption.translation}
                  </p>
                )}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>

        {partial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-[2.5rem_1fr] gap-4 bg-accent-wash px-6 py-4 lg:px-0"
          >
            <span className="mono pt-1 text-2xs text-accent">··</span>
            <p
              dir={sourceLanguage?.rtl ? 'rtl' : 'ltr'}
              className="text-[15px] leading-relaxed text-ink"
            >
              {partial}
              <span className="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse bg-accent align-text-bottom" />
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/**
 * Control primitives in the editorial console style: square edges, hairline
 * rules, monospace labels, one vermillion accent reserved for live state and
 * the primary action.
 */

import { motion } from 'framer-motion';
import { AlertTriangle, Loader2, Mic, Square } from 'lucide-react';
import type { ReactNode } from 'react';

export type AppMode = 'batch' | 'live';

// --------------------------------------------------------------------------
// Record button
// --------------------------------------------------------------------------

interface RecordButtonProps {
  active: boolean;
  busy: boolean;
  disabled?: boolean;
  level: number;
  onClick: () => void;
  /** Describes the action, e.g. "Start recording". */
  label: string;
  /** Why the control is unavailable. Shown on hover when disabled. */
  disabledReason?: string;
}

export function RecordButton({
  active,
  busy,
  disabled = false,
  level,
  onClick,
  label,
  disabledReason,
}: RecordButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      aria-pressed={active}
      title={disabled && disabledReason ? disabledReason : label}
      className={`group relative flex h-14 items-center gap-3 border px-6 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent text-paper-raised'
          : 'border-ink bg-ink text-paper-raised hover:bg-accent hover:border-accent'
      }`}
    >
      {/* Level bleed: a vertical wash that rises with input, so the button
          itself reports that the microphone is hearing something. */}
      {active && (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-paper-raised/20 transition-[height] duration-75"
          style={{ height: `${Math.min(100, level * 120)}%` }}
        />
      )}

      <span className="relative flex items-center gap-3">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : active ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        <span className="mono text-2xs uppercase tracking-[0.16em]">
          {busy ? 'Working' : active ? 'Stop' : 'Record'}
        </span>
      </span>
    </button>
  );
}

// --------------------------------------------------------------------------
// Mode switch
// --------------------------------------------------------------------------

interface ModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  disabled?: boolean;
}

export function ModeSwitch({ mode, onChange, disabled = false }: ModeSwitchProps) {
  const options: { value: AppMode; label: string; hint: string }[] = [
    { value: 'batch', label: 'Record', hint: 'Record, then translate' },
    { value: 'live', label: 'Live', hint: 'Captions as you speak' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Translation mode"
      className="inline-flex border border-rule"
    >
      {options.map((option, index) => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={selected}
            title={option.hint}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              index > 0 ? 'border-l border-rule' : ''
            } ${selected ? 'text-paper-raised' : 'text-ink-muted hover:text-ink'}`}
          >
            {selected && (
              <motion.span
                layoutId="mode-fill"
                className="absolute inset-0 bg-ink"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
            <span className="mono relative text-2xs uppercase tracking-[0.16em]">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Status readout
// --------------------------------------------------------------------------

interface StatusProps {
  tone?: 'neutral' | 'live' | 'warn' | 'error';
  children: ReactNode;
}

const TONE_TEXT: Record<NonNullable<StatusProps['tone']>, string> = {
  neutral: 'text-ink-faint',
  live: 'text-live',
  warn: 'text-warn',
  error: 'text-accent',
};

export function Status({ tone = 'neutral', children }: StatusProps) {
  return (
    <span
      className={`mono flex items-center gap-1.5 text-2xs uppercase tracking-[0.14em] ${TONE_TEXT[tone]}`}
    >
      {tone === 'live' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

// --------------------------------------------------------------------------
// Error banner
// --------------------------------------------------------------------------

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="flex items-start gap-3 border-l-2 border-accent bg-accent-wash px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <p className="flex-1 text-sm leading-relaxed text-ink">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="mono text-2xs uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink"
      >
        Close
      </button>
    </motion.div>
  );
}

// --------------------------------------------------------------------------
// Section rule
// --------------------------------------------------------------------------

/** A labelled hairline divider, the main structural device in this layout. */
export function SectionRule({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-rule" />
      {children && <span className="label">{children}</span>}
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

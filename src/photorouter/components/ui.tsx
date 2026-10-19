import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { LIGHT_LABEL, TRIP, cityStyle } from '../lib/data';
import type { CityId, Light } from '../lib/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('m-0 font-mono text-[11px] uppercase tracking-[0.08em] text-muted', className)}>{children}</p>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft'; size?: 'sm' | 'md' };

export function Button({ variant = 'soft', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'md' ? 'h-9 px-3.5 text-[13px]' : 'h-7 px-2.5 text-xs',
        variant === 'primary' && 'rt-btn border-transparent',
        variant === 'soft' && 'rt-btn-quiet border-transparent',
        variant === 'ghost' && 'border-transparent bg-transparent text-muted hover:text-ink',
        className,
      )}
      {...rest}
    />
  );
}

export function IconButton({ className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'rt-btn-quiet inline-grid size-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 [&_svg]:size-4',
        className,
      )}
      {...rest}
    />
  );
}

export function Toggle({ on, onClick, children, className, dot }: { on: boolean; onClick: () => void; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
        on ? 'border-transparent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted hover:border-muted hover:text-ink',
        className,
      )}
    >
      {dot && <span className="size-2 rounded-full bg-(--c)" />}
      {children}
    </button>
  );
}

/**
 * Radio-group keys for a role="radiogroup": arrows move the selection (wrapping), Home and End
 * jump to the ends, and focus follows. Pair with tabIndex={i === current ? 0 : -1} on the radios.
 */
export function radioKeys<T>(values: readonly T[], current: number, onChange: (v: T) => void, disabled?: boolean) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const n = values.length;
    const to = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: n - 1 }[e.key];
    if (to == null || disabled) return;
    e.preventDefault();
    const i = (to + n) % n;
    onChange(values[i]!);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  };
}

export function Seg<T extends string>({ value, options, onChange, label, disabled }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  const current = Math.max(0, options.findIndex((o) => o.v === value));
  const onKeyDown = radioKeys(options.map((o) => o.v), current, onChange, disabled);
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} onKeyDown={onKeyDown} className={cx('inline-flex rounded-full border border-line bg-surface-2 p-0.5', disabled && 'opacity-50')}>
      {options.map((o, i) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          tabIndex={i === current ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cx(
            'h-7 rounded-full px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed',
            value === o.v ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CityChip({ city }: { city: CityId }) {
  return (
    <span style={cityStyle(city)} className="inline-flex h-6 items-center rounded-full border border-current px-2.5 text-xs font-semibold text-(--c)">
      {TRIP.cities[city]?.name ?? city}
    </span>
  );
}

export function LightChip({ light, children }: { light: Light; children?: ReactNode }) {
  return (
    <span className={cx(`lt-${light}`, 'inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-semibold whitespace-nowrap')}>
      <span className="size-2 rounded-full bg-(--c)" />
      {children ?? LIGHT_LABEL[light]}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-semibold whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

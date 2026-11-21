import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-lg border bg-bg px-3 text-sm text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-[#3d3d46] focus:border-electric focus:outline-none focus-visible:outline-none disabled:opacity-50';

export function Field({
  label,
  error,
  hint,
  children,
  className,
  optional,
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
        <span>{label}</span>
        {optional && <span className="text-[11px] font-normal text-ink-3">Optional</span>}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} className="mt-1 text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1 text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, suffix, ...rest }, ref) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(control, 'h-10', invalid ? 'border-bad' : 'border-line-strong', suffix && 'pr-12', className)}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-3">{suffix}</span>
    </div>
  );
});

/** Numeric text input: keeps a string so partially typed values ("12.") are allowed. */
export const NumberInput = forwardRef<HTMLInputElement, InputProps>(function NumberInput(props, ref) {
  return <Input ref={ref} type="text" inputMode="decimal" autoComplete="off" {...props} />;
});

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(control, 'h-10 cursor-pointer pr-8', invalid ? 'border-bad' : 'border-line-strong', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 border-line-strong py-2', className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-[13px] text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-150', checked ? 'border-brand bg-brand' : 'border-line-strong bg-raised')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white transition-transform duration-150', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
    </div>
  );
}

/** Multi-select chips (muscle groups). */
export function ChipSelect({ options, value, onChange, label }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={cn(
              'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150',
              on ? 'border-brand/50 bg-brand-soft text-brand' : 'border-line-strong text-ink-2 hover:border-[#3d3d46] hover:text-ink',
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** "" -> null, otherwise a finite number (or NaN to signal invalid). */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export const numStr = (n: number | null | undefined, dp = 2) => (n == null ? '' : String(Math.round(n * 10 ** dp) / 10 ** dp));

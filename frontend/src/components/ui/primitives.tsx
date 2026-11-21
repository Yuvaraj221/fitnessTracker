import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// ------------------------------------------------------------------ Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-[#160a03] hover:bg-brand-hover font-semibold',
  secondary: 'bg-raised text-ink border border-line-strong hover:bg-overlay hover:border-[#3d3d46]',
  ghost: 'text-ink-2 hover:text-ink hover:bg-raised',
  danger: 'bg-bad text-white hover:bg-[#f25757] font-semibold',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

/** Square icon-only button. `label` doubles as aria-label and tooltip. */
export function IconButton({ icon: Icon, label, size = 'md', tone = 'default', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-raised disabled:opacity-40',
        tone === 'danger' ? 'hover:text-bad' : 'hover:text-ink',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

// ------------------------------------------------------------------ Card

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({ title, subtitle, action, children, className, bodyClassName }: CardProps) {
  return (
    <section className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn('p-5', title || action ? 'pt-4' : '', bodyClassName)}>{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ Badge

type Tone = 'neutral' | 'brand' | 'electric' | 'good' | 'bad';
const tones: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-2 border-line-strong',
  brand: 'bg-brand-soft text-brand border-brand/30',
  electric: 'bg-electric-soft text-electric border-electric/30',
  good: 'bg-good-soft text-good border-good/30',
  bad: 'bg-bad-soft text-bad border-bad/30',
};

export function Badge({ tone = 'neutral', children, className, icon: Icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

export const SampleBadge = () => (
  <Badge tone="neutral" className="border-dashed">
    Sample
  </Badge>
);

// ------------------------------------------------------------------ Skeleton & empty

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-skeleton rounded-lg bg-raised', className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-14')}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-line-strong bg-raised">
        <Icon className="size-5 text-ink-2" aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-bad/30 bg-bad-soft p-5">
      <p className="text-sm font-medium text-ink">FORGE couldn’t load your data</p>
      <p className="mt-1 text-[13px] text-ink-2">{error instanceof Error ? error.message : String(error)}</p>
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={onRetry}>
          Retry loading
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Segmented control

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-bg p-0.5 scrollbar-thin">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 font-medium whitespace-nowrap transition-colors duration-150',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === o.value ? 'bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Stat tile

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  delta,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  delta?: { text: string; positive: boolean | null };
  className?: string;
}) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] text-ink-2">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />}
      </div>
      <p className="mt-2 flex items-baseline gap-1 tabular">
        <span className="text-2xl font-semibold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-[13px] text-ink-3">{unit}</span>}
      </p>
      {(delta || hint) && (
        <p className="mt-1 truncate text-xs text-ink-3">
          {delta && (
            <span className={cn('mr-1 font-medium', delta.positive == null ? 'text-ink-2' : delta.positive ? 'text-good' : 'text-warn')}>{delta.text}</span>
          )}
          {hint}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Progress

export function ProgressBar({
  value,
  max,
  color = 'var(--color-brand)',
  className,
  label,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-raised', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function ProgressRing({
  value,
  max,
  size = 148,
  stroke = 10,
  color = 'var(--color-brand)',
  children,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-raised)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">{children}</h2>
      {action}
    </div>
  );
}

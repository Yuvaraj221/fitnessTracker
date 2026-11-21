import { ProgressBar } from '../../components/ui/primitives';
import { fmtNum } from '../../lib/format';

export function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="flex items-center gap-1.5 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
          {label}
        </span>
        <span className="text-ink tabular">
          {fmtNum(value)}
          <span className="text-ink-3"> / {fmtNum(target)} g</span>
        </span>
      </div>
      <ProgressBar value={value} max={target} color={color} label={`${label} ${fmtNum(value)} of ${fmtNum(target)} grams`} />
    </div>
  );
}

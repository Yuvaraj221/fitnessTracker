import { CheckCircle2, AlertTriangle, X, Award } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type ToastKind = 'success' | 'error' | 'achievement';
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  achievement: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-4), { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : kind === 'achievement' ? 6500 : 3500);
    },
    [dismiss],
  );

  const value = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      achievement: (t, d) => push('achievement', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-fade-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-overlay px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.45)]',
              t.kind === 'achievement' ? 'border-brand/40' : t.kind === 'error' ? 'border-bad/40' : 'border-line-strong',
            )}
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === 'success' && <CheckCircle2 className="size-4 text-good" aria-hidden />}
              {t.kind === 'error' && <AlertTriangle className="size-4 text-bad" aria-hidden />}
              {t.kind === 'achievement' && <Award className="size-4 text-brand" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              {t.kind === 'achievement' && <p className="text-[11px] font-medium tracking-wide text-brand uppercase">Achievement unlocked</p>}
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-ink-2">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 rounded-md p-1 text-ink-3 hover:bg-raised hover:text-ink"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

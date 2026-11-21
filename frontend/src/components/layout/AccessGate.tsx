import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { authHeaders } from '../../api/client';
import { useHealth } from '../../api/hooks';
import { getAccessKey, setAccessKey, UNAUTHORIZED_EVENT } from '../../lib/accessKey';
import { Field, Input } from '../ui/form';
import { Button } from '../ui/primitives';
import { LogoMark } from './Logo';

/**
 * When the deployment sets FORGE_ACCESS_KEY, the app asks for it once per
 * device before showing any data. Without the variable this renders children directly.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const { data: health } = useHealth();
  const qc = useQueryClient();
  const [locked, setLocked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (health?.accessKeyRequired && !getAccessKey()) setLocked(true);
  }, [health]);

  useEffect(() => {
    const onUnauthorized = () => setLocked(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setError('Enter the access key set for this deployment.');
      return;
    }
    setChecking(true);
    setError(null);
    setAccessKey(value.trim());
    try {
      const res = await fetch('/api/settings', { headers: authHeaders() });
      if (res.status === 401) {
        setAccessKey('');
        setError('That key didn’t match. Check FORGE_ACCESS_KEY in your Vercel project settings.');
        return;
      }
      setLocked(false);
      setValue('');
      await qc.invalidateQueries();
    } catch {
      setError('FORGE couldn’t reach its server. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  };

  if (!locked) return <>{children}</>;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
        <div className="mb-5 flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-[15px] font-bold tracking-[0.18em]">FORGE</p>
            <p className="text-xs text-ink-3">This deployment is protected</p>
          </div>
        </div>
        <Field label="Access key" error={error} hint="Saved on this device so you only enter it once.">
          {(id, d) => (
            <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" invalid={!!error} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          )}
        </Field>
        <Button type="submit" variant="primary" icon={KeyRound} loading={checking} className="mt-4 w-full">
          Unlock FORGE
        </Button>
      </form>
    </div>
  );
}

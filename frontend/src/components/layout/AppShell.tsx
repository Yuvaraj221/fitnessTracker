import { AlertTriangle, Bell, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAchievements, useHealth, useSettings, useToday } from '../../api/hooks';
import { cn } from '../../lib/cn';
import { fmtDateLong, fmtDateMedium } from '../../lib/format';
import { LogoMark } from './Logo';
import { NAV } from './nav';

const COLLAPSE_KEY = 'forge.sidebar.collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150',
              isActive ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised/60 hover:text-ink',
              collapsed && 'justify-center px-0',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand" aria-hidden />}
              <Icon className={cn('size-4 shrink-0', isActive ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')} aria-label="FORGE home">
      <LogoMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-[0.18em] text-ink">FORGE</span>
          <span className="block text-[10px] tracking-wide text-ink-3">Build. Track. Evolve.</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const today = useToday();
  const { data: settings } = useSettings();
  const { data: ach } = useAchievements();
  const { data: health } = useHealth();
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  const initials = (settings?.display_name || 'Athlete')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-[#0e0e11] transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Brand collapsed={collapsed} />
        <Sidebar collapsed={collapsed} />
        <div className={cn('border-t border-line p-3', collapsed && 'flex justify-center')}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] text-ink-3 hover:bg-raised hover:text-ink"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="mx-auto size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="animate-fade-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-[#0e0e11]">
            <div className="flex items-center justify-between pr-3">
              <Brand collapsed={false} />
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-ink-2 hover:bg-raised" aria-label="Close menu">
                <X className="size-4" />
              </button>
            </div>
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-raised lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink-2">
              <span className="hidden sm:inline">{fmtDateLong(today)}</span>
              <span className="sm:hidden">{fmtDateMedium(today)}</span>
            </p>
          </div>

          {ach && (
            <Link
              to="/achievements"
              className="hidden items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5 hover:border-line-strong sm:flex"
              title={`${Math.round(ach.level.xp)} XP · ${Math.round(ach.level.nextLevelXp - ach.level.xp)} XP to level ${ach.level.level + 1}`}
            >
              <span className="flex size-6 items-center justify-center rounded-md bg-brand-soft text-[11px] font-bold text-brand tabular">{ach.level.level}</span>
              <span className="leading-tight">
                <span className="block text-xs font-medium text-ink">{ach.activeTitle}</span>
                <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-raised">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${ach.level.progressPct}%` }} />
                </span>
              </span>
            </Link>
          )}

          <Link
            to="/achievements"
            className="relative flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-raised hover:text-ink"
            aria-label={ach?.unseen ? `${ach.unseen} new achievements` : 'Achievements'}
            title={ach?.unseen ? `${ach.unseen} new achievement${ach.unseen === 1 ? '' : 's'}` : 'No new achievements'}
          >
            <Bell className="size-4" />
            {!!ach?.unseen && (
              <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-4 font-bold text-[#160a03] tabular">
                {ach.unseen > 9 ? '9+' : ach.unseen}
              </span>
            )}
          </Link>

          <Link
            to="/settings"
            className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-raised text-xs font-semibold text-ink-2 hover:text-ink"
            aria-label="Profile and settings"
            title={settings?.display_name ?? 'Profile'}
          >
            {initials}
          </Link>
        </header>

        {health && !health.storage.persistent && (
          <div role="status" className="flex items-start gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-[13px] text-ink-2 sm:px-6">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <p>
              <span className="font-medium text-ink">Temporary storage.</span> This deployment has no Vercel Blob store connected, so changes can disappear when the server restarts.
              Connect a Blob store in your Vercel project to keep your data.
            </p>
          </div>
        )}

        <main className="mx-auto w-full min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

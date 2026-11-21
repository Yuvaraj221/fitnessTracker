export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1a1a1f" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#33333b" />
      <path d="M10 8h13v4h-8.6v3.2h7.2v3.9h-7.2V24H10z" fill="#ff6b1f" />
    </svg>
  );
}

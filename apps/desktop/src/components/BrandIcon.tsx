/** The BetterKeePass shield, colored by the active theme. */
export function BrandIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path
        d="M32 10 49 17v13c0 11-6.8 19.2-17 24C21.8 49.2 15 41 15 30V17l17-7Z"
        fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinejoin="round"
      />
      <circle cx="32" cy="29" r="4" fill="var(--accent)" />
      <path d="M32 33v7" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

function extractHost(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function initialsFrom(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export interface AvatarProps {
  title: string;
  url?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-[11px] rounded-md',
  md: 'h-8 w-8 text-xs rounded-lg',
  lg: 'h-11 w-11 text-sm rounded-xl',
};

export function Avatar({ title, url, size = 'md', className }: AvatarProps) {
  const faviconsEnabled = useUiStore((s) => s.faviconsEnabled);
  const host = extractHost(url);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setFaviconUrl(null);
    setImgFailed(false);
    if (!faviconsEnabled || !host) return;
    let active = true;
    api
      .getFavicon(host)
      .then((res) => {
        if (active && res) setFaviconUrl(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [faviconsEnabled, host]);

  const hue = hashHue(host || title || 'betterkeepass');

  if (faviconsEnabled && faviconUrl && !imgFailed) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface p-1',
          sizeClasses[size],
          className,
        )}
      >
        <img
          src={faviconUrl}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        backgroundColor: `hsla(${hue}, 62%, 48%, 0.16)`,
        color: `hsl(${hue}, 68%, 52%)`,
        borderColor: `hsla(${hue}, 62%, 48%, 0.28)`,
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border font-semibold tracking-tight select-none',
        sizeClasses[size],
        className,
      )}
    >
      {initialsFrom(title)}
    </span>
  );
}

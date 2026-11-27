import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/cn';
import { getKeepassIcon } from '../lib/keepassIcons';
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
  iconId?: number | null;
  customIconUuid?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-[11px] rounded-md',
  md: 'h-8 w-8 text-xs rounded-lg',
  lg: 'h-11 w-11 text-sm rounded-xl',
};

const iconSizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function Avatar({
  title,
  url,
  iconId,
  customIconUuid,
  size = 'md',
  className,
}: AvatarProps) {
  const faviconsEnabled = useUiStore((s) => s.faviconsEnabled);
  const host = extractHost(url);
  const [imgFailed, setImgFailed] = useState(false);

  const customIconQuery = useQuery({
    queryKey: ['custom-icon', customIconUuid],
    queryFn: () => api.getCustomIcon(customIconUuid!),
    enabled: Boolean(customIconUuid),
    staleTime: Infinity,
  });

  const faviconQuery = useQuery({
    queryKey: ['favicon', host],
    queryFn: () => api.getFavicon(host!),
    enabled: Boolean(!customIconUuid && faviconsEnabled && host),
    staleTime: 1000 * 60 * 30,
  });

  const imageSrc =
    customIconQuery.data ?? (faviconsEnabled ? faviconQuery.data : null) ?? null;

  useEffect(() => {
    setImgFailed(false);
  }, [imageSrc]);

  const hue = hashHue(host || title || 'betterkeepass');

  if (imageSrc && !imgFailed) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface p-1',
          sizeClasses[size],
          className,
        )}
      >
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  const BuiltInIcon = iconId && iconId !== 0 ? getKeepassIcon(iconId) : null;

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
      {BuiltInIcon ? (
        <BuiltInIcon className={iconSizeClasses[size]} aria-hidden="true" />
      ) : (
        initialsFrom(title)
      )}
    </span>
  );
}

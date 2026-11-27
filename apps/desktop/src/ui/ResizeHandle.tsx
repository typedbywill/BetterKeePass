import { useRef, useState, type PointerEvent } from 'react';
import { cn } from '../lib/cn';

export interface ResizeHandleProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaLabel?: string;
  className?: string;
}

export function ResizeHandle({
  value,
  min,
  max,
  onChange,
  ariaLabel = 'Resize panel',
  className,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(value);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = value;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const delta = e.clientX - startX.current;
    const clamped = Math.max(min, Math.min(max, Math.round(startWidth.current + delta)));
    onChange(clamped);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(Math.max(min, value - 16));
        if (e.key === 'ArrowRight') onChange(Math.min(max, value + 16));
      }}
      className={cn(
        'relative w-1 shrink-0 cursor-col-resize select-none bg-border transition-colors hover:bg-accent/60 focus-visible:bg-accent outline-none',
        dragging && 'bg-accent',
        className,
      )}
    >
      <span className="absolute inset-y-0 -left-1 -right-1" aria-hidden="true" />
    </div>
  );
}

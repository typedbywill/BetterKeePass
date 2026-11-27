import {
  Label as AriaLabel,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  SliderThumb as AriaSliderThumb,
  SliderTrack as AriaSliderTrack,
} from 'react-aria-components';
import { cn } from '../lib/cn';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  minValue: number;
  maxValue: number;
  step?: number;
  className?: string;
}

export function Slider({
  label,
  value,
  onChange,
  minValue,
  maxValue,
  step = 1,
  className,
}: SliderProps) {
  return (
    <AriaSlider
      value={value}
      onChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      className={cn('flex flex-col gap-1.5 w-full', className)}
    >
      <div className="flex items-center justify-between text-xs">
        <AriaLabel className="font-medium text-fg-muted">{label}</AriaLabel>
        <AriaSliderOutput className="font-mono text-fg font-semibold tabular-nums" />
      </div>
      <AriaSliderTrack className="relative h-5 w-full flex items-center cursor-pointer">
        {({ state }) => {
          const pct = state.getThumbPercent(0) * 100;
          return (
            <>
              <div className="h-1.5 w-full rounded-full bg-bg-muted overflow-hidden">
                <div
                  className="h-full bg-accent transition-[width] duration-75"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <AriaSliderThumb className="h-3.5 w-3.5 rounded-full border border-accent bg-surface shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:scale-110 transition-transform" />
            </>
          );
        }}
      </AriaSliderTrack>
    </AriaSlider>
  );
}

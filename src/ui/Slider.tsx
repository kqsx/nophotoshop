import { useRef, type CSSProperties, type ReactNode } from 'react';

interface Props {
  label: ReactNode;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  def?: number;
  unit?: string;
  onChange: (v: number) => void;
  onCommit?: () => void;
  gradient?: string;
  fill?: string;
  disabled?: boolean;
}

/** Thanh trượt núm lớn, có số, bấm đúp để về mặc định. */
export function Slider({ label, value, min = -100, max = 100, step = 1, def = 0, unit = '', onChange, onCommit, gradient, fill, disabled }: Props) {
  const id = useRef('s' + Math.random().toString(36).slice(2, 8)).current;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const origin = pct(Math.min(max, Math.max(min, def)));
  const cur = pct(value);
  const style = {
    '--lo': `${Math.min(origin, cur)}%`,
    '--hi': `${Math.max(origin, cur)}%`,
    '--track-l': 'var(--fill-2)',
    ...(fill ? { '--fillc': fill } : {}),
    ...(gradient ? { '--grad': gradient } : {}),
  } as CSSProperties;
  const reset = () => { onChange(def); onCommit?.(); };
  const shown = Math.abs(value - Math.round(value)) > 0.01 ? value.toFixed(1) : Math.round(value);
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id} className={value !== def ? 'changed' : ''} onClick={reset} title="Bấm để về mặc định">
        {value > 0 && min < 0 ? '+' : ''}{shown}{unit}
      </output>
      <input
        id={id}
        type="range"
        className={gradient ? 'hue-track' : ''}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onTouchEnd={onCommit}
        onDoubleClick={reset}
      />
    </div>
  );
}

import { useId } from "react";
import styles from "./styles/Range.module.css";

type RangeProps = {
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  disabled?: boolean;
} & (
  | { steps: number[]; min?: never; max?: never; step?: never }
  | { min: number; max: number; step: number; steps?: never }
);

function nearestIndex(steps: number[], value: number): number {
  return steps.reduce(
    (best, s, i) => (Math.abs(s - value) < Math.abs(steps[best] - value) ? i : best),
    0,
  );
}

export function Range({ value, onChange, unit, disabled, ...rest }: RangeProps) {
  const datalistId = useId();

  if ("steps" in rest && rest.steps) {
    const { steps } = rest;
    const idx = nearestIndex(steps, value);
    return (
      <div className={styles.group} style={disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={idx}
          list={datalistId}
          onChange={(e) => onChange(steps[Number(e.target.value)])}
          className={styles.range}
          disabled={disabled}
        />
        <datalist id={datalistId}>
          {steps.map((s, i) => <option key={s} value={i} />)}
        </datalist>
        <span className={styles.value}>
          {value}
          {unit}
        </span>
      </div>
    );
  }

  const { min, max, step } = rest as { min: number; max: number; step: number };
  return (
    <div className={styles.group} style={disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
        disabled={disabled}
      />
      <span className={styles.value}>
        {value}
        {unit}
      </span>
    </div>
  );
}

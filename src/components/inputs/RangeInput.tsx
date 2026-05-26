import inputStyles from "./styles/input.module.css";
import { Range } from "../../primitives/Range";

type RangeInputProps = {
  label: string;
  value: number;
  onChange: (newValue: number) => void;
  unit?: string;
  disabled?: boolean;
} & (
  | { steps: number[]; min?: never; max?: never; step?: never }
  | { min: number; max: number; step?: number; steps?: never }
);

export function RangeInput({ label, value, onChange, unit, disabled, ...rest }: RangeInputProps) {
  const rangeProps = "steps" in rest && rest.steps
    ? { steps: rest.steps }
    : { min: (rest as any).min, max: (rest as any).max, step: (rest as any).step ?? 1 };

  return (
    <>
      <label className={inputStyles.inputLabel}>{label}</label> {/* NOSONAR */}
      <Range
        value={value}
        onChange={onChange}
        unit={unit}
        disabled={disabled}
        {...rangeProps}
      />
    </>
  );
}

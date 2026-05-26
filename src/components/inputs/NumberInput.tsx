import inputStyles from "./styles/input.module.css";
import { Input } from "../../primitives/Input";

export default function NumberInput({
  label,
  value,
  onChange,
  float = false,
}: {
  label: string;
  value: number;
  onChange: (newValue: number) => void;
  float?: boolean;
}) {
  return (
    <>
      <label className={inputStyles.inputLabel}>{label}</label> {/* NOSONAR */}
      <Input
        type="number"
        value={value}
        onChange={(e) =>
          onChange(
            float
              ? Number.parseFloat(e.target.value)
              : Number.parseInt(e.target.value),
          )
        }
        step={float ? undefined : 1}
      />
    </>
  );
}

import inputStyles from "./styles/input.module.css";
import { SelectBase } from "../../primitives/SelectBase";

export function SelectInput({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {label && <label className={inputStyles.inputLabel}>{label}</label>}{" "}
      <SelectBase value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectBase>
    </>
  );
}

import inputStyles from "./styles/input.module.css";
import { Toggle } from "../../primitives/Toggle";

export default function ToggleInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (newValue: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label className={inputStyles.inputLabel}>{label}</label>
      <Toggle checked={value} onChange={onChange} disabled={disabled} />
    </>
  );
}

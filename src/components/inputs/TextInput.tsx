import inputStyles from "./styles/input.module.css";
import { Input } from "../../primitives/Input";

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  auto,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  auto?: string[];
  disabled?: boolean;
}) {
  const datalistId = auto ? `${label?.replace(/\s+/g, "-")}-datalist` : undefined;
  return (
    <>
      {label && <label className={inputStyles.inputLabel}>{label}</label>}{" "}
      <Input
        type="text"
        mono
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={auto ? datalistId : undefined}
        disabled={disabled}
      />
      {auto && (
        <datalist id={datalistId}>
          {auto.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  );
}

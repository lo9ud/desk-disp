import { useState } from "react";
import styles from "./styles/ChipInput.module.css";

interface LockedChip {
  label: string;
  title?: string;
}

export interface ChipInputProps {
  chips: string[];
  onChipsChange: (chips: string[]) => void;
  lockedChips?: LockedChip[];
  suggestions?: string[];
  placeholder?: string;
  datalistId?: string;
}

export function ChipInput({
  chips,
  onChipsChange,
  lockedChips = [],
  suggestions = [],
  placeholder,
  datalistId = "chip-input-suggestions",
}: ChipInputProps) {
  const [inputVal, setInputVal] = useState("");

  function addChip(value: string) {
    const trimmed = value.trim().replace(/^["']|["']$/g, "");
    if (!trimmed || chips.includes(trimmed)) return;
    onChipsChange([...chips, trimmed]);
  }

  function removeChip(idx: number) {
    onChipsChange(chips.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) {
      e.preventDefault();
      addChip(inputVal);
      setInputVal("");
    } else if (e.key === "Backspace" && !inputVal && chips.length > 0) {
      removeChip(chips.length - 1);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    const isDatalistPick = (e.nativeEvent as InputEvent).inputType === undefined;
    if (isDatalistPick && v.trim()) {
      addChip(v);
      setInputVal("");
    } else {
      setInputVal(v);
    }
  }

  function handleBlur() {
    if (inputVal.trim()) {
      addChip(inputVal);
      setInputVal("");
    }
  }

  const defaultPlaceholder =
    chips.length === 0 ? (placeholder ?? "Add…") : "+";

  return (
    <div
      className={styles.container}
      onClick={(e) => {
        (e.currentTarget as HTMLDivElement).querySelector("input")?.focus();
      }}
    >
      {chips.map((chip, i) => (
        <span key={i} className={styles.chip}>
          {chip}
          <button
            className={styles.removeBtn}
            onClick={(e) => {
              e.stopPropagation();
              removeChip(i);
            }}
            tabIndex={-1}
            type="button"
          >
            ×
          </button>
        </span>
      ))}
      {lockedChips.map((lc, i) => (
        <span key={`locked-${i}`} className={styles.chipLocked} title={lc.title}>
          {lc.label}
        </span>
      ))}
      <input
        value={inputVal}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        list={datalistId}
        className={styles.input}
        placeholder={defaultPlaceholder}
        type="text"
      />
      <datalist id={datalistId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

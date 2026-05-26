import inputStyles from "./styles/input.module.css";
import styles from "./styles/ColorInput.module.css";
import { Button } from "../../primitives/Button";
import { useRef, useState } from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";

export function ColourInput({
  label,
  value,
  onChange,
  alpha = false,
  transparent = false,
}: {
  label: string;
  value: string;
  onChange: (newValue: string) => void;
  alpha?: boolean;
  transparent?: boolean;
}) {
  const [liveValue, setLiveValue] = useState(value);
  const onChangeDebounced = useDebouncedCallback(onChange, 30, 100);

  // Sync liveValue when value prop changes externally (theme load, cancel, etc.)
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    setLiveValue(value);
  }

  const colorSelect = (
    <input
      type="color"
      value={liveValue}
      onChange={(e) => { setLiveValue(e.target.value); onChangeDebounced(e.target.value); }}
      onClick={() => onChange(liveValue)}
      className={styles.colorInput}
      //@ts-expect-error alpha is not supported on all browsers yet, but we'll allow it anyway until it is
      alpha={alpha?"transparent":"solid"} // NOSONAR
    />
  );
  return (
    <>
      <label className={inputStyles.inputLabel}>{label}</label> {/* NOSONAR */}
      {transparent ? (
        <div className={styles.colorInputWithTransparent}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange("transparent")}
          >
            Transparent
          </Button>
          {colorSelect}
        </div>
      ) : (
        colorSelect
      )}
    </>
  );
}

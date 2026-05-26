import styles from "./styles/Toggle.module.css";

export function Toggle({
  checked,
  onChange,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div className={styles.track}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={styles.hiddenInput}
        disabled={disabled}
      />
      <span className={styles.thumb} />
    </div>
  );
}

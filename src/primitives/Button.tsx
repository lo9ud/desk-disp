import styles from "./styles/Button.module.css";
import { combineClassNames } from "../utils/format";
import { useWindowEvent } from "../hooks/useWindowEvent";

type ButtonSize = "sm" | "md";

const variantClass = {
  default: undefined,
  ghost: [styles.ghost],
  ghost_danger: [styles.ghostDanger],
  accent: [styles.accent],
  danger: [styles.danger],
  warning: [styles.warning],
  inline: [styles.inline],
  icon: [styles.icon],
  icon_ghost: [styles.icon, styles.ghost],
  icon_danger: [styles.icon, styles.danger],
  icon_accent: [styles.icon, styles.accent],
};
export type ButtonVariant = keyof typeof variantClass;

type Char =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
const modifierToKeyMap = {
  alt: "Alt",
  ctrl: "Control",
  shift: "Shift",
  meta: "Meta",
} as const;
type ModifierKey = keyof typeof modifierToKeyMap;
type SpecialKey =
  | "enter"
  | "return"
  | "space"
  | "tab"
  | "backspace"
  | "delete"
  | "esc"
  | "escape"
  | "up"
  | "down"
  | "left"
  | "right";

type Keybind = KeybindPart[];
type KeybindPart = Char | Digit | ModifierKey | SpecialKey;

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  keybind?: [Keybind, () => void];
};

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  keybind,
  ...props
}: ButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  useWindowEvent(
    "keydown",
    (e) => {
      if (!keybind) return;
      const [keys, callback] = keybind;
      if (keys.every((k) => e.getModifierState(k) || e.key.toLowerCase() === k)) {
        callback();
      }
    },
    { enabled: !!keybind },
  );
  const classes = variantClass[variant] ?? [];
  return (
    <button
      type="button"
      className={combineClassNames(
        styles.button,
        ...classes,
        size === "sm" ? styles.sm : undefined,
        className,
      )}
      {...props}
    >
      {children}
      {keybind && <KeyIcons keys={keybind[0]} />}
    </button>
  );
}

const keyIconMap: Record<string, [string, string]> = {
  shift: ["⇧", "Shift"],
  ctrl: ["⌃", "Control"],
  alt: ["⌥", "Alt"],
  meta: ["⌘", "Meta"],
  enter: ["⏎", "Enter"],
  return: ["⏎", "Return"],
  space: ["␣", "Space"],
  tab: ["⇥", "Tab"],
  backspace: ["⌫", "Backspace"],
  esc: ["Esc", "Escape"],
  escape: ["Esc", "Escape"],
  up: ["↑", "Up"],
  down: ["↓", "Down"],
  left: ["←", "Left"],
  right: ["→", "Right"],
};

const keyIcons = new Proxy({} as Record<string, string>, {
  get: (_, key: string) => {
    key = key.toLowerCase().trim();
    if (key in keyIconMap) return keyIconMap[key][0] || keyIconMap[key][1];
    if (key.length === 1 && key >= "a" && key <= "z") return key.toUpperCase();
    return null;
  },
});

function KeyIcon({ keyStr }: { keyStr: string }) {
  const icon: string = keyIcons[keyStr] ?? keyStr;
  return <kbd className={styles.keyIcon}>{icon}</kbd>;
}

function KeyIcons({ keys }: { keys: string[] }) {
  return (
    <kbd className={styles.keybind}>
      {keys
        .flatMap((k) => [<KeyIcon keyStr={k} key={k} />, <>+</>])
        .slice(0, -1)}
    </kbd>
  );
}

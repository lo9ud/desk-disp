import {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import "./styles/Onboarding.css";
import styles from "./styles/Onboarding.module.css";
import {
  Cog8ToothIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  CursorArrowRaysIcon,
  ArrowsRightLeftIcon,
  SparklesIcon,
  SwatchIcon,
} from "@heroicons/react/24/solid";
import { Button } from "../primitives/Button";

const STORAGE_KEY = "desk-disp:onboarding";
const MARGIN = 8; // min distance from viewport edge
const ARROW_GAP = 10; // space between target edge and card edge (excluding arrow)
const ARROW_H = 7; // triangle height in px
const ARROW_PAD = 12; // min distance of arrow tip from card horizontal edge

type Step = {
  /**
   * Array of data-onboarding="*" attributes of elements to highlight for this step. If empty, no elements are highlighted and the card is centered on screen (intended for welcome step). If any specified element doesn't exist in the DOM, the step is skipped.
   */
  target: string[];
  /**
   * Title of the onboarding panel for this step
   */
  title: string;
  /**
   * Body text of the onboarding panel for this step
   */
  body: string;
  /**
   * Icon to show in the onboarding panel for this step
   */
  icon: React.ReactNode;
  /**
   * Optional override for the "Next" button label (e.g. "Start tour" on welcome step, "Done" on final step). If not provided, defaults to "Next".
   */
  nextLabel?: string;
};

const STEPS: Step[] = [
  {
    target: [],
    title: "Welcome to desk-disp",
    body: "We saw it's your first time here! Want a quick tour of the controls?",
    icon: <SparklesIcon />,
    nextLabel: "Start tour",
  },
  {
    target: ["controls"],
    title: "Control bar",
    body: "This is your control bar. It stays hidden to keep your display clean — hover the top-left corner anytime to reveal it.",
    icon: <CursorArrowRaysIcon />,
  },
  {
    target: ["exit"],
    title: "Exit application",
    body: "Click here to exit the application.",
    icon: <CursorArrowRaysIcon />,
  },
  {
    target: ["settings"],
    title: "Settings",
    body: "Open the settings panel to configure themes, preferences, and which display to use.",
    icon: <Cog8ToothIcon />,
  },
  {
    target: ["edit"],
    title: "Edit layout",
    body: "Enter edit mode to add, move, and resize widgets on your display.",
    icon: <PencilSquareIcon />,
  },
  {
    target: ["layout"],
    title: "Layouts",
    body: "Quickly switch between saved layouts.",
    icon: <Squares2X2Icon />,
  },
  {
    target: ["theme"],
    title: "Themes",
    body: "Quickly switch between saved themes.",
    icon: <SwatchIcon />,
  },
  {
    target: ["switch"],
    title: "Multiple displays",
    body: "If you have multiple monitors, use this button to switch your display to another monitor.",
    icon: <ArrowsRightLeftIcon />,
  },
];

type CardPos = {
  top: number;
  left: number;
  arrowLeft: number; // relative to card left edge; center of triangle
  above: boolean; // true = card is above target (arrow points down)
  hasTarget: boolean;
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY),
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CardPos | null>(null);

  const isWelcome = STEPS[step]?.target.length === 0;

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "done");
    document
      .querySelectorAll<HTMLElement>("[data-tour-highlight]")
      .forEach((el) => {
        delete el.dataset.tourHighlight;
      });
    delete document.body.dataset.tourActive;
    setVisible(false);
  }, []);

  // Force control bar visible only during actual tour steps (not the welcome screen)
  useEffect(() => {
    if (!visible || isWelcome) return;
    document.body.dataset.tourActive = "";
    return () => {
      delete document.body.dataset.tourActive;
    };
  }, [visible, isWelcome]);

  // Highlight target elements for the current step
  useEffect(() => {
    if (!visible || isWelcome) return;
    const targets = STEPS[step]?.target ?? [];
    const els = targets.flatMap((t) => [
      ...document.querySelectorAll<HTMLElement>(`[data-onboarding="${t}"]`),
    ]);
    els.forEach((el) => {
      el.dataset.tourHighlight = "";
    });
    return () => {
      els.forEach((el) => {
        delete el.dataset.tourHighlight;
      });
    };
  }, [step, visible, isWelcome]);

  // Measurement-based card positioning — runs after every render where step/visible changes
  useLayoutEffect(() => {
    if (!visible || !cardRef.current) return;
    const card = cardRef.current;
    const cardH = card.offsetHeight;
    const cardW = card.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targets = STEPS[step]?.target ?? [];

    // Welcome step: center on screen, no arrow
    if (targets.length === 0) {
      setPos({
        top: Math.round(vh / 2 - cardH / 2),
        left: Math.round(vw / 2 - cardW / 2),
        arrowLeft: cardW / 2,
        above: false,
        hasTarget: false,
      });
      return;
    }

    // Gather all target elements and compute their union bounding rect
    const els = targets.flatMap((t) => [
      ...document.querySelectorAll<HTMLElement>(`[data-onboarding="${t}"]`),
    ]);

    if (els.length === 0) {
      // Target doesn't exist in the DOM (e.g. switch button hidden) — skip step
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
      return;
    }

    let minLeft = Infinity,
      minTop = Infinity,
      maxRight = -Infinity,
      maxBottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      minLeft = Math.min(minLeft, r.left);
      minTop = Math.min(minTop, r.top);
      maxRight = Math.max(maxRight, r.right);
      maxBottom = Math.max(maxBottom, r.bottom);
    }
    const targetCenterX = (minLeft + maxRight) / 2;

    // --- Horizontal ---
    // Ideal: center card on target
    const idealLeft = targetCenterX - cardW / 2;
    // Clamp so card stays within viewport
    const clampedLeft = Math.max(
      MARGIN,
      Math.min(idealLeft, vw - cardW - MARGIN),
    );
    // Arrow tip is at targetCenterX; express as offset from card left
    const rawArrowLeft = targetCenterX - clampedLeft;
    // Clamp arrow so the triangle stays fully inside the card
    const arrowLeft =
      Math.max(ARROW_PAD, Math.min(rawArrowLeft, cardW - ARROW_PAD)) - 9;

    // --- Vertical ---
    // Try below first, fall back to above
    const belowTop = maxBottom + ARROW_GAP + ARROW_H;
    const aboveTop = minTop - ARROW_GAP - ARROW_H - cardH;
    const fitsBelow = belowTop + cardH + MARGIN <= vh;
    const fitsAbove = aboveTop >= MARGIN;

    let top: number;
    let above: boolean;
    if (fitsBelow) {
      top = belowTop;
      above = false;
    } else if (fitsAbove) {
      top = aboveTop;
      above = true;
    } else {
      // Neither fits cleanly — place below, clamped
      top = Math.max(MARGIN, vh - cardH - MARGIN);
      above = false;
    }

    setPos({
      top: Math.round(top),
      left: Math.round(clampedLeft),
      arrowLeft: Math.round(arrowLeft),
      above,
      hasTarget: true,
    });
  }, [step, visible]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    setPos(null); // hide card while re-measuring for next step
    if (isLast) dismiss();
    else setStep((s) => s + 1);
  }

  function prev() {
    setPos(null);
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <>
      <div className={styles.backdrop} onClick={dismiss} />
      <div
        ref={cardRef}
        className={styles.card}
        style={
          pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }
        }
      >
        {pos?.hasTarget && !pos.above && (
          <div className={styles.arrow_up} style={{ left: pos.arrowLeft }} />
        )}
        <div className={styles.icon}>{current.icon}</div>
        <div className={styles.content}>
          <div className={styles.title}>{current.title}</div>
          <div className={styles.body}>{current.body}</div>
        </div>
        <div className={styles.footer}>
          {!isWelcome && (
            <div className={styles.dots}>
            {STEPS.slice(1).map((s, i) => (
              <span
              key={s.title}
              className={i+1 === step ? styles.dot_active : styles.dot}
              />
            ))}
          </div>
          )}
          <div className={styles.actions}>
            {isWelcome && (
              <Button variant="ghost" onClick={dismiss}>
                {isWelcome ? "No thanks" : "Skip"}
              </Button>
            )}
            {step > 0 && (
              <Button
                // disabled={step === 1}
                variant="ghost"
                className={styles.prev}
                onClick={prev}
              >
                Back
              </Button>
            )}
            <Button variant="accent" onClick={next}>
              {current.nextLabel ?? (isLast ? "Done" : "Next")}
            </Button>
          </div>
        </div>
        {pos?.hasTarget && pos.above && (
          <div className={styles.arrow_down} style={{ left: pos.arrowLeft }} />
        )}
      </div>
    </>
  );
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useEditMode } from "../context/EditModeContext";
import type { ChapterStatus } from "../ffi_types";
import { useRuntime } from "../runtime/context";
import { FLAG_NAMES } from "../ui/UiController";
import { useUiController } from "../ui/context";
import { logger } from "../utils/logger";
import { CHAPTERS } from "./chapters";
import { contains, union } from "./geometry";
import { TourCard } from "./TourCard";
import { TourOverlay } from "./TourOverlay";
import type { RequiredUiState, Step, TourCtx } from "./types";
import { useStepTargets } from "./useStepTargets";

const { debug, warn } = logger("tour");

type Phase = "off" | "invite" | "running";

export default function Tour() {
  const runtime = useRuntime();
  const ui = useUiController();
  const { active: editModeActive } = useEditMode();

  const config = useSyncExternalStore(
    runtime.config.subscribe,
    runtime.config.current,
  );

  const [phase, setPhase] = useState<Phase>("off");
  const [monitorCount, setMonitorCount] = useState(1);
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const scratch = useRef<Record<string, string | undefined>>({});
  /** High-water mark, so backtracking before leaving doesn't lower `reached`. */
  const furthest = useRef(0);

  useEffect(() => {
    runtime.window
      .getMonitorCount()
      .then(setMonitorCount)
      .catch(() => setMonitorCount(1));
  }, [runtime]);

  // Read through a ref so ctx keeps a stable identity: it is a dependency of the
  // target-resolution effect, which would otherwise restart on every unrelated
  // config broadcast and re-run its scroll-into-view.
  const configRef = useRef(config);
  configRef.current = config;
  const ctx = useMemo<TourCtx>(
    () => ({
      monitorCount,
      statusOf: (id) => configRef.current?.onboarding[id]?.status ?? "unseen",
      editState: () => ui.surface("editGrid")?.read() ?? null,
      scratch: scratch.current,
    }),
    [monitorCount, ui],
  );

  // First chapter still worth offering, in declaration order.
  const chapter = useMemo(() => {
    if (!config) return null;
    return (
      CHAPTERS.find((c) => {
        const s = config.onboarding[c.id]?.status ?? "unseen";
        if (s === "completed" || s === "declined" || s === "abandoned") {
          return false;
        }
        return c.available?.(ctx) ?? true;
      }) ?? null
    );
  }, [config, ctx]);

  const progress = chapter ? config?.onboarding[chapter.id] : undefined;
  const status = progress?.status;

  // A chapter belongs to one view. In the other it pauses rather than stepping
  // through targets that aren't rendered, and keeps its place for the return.
  const inMode = editModeActive === (chapter?.mode === "edit");
  const live = phase === "running" && inMode;
  const step = phase === "running" ? (steps[index] ?? null) : null;
  const targets = useStepTargets(step, ctx, live);
  // Marks reuse the resolver by standing in as a step of their own; they need
  // the same wait window and continuous measurement, just no cut-out.
  const markStep = useMemo(
    () =>
      step?.marks
        ? { ...step, id: `${step.id}::marks`, targets: step.marks }
        : null,
    [step],
  );
  const marks = useStepTargets(markStep, ctx, live);

  const resolveSteps = useCallback(() => {
    const list = chapter?.steps.filter((s) => s.available?.(ctx) ?? true) ?? [];
    const seen = new Set<string>();
    for (const s of list) {
      // Ids are the resume key, so a duplicate silently returns a user to the
      // wrong step rather than failing anywhere visible.
      if (seen.has(s.id)) {
        warn(`chapter "${chapter?.id}" has duplicate step id "${s.id}"`);
      }
      seen.add(s.id);
    }
    return list;
  }, [chapter, ctx]);

  const persist = useCallback(
    (next: ChapterStatus, reached: string | null) => {
      if (!chapter) return;
      runtime.config
        .setOnboarding(chapter.id, { status: next, reached })
        .catch((e) => warn("failed to record onboarding progress", e));
    },
    [runtime, chapter],
  );

  /** Written only at chapter boundaries: a `config::changed` broadcast per step
   *  would also clear the control bar's unsaved-theme marker as the tour ran. */
  const leave = useCallback(
    (next: ChapterStatus) => {
      const list = steps;
      const reached = list[furthest.current]?.id ?? null;
      persist(next, next === "declined" ? null : reached);
      setPhase("off");
    },
    [steps, persist],
  );

  const start = useCallback(() => {
    // Existence is settled once, from predicates only. Element presence is a
    // separate per-step concern, so Next/Back stay plain index arithmetic.
    const list = resolveSteps();
    setSteps(list);
    setIndex(0);
    furthest.current = 0;
    setPhase("running");
    persist("in_progress", list[0]?.id ?? null);
  }, [resolveSteps, persist]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) {
      leave("completed");
      return;
    }
    const to = index + 1;
    furthest.current = Math.max(furthest.current, to);
    setIndex(to);
  }, [index, steps.length, leave]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Reacts to status *transitions* only. Config broadcasts on every theme and
  // layout change too, and re-deriving phase from each one would reset a
  // running chapter to its resume point.
  const lastChapter = useRef<string | null>(null);
  const lastStatus = useRef<ChapterStatus | null>(null);
  useEffect(() => {
    if (!config || !chapter) return;
    const current = status ?? "unseen";
    // A different chapter has no history here, so it reads as a fresh load.
    const previous =
      lastChapter.current === chapter.id ? lastStatus.current : null;
    if (previous === current) return;
    lastChapter.current = chapter.id;
    lastStatus.current = current;

    if (current === "unseen") {
      if (!chapter.invite) {
        start();
        return;
      }
      setSteps(resolveSteps());
      setPhase("invite");
    } else if (current === "in_progress") {
      // Only a fresh load resumes. Reaching in_progress from any other status is
      // this tour's own start() echoing back through the config broadcast, and
      // must leave the running chapter alone.
      if (previous !== null) return;
      const list = resolveSteps();
      const at = progress?.reached
        ? list.findIndex((s) => s.id === progress.reached)
        : 0;
      setSteps(list);
      // An id that no longer exists means the chapter was rewritten under a
      // saved resume point; starting over beats landing somewhere arbitrary.
      setIndex(Math.max(at, 0));
      furthest.current = Math.max(at, 0);
      setPhase("running");
    } else {
      setPhase("off");
    }
  }, [config, chapter, status, progress?.reached, resolveSteps, start]);

  // Chapter lifetime: one teardown path for done, dismiss, Esc and unmount, so
  // no exit route can leave an override behind.
  // Keyed on the chapter, not on `live`: enter/exit must bracket the whole
  // chapter, including the stretch where it is paused in the other view.
  useEffect(() => {
    if (phase !== "running" || !chapter) return;
    const snapshot = ui.snapshotOverrides();
    ui.setIntrinsic("tourActive", true);
    chapter.enter?.(ui);
    return () => {
      chapter.exit?.(ui);
      ui.restoreOverrides(snapshot);
      ui.setIntrinsic("tourActive", false);
    };
  }, [phase, ui, chapter]);

  const applyRequires = useCallback(
    (mode: "enter" | "reassert") => {
      if (phase !== "running") return;
      const own =
        typeof step?.requires === "function" ? step.requires(ctx) : step?.requires;
      // Cleared rather than left in place while paused, so an override can't
      // leak into the view the chapter doesn't belong to.
      const required: RequiredUiState = live
        ? { ...chapter?.requires, ...own }
        : {};
      for (const name of FLAG_NAMES) {
        ui.setOverride(name, required[name] ?? null);
      }
      if (!live) return;
      const grid = ui.surface("editGrid");
      if (!grid) return;
      // On entry a step's declaration is total, which is what makes Back
      // reconstruct state rather than inherit it. A re-assert only defends what
      // the step positively asked for, so a step that doesn't care about
      // selection doesn't fight the user for it mid-drag.
      const wants = required.selected != null || required.settingsOpen != null;
      if (mode === "enter" || wants) {
        grid.setSelection({
          selected: required.selected ?? null,
          settingsOpen: required.settingsOpen ?? null,
        });
      }
      if (mode === "enter") grid.setAddOpen(required.addOpen ?? false);
    },
    [phase, live, step, chapter, ctx, ui],
  );

  useEffect(() => {
    applyRequires("enter");
  }, [applyRequires]);

  // An incidental click can deselect the widget whose handles the step is
  // pointing at, so a positive requirement is put back. The rail is left alone:
  // closing it is the expected outcome of picking a card, and reopening it would
  // race the advance. Setting an unchanged value bails out of a re-render.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => applyRequires("reassert"), 250);
    return () => clearInterval(t);
  }, [live, applyRequires]);

  useEffect(() => {
    if (!live || targets.status !== "unresolved") return;
    warn(`step "${step?.id}" has no reachable target; skipping`);
    next();
  }, [live, targets.status, step, next]);

  // Only while something is actually blocking the app. A toast invite sits
  // alongside normal use, so swallowing Enter and Escape there would be theft.
  const capturesKeys =
    live || (phase === "invite" && chapter?.invite?.mode === "modal");
  useEffect(() => {
    if (!capturesKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        leave(phase === "invite" ? "declined" : "abandoned");
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (phase === "invite") start();
        else if (live && !step?.action) next();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturesKeys, phase, live, step, start, next, leave]);

  // The cut-out removes the hole from hit-testing, so without this the target is
  // fully live. Activation is blocked rather than the whole pointer surface, so
  // :hover still lights the control up the way it normally would.
  const interactive = step ? (step.interactive ?? !!step.action) : false;
  const markBoxes = marks.boxes;
  useEffect(() => {
    const guardTargets = !interactive && targets.els.length > 0;
    if (!live || (!guardTargets && markBoxes.length === 0)) return;
    const block = (e: Event) => {
      const inTarget = targets.els.some((el) => el.contains(e.target as Node));
      // An interactive target wins: on the move step the mark sits under the
      // widget once it is dragged there, and blocking would stop the drag.
      if (inTarget && interactive) return;
      const { clientX, clientY } = e as MouseEvent;
      // Marks are tested by geometry, not containment - the anchor is
      // pointer-transparent, so the event target is whatever lies beneath it.
      const hit =
        (inTarget && guardTargets) ||
        markBoxes.some((b) => contains(b, clientX, clientY));
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      // Once per interaction, not once per event in the sequence.
      if (e.type === "click") setShakeKey((k) => k + 1);
    };
    const types = ["pointerdown", "mousedown", "click"];
    types.forEach((t) => document.addEventListener(t, block, true));
    return () =>
      types.forEach((t) => document.removeEventListener(t, block, true));
  }, [live, interactive, targets.els, markBoxes]);

  // The hole is clipped away, so the click already reached the real element.
  // Observing it must not prevent or stop anything.
  useEffect(() => {
    if (!live || step?.action?.advanceOn !== "click") return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (targets.els.some((el) => el.contains(target))) next();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [live, step, targets.els, next]);

  useEffect(() => {
    const advanceOn = step?.action?.advanceOn;
    if (!live || typeof advanceOn !== "function") return;
    let raf = 0;
    const tick = () => {
      if (advanceOn(ctx)) {
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, step, ctx, next]);

  // A layout switch clears and repopulates the instance registry, so every
  // widget target dies underneath the chapter.
  useEffect(() => {
    if (!live) return;
    return runtime.events.on("layout::changed", () => {
      debug("layout changed mid-chapter, aborting");
      leave("in_progress");
    });
  }, [live, runtime, leave]);

  if (!chapter || phase === "off") return null;

  // Offered wherever the user currently is: accepting is what moves the app into
  // the mode the chapter's steps need.
  if (phase === "invite") {
    const invite = chapter.invite;
    if (!invite) return null;
    const toast = invite.mode === "toast";
    return (
      <>
        {!toast && (
          <TourOverlay
            boxes={[]}
            shakeKey={shakeKey}
            onScrimClick={() => setShakeKey((k) => k + 1)}
          />
        )}
        <TourCard
          shakeKey={shakeKey}
          corner={toast}
          anchor={null}
          icon={invite.icon}
          title={invite.title}
          body={invite.body}
          onNext={start}
          nextLabel={invite.confirmLabel ?? "Start"}
          onSkip={() => leave("declined")}
          skipLabel="No thanks"
        />
      </>
    );
  }

  if (!inMode || !step) return null;
  const ready = targets.status === "resolved" || targets.status === "none";

  return (
    <>
      <TourOverlay
        boxes={targets.boxes}
        marks={marks.boxes}
        render={step.render}
        shakeKey={shakeKey}
        onScrimClick={() => setShakeKey((k) => k + 1)}
      />
      {ready && (
        <TourCard
          shakeKey={shakeKey}
          anchor={union(targets.boxes)}
          icon={step.icon}
          title={step.title}
          body={step.body}
          hint={step.hint}
          instruction={
            step.action
              ? (step.action.instruction ??
                "Click the highlighted control to continue.")
              : undefined
          }
          dots={{ index, count: steps.length }}
          onNext={next}
          nextLabel={
            step.nextLabel ?? (index === steps.length - 1 ? "Done" : "Next")
          }
          onBack={index > 0 ? back : undefined}
          onSkip={step.action ? next : undefined}
          skipLabel="Skip step"
          onClose={() => leave("abandoned")}
          prefer={step.prefer}
        />
      )}
    </>
  );
}

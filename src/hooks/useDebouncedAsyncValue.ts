import { useEffect, useRef, useState } from "react";
import type { LocalValues } from "../registry/defRegistry";
import { useDebouncedCallback } from "./useDebouncedCallback";

// Tuned once, here, for every deps-driven resolution in
// WidgetSettingsPanel.tsx (group.verify, marker/indicator.compute, dynamic
// select.options, dynamic string.suggestions) -- not a parameter, since none
// of today's call sites need a different cadence and a shared constant
// means they'd all visibly move together if that ever changes.
const DEBOUNCE_DELAY_MS = 250;

/**
 * Runs `compute` against the current settings snapshot, re-running only when
 * one of the named `deps` keys' VALUES changes (not on every render) --
 * debounced against rapid changes (e.g. dragging a deps-linked range
 * slider), and race-safe against out-of-order resolution (a slow call that
 * resolves after a faster, later one started is discarded, not applied).
 *
 * Pure trailing debounce, deliberately no `maxWait` -- while a deps value is
 * still actively changing (e.g. a range slider still being dragged), this
 * must NOT fire yet; recomputing mid-drag would mean showing (and then
 * immediately invalidating) results for values the user never actually
 * settled on. It only fires once things go quiet for `DEBOUNCE_DELAY_MS`.
 *
 * `deps === undefined` means mount-once only (the phase 2 behavior this
 * hook now backs directly) -- deliberately NOT "depends on everything." An
 * implicit depends-on-everything default would silently reintroduce the
 * unthrottled-recompute problem `deps` exists to prevent, for every
 * group/marker/indicator/select/string that hasn't been given explicit deps.
 * Mount-once resolution fires immediately (no debounce delay) since it only
 * ever runs the one time anyway; deps-driven recomputation goes through the
 * debounced path, since that's the one that can otherwise fire in a tight
 * loop.
 */
export function useDebouncedAsyncValue<T>(
  compute: (local: LocalValues) => T | Promise<T>,
  allValues: LocalValues,
  initial: T,
  deps: string[] | undefined,
): T {
  const [resolved, setResolved] = useState<T>(initial);
  const generationRef = useRef(0);

  const resolve = () => {
    const generation = ++generationRef.current;
    Promise.resolve(compute(allValues)).then((val) => {
      // A newer call may have started (and even resolved) while this one
      // was in flight -- only apply this result if it's still the most
      // recent attempt. Promises don't resolve in call order, so this is
      // the only reliable guard, not just a nice-to-have.
      if (generationRef.current === generation) setResolved(val);
    });
  };
  const debouncedResolve = useDebouncedCallback(resolve, DEBOUNCE_DELAY_MS);

  // Only the values actually named in `deps` matter -- everything else in
  // allValues is deliberately ignored, per the module comment above. `deps`
  // itself comes from a widget's own settingsDef, a compile-time-authored
  // constant for a given setting, so its length is stable across renders --
  // safe to spread into a hook dependency array despite being built
  // dynamically from a runtime array rather than written out by hand.
  const depValues = deps?.map((key) => allValues[key]) ?? [];

  useEffect(() => {
    if (deps) {
      debouncedResolve();
    } else {
      resolve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps-driven by
    // design: recompute exactly when the named `deps` values change (or
    // once, on mount, if `deps` is omitted). allValues/compute/resolve/
    // debouncedResolve excluded on purpose, see the module comment above.
  }, deps ? depValues : []);

  return resolved;
}

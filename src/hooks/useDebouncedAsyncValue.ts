import { useEffect, useRef, useState } from "react";
import type { LocalValues } from "../registry/defRegistry";
import { useDebouncedCallback } from "./useDebouncedCallback";

// Delay before recomputing dynamic, computed or derived settings after a change to one of their dependencies.
const DEBOUNCE_DELAY_MS = 250;

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
      // recent attempt.
      if (generationRef.current === generation) setResolved(val);
    });
  };
  const debouncedResolve = useDebouncedCallback(resolve, DEBOUNCE_DELAY_MS);

  // Filter out the named dependencies from allValues, so we can pass them to useEffect below.
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

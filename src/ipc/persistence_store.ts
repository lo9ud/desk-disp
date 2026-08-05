type Listener = () => void;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<void>>();

function notify(cacheKey: string) {
  listeners.get(cacheKey)?.forEach((cb) => cb());
}

export function readCache<T>(cacheKey: string): T | undefined {
  return cache.get(cacheKey) as T | undefined;
}

export function writeCache<T>(cacheKey: string, value: T) {
  cache.set(cacheKey, value);
  notify(cacheKey);
}

function ensureLoaded(cacheKey: string, fetch: () => Promise<unknown>) {
  if (cache.has(cacheKey) || inflight.has(cacheKey)) return;
  const p = fetch()
    .then((value) => writeCache(cacheKey, value))
    .catch((err) => console.error(`persistence: failed to load ${cacheKey}`, err))
    .finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, p);
}

// Returns the `subscribe` fn useSyncExternalStore wants. Fetch only fires once,
// the first time anything subscribes to a given key - triggered from the
// subscribe callback (effect timing), not during render.
export function subscribeTo(cacheKey: string, fetch: () => Promise<unknown>) {
  return (onChange: Listener) => {
    let set = listeners.get(cacheKey);
    if (!set) {
        set = new Set();
        listeners.set(cacheKey, set);
    }
    set.add(onChange);
    ensureLoaded(cacheKey, fetch);
    return () => set!.delete(onChange);
  };
}

// Optimistic write: update the cache (and every subscriber) immediately,
// persist in the background, and correct the cache if the write fails.
// Deliberately simpler than React's useOptimistic/useTransition - accepted
// tradeoff is a write can rarely "undo itself" a moment after a failure, which
// is fine given writes are rare, explicit-commit actions, not keystroke-driven.
export async function writeOptimistic<T>(
  cacheKey: string,
  optimisticValue: T,
  persist: () => Promise<void>,
  refetch: () => Promise<T>,
) {
  writeCache(cacheKey, optimisticValue);
  try {
    await persist();
  } catch (err) {
    console.error(`persistence: write to ${cacheKey} failed, reverting`, err);
    writeCache(cacheKey, await refetch());
  }
}
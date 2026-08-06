import { use } from "react";
import { logger } from "../utils/logger";

const log = logger("persistence_store");

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Listener = () => void;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

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

export function subscribeTo(cacheKey: string) {
  return (onChange: Listener) => {
    let set = listeners.get(cacheKey);
    if (!set) {
      set = new Set();
      listeners.set(cacheKey, set);
    }
    set.add(onChange);
    return () => set!.delete(onChange);
  };
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await fn();
      log.trace(`withRetry: succeeded on attempt ${attempt + 1}/${RETRY_ATTEMPTS}`);
      return result;
    } catch (err) {
      lastError = err;
      log.debug(`withRetry: attempt ${attempt + 1}/${RETRY_ATTEMPTS} failed`, describeError(err));
      if (attempt < RETRY_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  log.debug(`withRetry: all ${RETRY_ATTEMPTS} attempts failed, rethrowing`, describeError(lastError));
  throw lastError;
}

interface SuspenseEntry {
  promise: Promise<unknown>;
  failed: boolean;
}
const suspenseEntries = new Map<string, SuspenseEntry>();

export function useSuspenseGate<T>(cacheKey: string, load: () => Promise<T>): T {
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T;

  const existing = suspenseEntries.get(cacheKey);
  if (existing) {
    log.trace(`useSuspenseGate: reusing existing entry for "${cacheKey}"`, `failed=${existing.failed}`);
    return use(existing.promise) as T;
  }

  log.debug(`useSuspenseGate: no existing entry, starting load()`, cacheKey);
  const entry: SuspenseEntry = { promise: undefined as unknown as Promise<unknown>, failed: false };
  entry.promise = load()
    .then((value) => {
      log.debug(`useSuspenseGate: load() resolved`, cacheKey);
      writeCache(cacheKey, value);
      suspenseEntries.delete(cacheKey);
      return value;
    })
    .catch((err) => {
      entry.failed = true;
      log.debug(`useSuspenseGate: load() rejected, entry stays failed until a reset`, cacheKey);
      console.error(`persistence: failed to load "${cacheKey}"`, err);
      throw err;
    });
  suspenseEntries.set(cacheKey, entry);
  return use(entry.promise) as T;
}

const errors = new Map<string, unknown>();

export function recordError(cacheKey: string, err: unknown) {
  errors.set(cacheKey, err);
  notify(cacheKey);
}

export function clearError(cacheKey: string) {
  errors.delete(cacheKey);
}

export function peekError(cacheKey: string): unknown {
  return errors.get(cacheKey);
}

export function retryAfterReset(): void {
  for (const [key, entry] of suspenseEntries) {
    if (entry.failed) suspenseEntries.delete(key);
  }
  errors.clear();
}

export async function writeOptimistic<T>(
  cacheKey: string,
  optimisticValue: T,
  persist: () => Promise<void>,
  refetch: () => Promise<T | null>,
) {
  writeCache(cacheKey, optimisticValue);
  try {
    await withRetry(persist);
    clearError(cacheKey); // this succeeded - forget any earlier stale failure for this key
  } catch (err) {
    console.error(`persistence: write to ${cacheKey} failed, reverting`, err);
    try {
      const truth = await withRetry(refetch);
      if (truth !== null) writeCache(cacheKey, truth);
    } catch (refetchErr) {
      console.error(`persistence: revert-refetch for ${cacheKey} also failed`, refetchErr);
    } finally {
      recordError(cacheKey, err);
    }
  }
}

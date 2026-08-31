import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  emit as tauriEmit,
  emitTo as tauriEmitTo,
  listen as tauriListen,
  once as tauriOnce,
} from "@tauri-apps/api/event";

export interface Transport {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  once<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  emit(event: string, payload?: unknown): Promise<void>;
  emitTo(target: string, event: string, payload?: unknown): Promise<void>;
}

export function tauriTransport(): Transport {
  return {
    invoke: (cmd, args) => tauriInvoke(cmd, args),
    listen: (event, handler) => tauriListen(event, (e) => handler(e.payload as never)),
    once: (event, handler) => tauriOnce(event, (e) => handler(e.payload as never)),
    emit: (event, payload) => tauriEmit(event, payload),
    emitTo: (target, event, payload) => tauriEmitTo(target, event, payload),
  };
}

export type CommandHandler = (
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

export function memoryTransport(
  handlers: Record<string, CommandHandler> = {},
): Transport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const subscribe = (event: string, handler: (payload: never) => void) => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    const fn = handler as (payload: unknown) => void;
    set.add(fn);
    return Promise.resolve(() => {
      set.delete(fn);
    });
  };

  const dispatch = (event: string, payload: unknown) => {
    listeners.get(event)?.forEach((fn) => fn(payload));
    return Promise.resolve();
  };

  return {
    invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
      const handler = handlers[cmd];
      if (!handler) {
        throw new Error(`memoryTransport: no handler for command "${cmd}"`);
      }
      return (await handler(args ?? {})) as T;
    },
    listen: (event, handler) => subscribe(event, handler as never),
    once: (event, handler) =>
      subscribe(event, ((payload: never) => {
        handler(payload);
        listeners.get(event)?.clear();
      }) as never),
    emit: (event, payload) => dispatch(event, payload),
    // Single-realm bus: there are no window labels to route between, so a
    // targeted emit is an ordinary emit. Kept for interface parity.
    emitTo: (_target, event, payload) => dispatch(event, payload),
  };
}

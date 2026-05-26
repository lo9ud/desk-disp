import { useSyncExternalStore } from "react";
import { WidgetPlacement } from "../ffi_types";
import { logger } from "../utils/logger";
import type { WidgetError } from "../utils/widgetErrors";

const { warn } = logger("instance-registry");

export interface WidgetInstance {
  id: string;
  definitionId: string;
  placement: WidgetPlacement;
  settings: Record<string, any>;
  errors: WidgetError[];
}

export function hexRandom(length: number): string {
  const chars = () =>
    (Math.random() * 72057594037927940 + Date.now()).toString(16);
  let result = "";
  while (result.length < length) {
    result += chars();
  }
  return result.slice(0, length);
}

export function genWidgetId(_type: string): string {
  return hexRandom(16);
}

export class InstanceRegistry {
  private readonly instances = new Map<string, WidgetInstance>();
  private snapshot: readonly string[] = [];
  private readonly listListeners = new Set<() => void>();
  private readonly instanceListeners = new Map<string, Set<() => void>>();

  private rebuildSnapshot() {
    this.snapshot = [...this.instances.keys()];
  }

  private notifyList() {
    this.listListeners.forEach((l) => l());
  }

  private notifyInstance(id: string) {
    this.instanceListeners.get(id)?.forEach((l) => l());
  }

  // --- Mutations ---

  add(
    id: string,
    definitionId: string,
    placement: WidgetPlacement,
    settings: Record<string, any> = {},
  ): WidgetInstance {
    const instance: WidgetInstance = {
      id,
      definitionId,
      placement,
      settings,
      errors: [],
    };
    this.instances.set(id, instance);
    this.rebuildSnapshot();
    this.notifyList();
    this.notifyInstance(id);
    return instance;
  }

  remove(id: string): boolean {
    if (!this.instances.has(id)) {
      warn(`Attempted to remove non-existent widget instance: ${id}`);
      return false;
    }
    this.instances.delete(id);
    this.rebuildSnapshot();
    this.notifyList();
    this.notifyInstance(id);
    return true;
  }

  updatePlacement(id: string, placement: WidgetPlacement): void {
    const inst = this.instances.get(id);
    if (!inst) {
      warn(`Attempted to update placement of non-existent widget instance: ${id}`);
      return;
    }
    this.instances.set(id, { ...inst, placement });
    this.notifyInstance(id);
  }

  updateSettings(id: string, settings: Record<string, any>): void {
    const inst = this.instances.get(id);
    if (!inst) {
      warn(`Attempted to update settings of non-existent widget instance: ${id}`);
      return;
    }
    this.instances.set(id, { ...inst, settings: { ...inst.settings, ...settings } });
    this.notifyInstance(id);
  }

  shiftPlacements(colOffset: number, rowOffset: number): void {
    for (const [id, inst] of this.instances) {
      const updated: WidgetInstance = {
        ...inst,
        placement: {
          ...inst.placement,
          col: inst.placement.col + colOffset,
          row: inst.placement.row + rowOffset,
        },
      };
      this.instances.set(id, updated);
      this.notifyInstance(id);
    }
  }

  clear(): void {
    const ids = [...this.instances.keys()];
    this.instances.clear();
    this.rebuildSnapshot();
    this.notifyList();
    ids.forEach((id) => this.notifyInstance(id));
  }

  // --- Clone / replace ---

  clone(): InstanceRegistry {
    const copy = new InstanceRegistry();
    for (const [id, inst] of this.instances) {
      copy.instances.set(id, { ...inst });
    }
    copy.rebuildSnapshot();
    return copy;
  }

  replaceWith(other: InstanceRegistry): void {
    const oldIds = new Set(this.instances.keys());
    const newIds = new Set(other.instances.keys());

    this.instances.clear();
    for (const [id, inst] of other.instances) {
      this.instances.set(id, { ...inst });
    }
    this.rebuildSnapshot();
    this.notifyList();

    // Notify all affected instance listeners
    const affected = new Set([...oldIds, ...newIds]);
    affected.forEach((id) => this.notifyInstance(id));
  }

  // --- Reads ---

  get(id: string): WidgetInstance | undefined {
    return this.instances.get(id);
  }

  getAll(): WidgetInstance[] {
    return [...this.instances.values()];
  }

  // --- useSyncExternalStore interface ---

  subscribe = (cb: () => void): (() => void) => {
    this.listListeners.add(cb);
    return () => this.listListeners.delete(cb);
  };

  subscribeToInstance = (id: string, cb: () => void): (() => void) => {
    if (!this.instanceListeners.has(id)) {
      this.instanceListeners.set(id, new Set());
    }
    this.instanceListeners.get(id)!.add(cb);
    return () => this.instanceListeners.get(id)?.delete(cb);
  };

  getSnapshot = (): readonly string[] => {
    return this.snapshot;
  };

  getInstanceSnapshot = (id: string): WidgetInstance | undefined => {
    return this.instances.get(id);
  };
}

export const canonicalRegistry = new InstanceRegistry();

// --- Hooks ---

export function useWidgetInstanceIds(
  registry: InstanceRegistry = canonicalRegistry,
): readonly string[] {
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot);
}

/** Always uses the canonical registry — for the main overlay window. */
export function useVisibleWidgetInstanceIds(): readonly string[] {
  return useSyncExternalStore(
    canonicalRegistry.subscribe,
    canonicalRegistry.getSnapshot,
  );
}

export function useWidgetInstance(
  id: string,
  registry: InstanceRegistry = canonicalRegistry,
): WidgetInstance | undefined {
  return useSyncExternalStore(
    (cb) => registry.subscribeToInstance(id, cb),
    () => registry.getInstanceSnapshot(id),
  );
}


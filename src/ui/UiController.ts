import type { WidgetPlacement } from "../ffi_types";
import type { InstanceRegistry } from "../registry/instanceRegistry";
import { logger } from "../utils/logger";

const { warn } = logger("ui-controller");

/**
 * App-level UI state that something other than the owning component may need to
 * drive. Each flag resolves as `override ?? intrinsic`: the owning component
 * writes `intrinsic` from its own inputs (hover, focus), while a host holding the
 * controller writes `override` to force a value in either direction. Intrinsic
 * stays live underneath, so releasing an override lands on the current value
 * rather than waiting for the owner's next input.
 */
export interface FlagRegistry {
  /** Control bar visibility; owned by WindowControls. */
  chromeRevealed: boolean;
  /** A tour chapter is running; owned by Tour. Makes the tour the outermost
   *  rung of the key ladder, so Esc reaches it before edit mode. */
  tourActive: boolean;
  /** Suppresses the edit session's save affordance. A tour drives a throwaway
   *  draft, and saving it would overwrite the real layout. */
  editSaveSuppressed: boolean;
}

export type FlagName = keyof FlagRegistry;

const FLAG_DEFAULTS: Record<FlagName, boolean> = {
  chromeRevealed: false,
  tourActive: false,
  editSaveSuppressed: false,
};

export const FLAG_NAMES = Object.keys(FLAG_DEFAULTS) as FlagName[];

/**
 * Imperative handles registered by components whose state is too entangled to
 * lift. The controller forwards calls and never mirrors the state. Add a member
 * here when a component gains a handle.
 */
export interface EditGridState {
  selected: string | null;
  settingsOpen: string | null;
  addOpen: boolean;
  /** Ids on the draft grid, in registry order. */
  widgetIds: readonly string[];
  grid: { cols: number; rows: number };
  placementOf(id: string): WidgetPlacement | undefined;
}

export interface SurfaceRegistry {
  editMode: {
    /** Without a draft this is an ordinary edit session on the live layout. */
    enter(opts?: { draft?: InstanceRegistry }): void;
    cancel(): void;
  };
  /** Registered by EditGrid, so absent unless edit mode is mounted. */
  editGrid: {
    read(): EditGridState;
    /** One call rather than two setters: selection and the settings panel are
     *  coupled (the panel closes if selection moves off it), so applying them
     *  separately would leave an inconsistent frame in between. */
    setSelection(next: {
      selected: string | null;
      settingsOpen: string | null;
    }): void;
    setAddOpen(open: boolean): void;
  };
}

export type SurfaceName = keyof SurfaceRegistry;

interface FlagState {
  intrinsic: boolean;
  override: boolean | null;
}

/** The `override` half of every flag, restored wholesale on teardown. */
export type OverrideSnapshot = ReadonlyMap<FlagName, boolean | null>;

export class UiController {
  private readonly flags = new Map<FlagName, FlagState>();
  private readonly listeners = new Map<FlagName, Set<() => void>>();
  private readonly owners = new Map<FlagName, symbol>();
  private readonly surfaces = new Map<SurfaceName, unknown>();

  private state(name: FlagName): FlagState {
    let s = this.flags.get(name);
    if (!s) {
      s = { intrinsic: FLAG_DEFAULTS[name], override: null };
      this.flags.set(name, s);
    }
    return s;
  }

  private notify(name: FlagName) {
    this.listeners.get(name)?.forEach((l) => l());
  }

  // --- Flags ---

  resolved(name: FlagName): boolean {
    const s = this.state(name);
    return s.override ?? s.intrinsic;
  }

  /** Readable by owners that must tell "hidden" from "held hidden". */
  overrideOf(name: FlagName): boolean | null {
    return this.state(name).override;
  }

  setIntrinsic(name: FlagName, value: boolean): void {
    const s = this.state(name);
    if (s.intrinsic === value) return;
    const before = this.resolved(name);
    s.intrinsic = value;
    if (this.resolved(name) !== before) this.notify(name);
  }

  /** Force a value regardless of the owner's input; null returns control. */
  setOverride(name: FlagName, value: boolean | null): void {
    const s = this.state(name);
    if (s.override === value) return;
    s.override = value;
    // Always notifies: the override is observable in its own right, so taking
    // or releasing one matters even when the resolved value doesn't move.
    this.notify(name);
  }

  snapshotOverrides(): OverrideSnapshot {
    const snap = new Map<FlagName, boolean | null>();
    for (const [name, s] of this.flags) snap.set(name, s.override);
    return snap;
  }

  restoreOverrides(snap: OverrideSnapshot): void {
    for (const name of this.flags.keys()) {
      this.setOverride(name, snap.get(name) ?? null);
    }
  }

  subscribeFlag = (name: FlagName, cb: () => void): (() => void) => {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  };

  /**
   * Claims the right to write a flag's intrinsic. Two concurrent owners means
   * one's unmount clears the other's live value, so the second claim warns.
   */
  claimFlag(name: FlagName, token: symbol): () => void {
    const held = this.owners.get(name);
    if (held && held !== token) {
      warn(`Flag "${name}" already has an owner; intrinsic writes will conflict`);
    }
    this.owners.set(name, token);
    return () => {
      if (this.owners.get(name) === token) this.owners.delete(name);
    };
  }

  // --- Surfaces ---

  registerSurface<K extends SurfaceName>(
    name: K,
    handle: SurfaceRegistry[K],
  ): () => void {
    this.surfaces.set(name, handle);
    return () => this.unregisterSurface(name, handle);
  }

  /**
   * Identity-checked: a StrictMode remount registers the new handle before the
   * old cleanup runs, and an unchecked delete would drop the live one.
   */
  unregisterSurface<K extends SurfaceName>(
    name: K,
    handle: SurfaceRegistry[K],
  ): void {
    if (this.surfaces.get(name) === handle) this.surfaces.delete(name);
  }

  surface<K extends SurfaceName>(name: K): SurfaceRegistry[K] | undefined {
    return this.surfaces.get(name) as SurfaceRegistry[K] | undefined;
  }
}

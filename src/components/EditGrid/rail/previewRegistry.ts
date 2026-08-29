import { WidgetPlacement } from "../../../ffi_types";
import { getWidgetDefinition } from "../../../registry/defRegistry";
import {
  InstanceRegistry,
  useWidgetInstance,
  WidgetInstance,
} from "../../../registry/instanceRegistry";
import { presetSettingsForWidget } from "../../../registry/settingsDefaults";

/** How long each gallery preset stays on screen before the rail advances. */
export const PRESET_INTERVAL_MS = 5000;

/**
 * How long auto-advance stays off after a manual step. Deliberately far longer
 * than PRESET_INTERVAL_MS: stepping by hand is how a user pauses the carousel
 * to study one preset before placing it, so it has to outlast a glance.
 */
export const PRESET_PAUSE_MS = 30000;

export interface PreviewWidgetInstance extends WidgetInstance {
  /**
   * Which preset the preview is showing. **0 is the widget's own defaults**,
   * always present, so every card has something to step through; the
   * definition's declared `presetsSettings` start at 1.
   */
  presetIndex: number;
  /** 1 (defaults only) + however many presets the definition declares. */
  presetCount: number;
  /**
   * The instance's default settings, kept aside so each preset is layered over
   * a clean base rather than over whatever the previous preset left behind.
   * This is what lets a preset be written partially.
   */
  baseSettings: Record<string, any>;
}

/**
 * Gallery-only registry that also tracks which of a widget's presets each
 * preview is currently showing, so the add rail can cycle them on a timer, let
 * the user step through them by hand, and hand the one on screen to the grid
 * when the card is placed.
 */
export class PreviewInstanceRegistry extends InstanceRegistry {
  // NOTE: deliberately no `instances` field of its own. Re-declaring it to
  // narrow the value type would run a fresh `new Map()` initializer *after*
  // super(), silently replacing the base's map -- and base methods would then
  // be writing into a map the subclass never meant to hand them. Reads narrow
  // through `preview()` below instead.

  /**
   * Per-instance timestamp before which the timer leaves that preview alone.
   * Kept out of the instance objects on purpose: a pause is not something any
   * subscriber renders, and storing it there would churn instance identity (and
   * so re-render the card) on every expiry sweep.
   */
  private readonly resumeAt = new Map<string, number>();

  private readonly pauseMs: number;
  private readonly now: () => number;

  constructor(opts: { pauseMs?: number; now?: () => number } = {}) {
    super();
    this.pauseMs = opts.pauseMs ?? PRESET_PAUSE_MS;
    this.now = opts.now ?? Date.now;
  }

  protected buildInstance(
    id: string,
    definitionId: string,
    placement: WidgetPlacement,
    settings: Record<string, any>,
  ): PreviewWidgetInstance {
    const declared =
      getWidgetDefinition(definitionId)?.presetsSettings?.length ?? 0;
    return {
      id,
      definitionId,
      placement,
      settings,
      errors: [],
      presetIndex: 0,
      presetCount: declared + 1,
      baseSettings: settings,
    };
  }

  private preview(id: string): PreviewWidgetInstance | undefined {
    return this.instances.get(id) as PreviewWidgetInstance | undefined;
  }

  private settingsForPreset(
    inst: PreviewWidgetInstance,
    index: number,
  ): Record<string, any> {
    // Index 0 is the defaults, so the definition's own declared list is offset
    // by one -- presetSettingsForWidget indexes that list, not this one.
    if (index === 0) return { ...inst.baseSettings };
    return {
      ...inst.baseSettings,
      ...presetSettingsForWidget(inst.definitionId, index - 1),
    };
  }

  private applyPreset(inst: PreviewWidgetInstance, index: number): void {
    if (inst.presetCount <= 1) return;

    // Modulo, but correct for negatives too -- stepping back from 0 should wrap
    // to the last preset, and JS's `%` would hand back a negative index.
    const presetIndex =
      ((index % inst.presetCount) + inst.presetCount) % inst.presetCount;
    if (presetIndex === inst.presetIndex) return;

    // Replace the instance object rather than mutating it in place. This is the
    // whole contract of the registry: useWidgetInstance feeds
    // getInstanceSnapshot -- which returns the stored object itself -- straight
    // to useSyncExternalStore, and React bails out of the render when the new
    // snapshot is reference-equal to the old one. An in-place
    // `inst.settings = ...` updates the store and renders nothing at all.
    const next: PreviewWidgetInstance = {
      ...inst,
      presetIndex,
      settings: this.settingsForPreset(inst, presetIndex),
    };
    this.instances.set(inst.id, next);
    this.notifyInstance(inst.id);
  }

  // --- Reads ---

  getPresetIndex(id: string): number | undefined {
    return this.preview(id)?.presetIndex;
  }

  getPresetCount(id: string): number {
    return this.preview(id)?.presetCount ?? 0;
  }

  /**
   * The settings the preview is showing right now -- what a widget placed from
   * this card should start out with, rather than the bare defaults.
   */
  currentSettings(id: string): Record<string, any> | undefined {
    const inst = this.preview(id);
    return inst && { ...inst.settings };
  }

  // --- Stepping ---
  //
  // Split by who is driving, not by what they do: the two user-facing entry
  // points hold auto-advance off, the timer's does not (and must not, or the
  // carousel would pause itself forever on its own first tick).

  /** User-driven jump to a specific preset. */
  selectPreset(id: string, index: number): void {
    const inst = this.preview(id);
    if (!inst) return;
    // Set before the early-out inside applyPreset: clicking the dot that's
    // already active is a request to hold on it, even though nothing changes.
    this.resumeAt.set(id, this.now() + this.pauseMs);
    this.applyPreset(inst, index);
  }

  /** User-driven relative step; `delta` of -1/+1 for the prev/next buttons. */
  stepPreset(id: string, delta: number): void {
    const inst = this.preview(id);
    if (!inst) return;
    this.resumeAt.set(id, this.now() + this.pauseMs);
    this.applyPreset(inst, inst.presetIndex + delta);
  }

  /** Timer-driven. Skips previews the user has recently stepped by hand. */
  advanceAll(): void {
    const now = this.now();
    for (const id of this.instances.keys()) {
      const until = this.resumeAt.get(id);
      if (until !== undefined) {
        if (now < until) continue;
        this.resumeAt.delete(id);
      }
      const inst = this.preview(id);
      if (inst) this.applyPreset(inst, inst.presetIndex + 1);
    }
  }

  override remove(id: string): boolean {
    this.resumeAt.delete(id);
    return super.remove(id);
  }
}

/**
 * Subscribed read of a preview's current preset. Reading
 * `registry.getPresetIndex()` in a render body instead would never update --
 * nothing would be listening for the change.
 */
export function usePreviewPreset(
  id: string,
  registry: PreviewInstanceRegistry,
): { index: number; count: number } {
  const inst = useWidgetInstance(id, registry) as
    | PreviewWidgetInstance
    | undefined;
  return { index: inst?.presetIndex ?? 0, count: inst?.presetCount ?? 1 };
}

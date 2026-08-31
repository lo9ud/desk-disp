import type { ChapterStatus } from "../ffi_types";
import type { Side } from "../utils/placement";
import type {
  EditGridState,
  FlagName,
  UiController,
} from "../ui/UiController";

/**
 * What a step points at. A closed vocabulary rather than raw selectors, so a
 * step can only reach things the app has deliberately named.
 */
export type Target =
  | { kind: "chrome"; names: string[] }
  | { kind: "widget"; ids: string[] }
  | { kind: "widgetPart"; ids: string[]; parts: string[] }
  | { kind: "railCard"; defIds: string[] };

/** Facts a chapter's predicates read, plus ids it learns while running. */
export interface TourCtx {
  monitorCount: number;
  /** Lets a chapter gate itself on another having been finished. */
  statusOf: (chapterId: string) => ChapterStatus;
  /** Live edit-grid state, or null when edit mode isn't mounted. Read it in
   *  `requires` and `advanceOn` rather than assuming what a previous step left. */
  editState: () => EditGridState | null;
  scratch: Record<string, string | undefined>;
}

/**
 * State a step needs while it is showing. Anything unlisted is *cleared*, not
 * inherited: a step's appearance has to be fully determined by its own
 * declaration, or Back lands in whatever state the forward path happened to
 * leave behind and targets go missing.
 */
export type RequiredUiState = Partial<Record<FlagName, boolean>> & {
  selected?: string | null;
  settingsOpen?: string | null;
  addOpen?: boolean;
};

export interface RenderStyle {
  /** One hole around everything, or one per target. Default: individual. */
  mask?: "unified" | "individual";
  /** One ring around everything, or one per target. Default: individual. */
  ring?: "unified" | "individual";
  /** Padding around the target for the cut-out only; the ring keeps tracking the
   *  element. Negative insets the hole, which is how a step exposes a control
   *  while keeping something that overhangs its edge out of reach. */
  holePad?: number;
}

export interface Step {
  /** Stable across reorders — this is what gets persisted, never an index. */
  id: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  /** Omitted for a centred, target-less step. */
  targets?: Target[] | ((ctx: TourCtx) => Target[]);
  /** Ringed but not cut out of the scrim, so they stay unclickable. For showing
   *  where something should end up, as opposed to what to operate. */
  marks?: Target[] | ((ctx: TourCtx) => Target[]);
  /** Whether the step exists at all, resolved once at chapter start. Never a
   *  DOM query — element presence is a separate, per-step concern. */
  available?: (ctx: TourCtx) => boolean;
  /** The function form is for state naming something only known at runtime,
   *  such as the id of a widget the user just placed. */
  requires?: RequiredUiState | ((ctx: TourCtx) => RequiredUiState);
  render?: RenderStyle;
  /** Which side of the target the card should sit on when it fits. Worth setting
   *  for anything hard against a screen edge, where the roomiest side and the
   *  obvious side disagree. */
  prefer?: Side;
  /** Makes the cut-out the Next button: the click lands on the real element and
   *  also advances. Clicks elsewhere shake instead of dismissing. */
  action?: {
    advanceOn: "click" | ((ctx: TourCtx) => boolean);
    /** What the user must do to advance, replacing the Next button. Overrides
     *  the default "click the highlighted control" wording. */
    instruction?: string;
  };
  /** An optional nudge - something worth trying, not something required. Shown
   *  alongside the body and never gates advancement. */
  hint?: string;
  /** Lets the user operate the highlighted control. Implied by `action`, and off
   *  otherwise: a live control can open a native menu or a modal in a layer the
   *  scrim cannot dim and the card cannot sit above. Hover is never blocked. */
  interactive?: boolean;
  nextLabel?: string;
}

export interface ChapterInvite {
  /** A modal interrupts and is for first run only; a toast offers a chapter in
   *  context without taking over. */
  mode: "modal" | "toast";
  title: string;
  body: string;
  icon: React.ReactNode;
  confirmLabel?: string;
}

export interface Chapter {
  id: string;
  /** Shown in the replay list. */
  title: string;
  /** Which view the chapter's steps live in. A chapter pauses while the app is
   *  in the other one, rather than burning through steps whose targets aren't
   *  rendered. Defaults to "default". */
  mode?: "default" | "edit";
  /** null starts the chapter without asking. */
  invite: ChapterInvite | null;
  trigger: "first-run" | "manual";
  available?: (ctx: TourCtx) => boolean;
  /** Flags held for the chapter's whole run; a step's own `requires` layers on
   *  top. Anything a chapter needs throughout belongs here, not repeated per step. */
  requires?: RequiredUiState;
  /** Take the controller as the only argument: closing over anything else is
   *  what would make teardown unsound. */
  enter?: (ui: UiController) => void;
  exit?: (ui: UiController) => void;
  steps: Step[];
}

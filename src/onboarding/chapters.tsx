import {
  ArrowsRightLeftIcon,
  Cog8ToothIcon,
  CursorArrowRaysIcon,
  PencilSquareIcon,
  PlusIcon,
  RectangleGroupIcon,
  SparklesIcon,
  SwatchIcon,
  Squares2X2Icon,
  AcademicCapIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/solid";
import { InstanceRegistry } from "../registry/instanceRegistry";
import type { Chapter, TourCtx } from "./types";
import { RESIZE_DIRS } from "../components/EditGrid/ResizeHandles";

/** Every step past the invite needs the control bar held open. */
const BAR = { chromeRevealed: true } as const;

/** The building chapter places exactly one widget, so "the widget" is
 *  unambiguous and no id has to be carried between steps. */
const theWidget = (ctx: TourCtx) => ctx.editState()?.widgetIds[0] ?? null;

/** True once the widget covers the grid's middle cell. Stated as coverage rather
 *  than a distance threshold so it stays satisfiable at any grid size. */
function coversCentre(ctx: TourCtx): boolean {
  const state = ctx.editState();
  const id = theWidget(ctx);
  const p = id ? state?.placementOf(id) : undefined;
  if (!state || !p) return false;
  const midCol = Math.ceil(state.grid.cols / 2);
  const midRow = Math.ceil(state.grid.rows / 2);
  return (
    p.col <= midCol &&
    p.col + p.col_span - 1 >= midCol &&
    p.row <= midRow &&
    p.row + p.row_span - 1 >= midRow
  );
}

/** Steps follow the bar left to right; the list order is the reading order. */
export const BASICS: Chapter = {
  id: "basics",
  title: "The controls",
  trigger: "first-run",
  invite: {
    mode: "modal",
    title: "Welcome to desk-disp",
    body: "A short tour covers the control bar, or skip it and explore on your own.",
    icon: <AcademicCapIcon />,
    confirmLabel: "Start tour",
  },
  steps: [
    {
      id: "controls",
      targets: [{ kind: "chrome", names: ["controls"] }],
      requires: BAR,
      prefer: "below",
      title: "Control bar",
      body: "The control bar stays hidden to keep the display clean. Hover the top-left corner to bring it back.",
      icon: <CursorArrowRaysIcon />,
    },
    {
      id: "exit",
      targets: [{ kind: "chrome", names: ["exit"] }],
      requires: BAR,
      prefer: "below",
      title: "Exit",
      body: "Closes the application.",
      icon: <ExclamationTriangleIcon />,
    },
    {
      id: "settings",
      targets: [{ kind: "chrome", names: ["settings"] }],
      requires: BAR,
      prefer: "below",
      title: "Settings",
      body: "Themes, preferences, and which display to use.",
      icon: <Cog8ToothIcon />,
    },
    {
      id: "switch",
      targets: [{ kind: "chrome", names: ["switch"] }],
      requires: BAR,
      prefer: "below",
      available: (ctx) => ctx.monitorCount > 1,
      title: "Displays",
      body: "Moves the display to another monitor.",
      icon: <ArrowsRightLeftIcon />,
    },
    {
      id: "new-layout",
      targets: [{ kind: "chrome", names: ["new-layout"] }],
      requires: BAR,
      prefer: "below",
      title: "New layout",
      body: "Starts an empty layout and opens it for editing.",
      icon: <PlusIcon />,
    },
    {
      id: "edit",
      targets: [{ kind: "chrome", names: ["edit"] }],
      requires: BAR,
      prefer: "below",
      title: "Edit layout",
      body: "Opens edit mode, where widgets are added, moved, resized and configured.",
      icon: <PencilSquareIcon />,
    },
    {
      id: "layout",
      targets: [{ kind: "chrome", names: ["layout"] }],
      requires: BAR,
      prefer: "below",
      title: "Layouts",
      body: "Switch between saved layouts.",
      icon: <Squares2X2Icon />,
    },
    {
      id: "theme",
      targets: [{ kind: "chrome", names: ["theme"] }],
      requires: BAR,
      prefer: "below",
      title: "Themes",
      body: "Switch between themes.",
      icon: <SwatchIcon />,
    },
  ],
};

/**
 * Runs against an empty injected draft, so the user builds a layout from nothing
 * without touching their real one. `exit` cancels the session, which is the only
 * way out - `editSaveSuppressed` disables the save affordance for the duration.
 */
export const BUILDING: Chapter = {
  id: "building",
  title: "Building a layout",
  mode: "edit",
  trigger: "manual",
  available: (ctx) => ctx.statusOf("basics") === "completed",
  invite: {
    mode: "toast",
    title: "Building a layout",
    body: "The next tour covers adding and configuring widgets. It runs on a scratch layout, so nothing is saved.",
    icon: <RectangleGroupIcon />,
    confirmLabel: "Show me",
  },
  requires: { editSaveSuppressed: true },
  enter: (ui) =>
    ui.surface("editMode")?.enter({ draft: new InstanceRegistry() }),
  exit: (ui) => ui.surface("editMode")?.cancel(),
  steps: [
    {
      id: "grid",
      title: "Edit mode",
      body: "Widgets sit on a grid. This one is empty and temporary - nothing here is saved.",
      icon: <RectangleGroupIcon />,
    },
    {
      id: "add",
      targets: [{ kind: "chrome", names: ["add-widget"] }],
      action: { advanceOn: "click" },
      title: "Add a widget",
      body: "Open the widget gallery.",
      icon: <PlusIcon />,
    },
    {
      id: "pick",
      targets: [{ kind: "railCard", defIds: ["cpu"] }],
      requires: { addOpen: true },
      action: { advanceOn: "click" },
      prefer: "left",
      title: "Pick a widget",
      body: "Each card previews what the widget looks like. Click this one to place it. (You can also drag a card onto the grid, or click an empty space on the grid.)",
      icon: <Squares2X2Icon />,
    },
    {
      id: "settings",
      targets: [{ kind: "chrome", names: ["widget-settings-panel"] }],
      marks: [{ kind: "chrome", names: ["widget-tile"] }],
      requires: (ctx) => ({ settingsOpen: theWidget(ctx) }),
      interactive: true,
      title: "Widget settings",
      body: "Some widgets have configurable settings.",
      hint: "Try changing one - the widget updates as you go.",
      icon: <Cog8ToothIcon />,
    },
    {
      id: "move",
      targets: [{ kind: "chrome", names: ["widget-tile"] }],
      marks: [{ kind: "chrome", names: ["grid-centre"] }],
      // Dragging selects the widget, which brings out resize handles that
      // overhang the tile edge by 5px. Insetting the hole past that keeps them
      // out of reach so this step stays about moving.
      render: { holePad: -6 },
      interactive: true,
      action: {
        advanceOn: coversCentre,
        instruction: "Drag the widget to the middle of the grid.",
      },
      title: "Move",
      body: "Drag the widget to move it around the grid.",
      icon: <ArrowsPointingOutIcon />,
    },
    {
      id: "select",
      targets: [{ kind: "chrome", names: ["widget-tile"] }],
      // A tile never emits a click - its pointerdown preventDefault()s so the
      // drag can start - so advancement watches the resulting state instead.
      action: { advanceOn: (ctx) => !!ctx.editState()?.selected },
      title: "Select",
      body: "Click the widget to select it. The selection is indicated by a border.",
      icon: <SparklesIcon />,
    },
    {
      id: "resize",
      targets: [{ kind: "chrome", names: RESIZE_DIRS.map((d) => `widget-resize-handle-${d}`) }],
      requires: (ctx) => ({ selected: theWidget(ctx) }),
      interactive: true,
      render: { holePad: -1 },
      title: "Resize",
      body: "Drag the edges or corners to resize the widget.",
      icon: <ArrowsPointingOutIcon />,
    },
    {
      id: "open-settings",
      targets: [{ kind: "chrome", names: ["widget-settings"] }],
      // The tile's buttons only show once it is selected.
      requires: (ctx) => ({ selected: theWidget(ctx) }),
      title: "Manage widgets",
      body: "Click the gear icon to reopen the settings panel.",
      action: { advanceOn: "click" },
      prefer: "below",
      icon: <Cog8ToothIcon />,
    },
    {
      id: "settings-reopened",
      targets: [{ kind: "chrome", names: ["widget-settings-panel"] }],
      requires: (ctx) => ({ settingsOpen: theWidget(ctx) }),
      interactive: true,
      title: "Widget settings",
      body: "The settings panel is open again. You can change a widget's settings at any time.",
      icon: <Cog8ToothIcon />,
    },
    {
      id: "remove",
      targets: [{ kind: "chrome", names: ["widget-remove"] }],
      requires: (ctx) => ({ selected: theWidget(ctx) }),
      title: "Remove",
      body: "Click the X icon to remove the widget.",
      action: { advanceOn: "click" },
      prefer: "below",
      icon: <XCircleIcon />,
    },
    {
      id: "leaving",
      targets: [{ kind: "chrome", names: ["save-edit", "cancel-edit"] }],
      title: "Save or discard",
      body: "Either save or discard the layout.",
      icon: <PencilSquareIcon />,
      nextLabel: "Done",
    },
  ],
};

export const CHAPTERS: Chapter[] = [BASICS, BUILDING];

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import {
  ChevronLeftIcon,
  CodeBracketIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import {
  LiveObject,
  useGroupCollection,
  useInstanceKeyValue,
} from "../../runtime/persistence/hooks";
import {
  AppletSettingsDefinition,
  AppletSettingsProps,
  registerApplet,
} from "./Applet";
import { combineClassNames } from "../../utils/format";
import styles from "./styles/ScratchpadWidget.module.css";

const SCRATCHPAD_SETTINGS_DEF = {
  defaultTypeface: {
    type: "select",
    label: "Default typeface",
    default: "prose",
    options: {
      prose: "Prose",
      mono: "Monospace",
    },
  },
} satisfies AppletSettingsDefinition;

type Typeface =
  AppletSettingsProps<typeof SCRATCHPAD_SETTINGS_DEF>["defaultTypeface"];

export type ScratchNote = {
  id: string;
  title: string;
  body: string;
  typeface: Typeface;
};

const BODY_FLUSH_MS = 500;

function newNote(typeface: Typeface): ScratchNote {
  return { id: crypto.randomUUID(), title: "", body: "", typeface };
}

function firstLine(body: string): string {
  return body.split("\n").find((line) => line.trim())?.trim() ?? "Empty";
}

function wordCount(body: string): number {
  const trimmed = body.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function Scratchpad({
  defaultTypeface,
}: AppletSettingsProps<typeof SCRATCHPAD_SETTINGS_DEF>) {
  const notes = useGroupCollection("scratch", "notes");
  const activeNoteId = useInstanceKeyValue("active_note", "string", () => {
    const existing = notes.items[0];
    if (existing) return existing.value.id;
    const note = newNote(defaultTypeface);
    notes.add(note.id, note);
    return note.id;
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const activeNote = notes.get(activeNoteId.value) ?? notes.items[0];
  const draft = useNoteDraft(activeNote);

  // Another instance shares the group and can delete the note this one is on.
  useEffect(() => {
    if (notes.items.length === 0) {
      const note = newNote(defaultTypeface);
      notes.add(note.id, note);
      activeNoteId.set(note.id);
    } else if (!notes.get(activeNoteId.value)) {
      activeNoteId.set(notes.items[0].value.id);
    }
  });

  function selectNote(id: string) {
    draft.flush();
    activeNoteId.set(id);
    setMenuOpen(false);
  }

  function handleNewNote() {
    draft.flush();
    const note = newNote(defaultTypeface);
    notes.add(note.id, note);
    activeNoteId.set(note.id);
    setMenuOpen(false);
  }

  function handleDeleteNote() {
    draft.discard();
    const currentId = activeNoteId.value;
    let nextId = notes.ids.find((id) => id !== currentId);
    if (!nextId) {
      const note = newNote(defaultTypeface);
      notes.add(note.id, note);
      nextId = note.id;
    }
    activeNoteId.set(nextId);
    notes.delete(currentId);
  }

  function toggleTypeface() {
    activeNote?.update((note) => ({
      ...note,
      typeface: note.typeface === "mono" ? "prose" : "mono",
    }));
  }

  const mono = activeNote?.value.typeface === "mono";

  return (
    <div
      className={styles.container}
      data-typeface={activeNote?.value.typeface}
      data-menu-open={menuOpen}
    >
      <div className={styles.header}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => setMenuOpen((open) => !open)}
          title={menuOpen ? "Hide notes" : "Show notes"}
        >
          <ChevronLeftIcon
            className={combineClassNames(
              styles.menuButtonIcon,
              !menuOpen && styles.rotated,
            )}
          />
        </button>
        <input
          className={styles.titleInput}
          value={activeNote?.value.title ?? ""}
          placeholder="Untitled"
          onChange={(e) => {
            const title = e.target.value;
            activeNote?.update((note) => ({ ...note, title }));
          }}
        />
        <button
          type="button"
          className={combineClassNames(
            styles.controlButton,
            mono && styles.controlButtonActive,
          )}
          onClick={toggleTypeface}
          title="Monospace"
          aria-pressed={mono}
        >
          <CodeBracketIcon />
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleNewNote}
          title="New note"
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className={combineClassNames(
            styles.controlButton,
            styles.deleteButton,
          )}
          onClick={handleDeleteNote}
          title="Delete note"
        >
          <TrashIcon />
        </button>
      </div>

      <div className={styles.menu} inert={!menuOpen}>
        <ul className={styles.noteList}>
          {notes.items.map((note) => (
            <li key={note.value.id}>
              <button
                type="button"
                className={combineClassNames(
                  styles.noteListItem,
                  note.value.id === activeNoteId.value &&
                    styles.noteListItemActive,
                )}
                onClick={() => selectNote(note.value.id)}
              >
                <span className={styles.noteListTitle}>
                  {note.value.title || "Untitled"}
                </span>
                <span className={styles.noteListPreview}>
                  {firstLine(note.value.body)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <textarea
        className={styles.textbox}
        value={draft.value}
        spellCheck={false}
        placeholder="Start typing..."
        onChange={(e) => draft.set(e.target.value)}
        onBlur={draft.flush}
      />

      <div className={styles.footer}>
        <span>
          {notes.items.length} note{notes.items.length === 1 ? "" : "s"}
        </span>
        <span>
          {wordCount(draft.value)} words &middot; {draft.value.length} chars
        </span>
      </div>
    </div>
  );
}

/**
 * A note body held locally and written to the collection on a typing pause —
 * `commit` persists on every call, so binding the textarea straight to the note
 * costs one file write per keystroke. Switching notes must `flush` first and
 * deleting one must `discard`, or the pending write lands on the wrong note or
 * resurrects the deleted one.
 */
function useNoteDraft(note: LiveObject<ScratchNote> | undefined) {
  const [value, setValue] = useState(note?.value.body ?? "");
  const [shownId, setShownId] = useState(note?.value.id);
  const live = useRef({ note, value, dirty: false });

  if (shownId !== note?.value.id) {
    setShownId(note?.value.id);
    setValue(note?.value.body ?? "");
    live.current = { note, value: note?.value.body ?? "", dirty: false };
  } else {
    live.current.note = note;
    live.current.value = value;
  }

  const write = useCallback(() => {
    const state = live.current;
    if (!state.dirty || !state.note) return;
    state.dirty = false;
    const body = state.value;
    state.note.update((n) => ({ ...n, body }));
  }, []);

  const schedule = useDebouncedCallback(write, BODY_FLUSH_MS);

  const flush = useCallback(() => {
    schedule.cancel();
    write();
  }, [schedule, write]);

  const discard = useCallback(() => {
    schedule.cancel();
    live.current.dirty = false;
  }, [schedule]);

  const set = useCallback(
    (next: string) => {
      live.current.dirty = true;
      setValue(next);
      schedule();
    },
    [schedule],
  );

  useEffect(() => flush, [flush]);

  return { value, set, flush, discard };
}

const ScratchpadWidget = registerApplet(Scratchpad, {
  id: "scratchpad",
  name: "Scratchpad",
  description: "Jot down stray notes and ideas without leaving your desktop.",
  category: "productivity",
  tags: ["interactive"],
  settingsDef: SCRATCHPAD_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default ScratchpadWidget;

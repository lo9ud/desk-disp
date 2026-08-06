import { useState } from "react";
import {
  LiveCollection,
  LiveKeyValue,
  LiveObject,
  useGroupCollection,
  useInstanceKeyValue,
} from "../../../ipc/persistence";
import styles from "./styles/TodoListWidget.module.css";
import {
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { XMarkIcon, Bars3Icon } from "@heroicons/react/16/solid";
import {
  AppletSettingsDefinition,
  AppletSettingsProps,
  registerApplet,
} from "../Applet";
import { combineClassNames } from "../../../utils/format";

const TODO_LIST_SETTINGS_DEF = {} satisfies AppletSettingsDefinition;

export type TodoList = {
  id: string;
  title: string;
  items: Record<string, TodoItem>;
};

type TodoItem = {
  text: string;
  completed: boolean;
};

export function TodoList({}: AppletSettingsProps<
  typeof TODO_LIST_SETTINGS_DEF
>) {
  const lists = useGroupCollection("todo", "todo_lists");
  const activeListId = useInstanceKeyValue("active_list", "string", () => {
    if (lists.items.length > 0) return lists.items[0].value.id;
    const id = crypto.randomUUID();
    lists.add(id, { id, title: "New List", items: {} });
    return id;
  });

  const activeList = lists.get(activeListId.value)!;

  return (
    <div className={styles.container}>
      <ControlBar lists={lists} activeListId={activeListId} />
      <List items={activeList} />
    </div>
  );
}

function ControlBar({
  lists,
  activeListId,
}: {
  lists: LiveCollection<TodoList>;
  activeListId: LiveKeyValue<string>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeList = lists.get(activeListId.value);
  const nTasks = activeList?.value.items
    ? Object.values(activeList.value.items).length
    : 0;
  const nCompletedTasks = activeList?.value.items
    ? Object.values(activeList.value.items).filter((item) => item.completed)
        .length
    : 0;

  function handleSwitchList(id: string) {
    activeListId.set(id);
    setMenuOpen(false);
  }

  function handleAddList() {
    const listIndex =
      lists.items
        .filter((list) => list.value.title.startsWith("New List"))
        .map((list) => {
          const match = list.value.title.match(/New List(?: (\d+))?/);
          return match ? (match[1] ? Number.parseInt(match[1]) : 0) : 0;
        })
        .reduce((max, curr) => Math.max(max, curr), 0) + 1;
    const id = crypto.randomUUID();
    lists.add(id, {
      id,
      title: `New List${listIndex != 0 ? ` ${listIndex}` : ""}`,
      items: {},
    });
    activeListId.set(id);
    setMenuOpen(false);
  }

  function handleDeleteList() {
    const currentId = activeListId.value;
    let nextId = lists.ids.find((id) => id !== currentId);
    if (!nextId) {
      nextId = crypto.randomUUID();
      lists.add(nextId, { id: nextId, title: "New List", items: {} });
    }
    activeListId.set(nextId);
    lists.delete(currentId);
    setMenuOpen(false);
  }

  return (
    <div className={styles.controlBar}>
      <input
        className={styles.renameInput}
        value={activeList?.value.title ?? ""}
        onChange={(e) => {
          activeList?.update((draft) => ({ ...draft, title: e.target.value }));
        }}
      />
      <button
        type="button"
        className={combineClassNames(
          styles.controlButton,
          menuOpen && styles.controlButtonOpen,
        )}
        onClick={() => setMenuOpen((open) => !open)}
        title="Switch list"
      >
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        className={styles.controlButton}
        onClick={handleAddList}
        title="New list"
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        className={styles.controlButton}
        onClick={handleDeleteList}
        title="Delete list"
      >
        <TrashIcon />
      </button>
      {menuOpen && (
        <div className={styles.listMenu}>
          {lists.items.map((list) => (
            <button
              type="button"
              key={list.value.id}
              className={combineClassNames(
                styles.listMenuItem,
                list.value.id === activeListId.value &&
                  styles.listMenuItemActive,
              )}
              onClick={() => handleSwitchList(list.value.id)}
            >
              {list.value.title || "Untitled list"}
            </button>
          ))}
        </div>
      )}
      <div className={styles.taskCountContainer}>
        <span className={styles.taskCountLabel}>
          {nTasks} task{Math.abs(nTasks) !== 1 ? "s" : ""}
        </span>
        <span className={styles.taskCount}>
          {nCompletedTasks}/{nTasks} completed
        </span>
      </div>
    </div>
  );
}

function Item({
  itemId,
  items,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  itemId: string;
  items: LiveObject<TodoList>;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (id: string) => void;
}) {
  const item = items.value.items[itemId];
  // Native drag is only armed by a mousedown on the handle, so dragging the
  // row doesn't fight with selecting text in the item's own input.
  const [dragArmed, setDragArmed] = useState(false);

  return (
    <li
      className={styles.item}
      draggable={dragArmed}
      style={isDragging ? { opacity: 0.5 } : undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(itemId);
      }}
      onDragEnd={() => setDragArmed(false)}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(itemId);
      }}
    >
      <Bars3Icon
        className={styles.dragHandle}
        onMouseDown={() => setDragArmed(true)}
      />
      <input
        type="checkbox"
        checked={item?.completed}
        onChange={() => {
          items.update((draft) => {
            const updatedItems = { ...draft.items };

            updatedItems[itemId] = {
              ...updatedItems[itemId],
              completed: !updatedItems[itemId].completed,
            };
            return { ...draft, items: updatedItems };
          });
        }}
      />
      <input
        value={item?.text}
        className={combineClassNames(styles.itemTextInput, item.completed && styles.itemTextCompleted)}
        onChange={(e) => {
          items.update((draft) => {
            const updatedItems = { ...draft.items };
            updatedItems[itemId] = {
              ...updatedItems[itemId],
              text: e.target.value,
            };
            return { ...draft, items: updatedItems };
          });
        }}
      />
      <button
        type="button"
        className={styles.removeButton}
        title="Remove item"
        onClick={() => {
          items.update((draft) => {
            const updatedItems = { ...draft.items };
            delete updatedItems[itemId];
            return { ...draft, items: updatedItems };
          });
        }}
      >
        <XMarkIcon className={styles.removeButton} />
      </button>
    </li>
  );
}

function handleDragOver(e: React.DragEvent<HTMLLIElement>) {
  e.preventDefault();
}

function List({ items }: { items: LiveObject<TodoList> }) {
  const [newItemText, setNewItemText] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function handleAddItem() {
    const text = newItemText.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    items.update((draft) => ({
      ...draft,
      items: { ...draft.items, [id]: { text, completed: false } },
    }));
    setNewItemText("");
  }

  function handleDrop(targetId: string) {
    const sourceId = draggedId;
    setDraggedId(null);
    if (!sourceId || sourceId === targetId) return;
    items.update((draft) => {
      const ids = Object.keys(draft.items);
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return draft;
      ids.splice(from, 1);
      ids.splice(to, 0, sourceId);
      const reordered: Record<string, TodoItem> = {};
      for (const id of ids) reordered[id] = draft.items[id];
      return { ...draft, items: reordered };
    });
  }

  return (
    <div className={styles.listContainer}>
      <ul className={styles.list}>
        {Object.keys(items.value.items).map((itemId) => (
          <Item
            key={itemId}
            itemId={itemId}
            items={items}
            isDragging={draggedId === itemId}
            onDragStart={setDraggedId}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
        <li className={styles.item}>
          <Bars3Icon
            className={styles.dragHandle}
            style={{ visibility: "hidden" }}
          />
          <div></div>
          <input
            value={newItemText}
            className={styles.itemTextInput}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddItem();
            }}
            placeholder="Add new item..."
          />
          <button
            type="button"
            className={combineClassNames(styles.removeButton, styles.addButton)}
            onClick={handleAddItem}
            disabled={!newItemText.trim()}
            title="Add item"
          >
            <PlusIcon
              className={combineClassNames(
                styles.removeButton,
                styles.addButton,
              )}
            />
          </button>
        </li>
      </ul>
    </div>
  );
}

const TodoListWidget = registerApplet(TodoList, {
  id: "todo_list",
  name: "Todo List",
  description:
    "Keep a running to-do list you can check off without leaving your desktop.",
  category: "productivity",
  tags: ["interactive", "customizable"],
  settingsDef: TODO_LIST_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default TodoListWidget;

import { useEffect, useState } from "react";
import {
  LiveCollection,
  LiveKeyValue,
  LiveObject,
  useGroupCollection,
  useInstanceKeyValue,
} from "../../../ipc/persistence";
import styles from "./styles/TodoListWidget.module.css";
import {
  Bars3Icon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import {AppletSettingsDefinition, AppletSettingsProps, registerApplet} from "../Applet";

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
  const activeListId = useInstanceKeyValue("active_list", "string");

  if (!activeListId.value) {
    if (lists.items.length > 0) {
      activeListId.set(lists.items[0].value!.id);
    } else {
      // Create a new list if none exist
      const id = crypto.randomUUID();
      const newList: TodoList = {
        id,
        title: "New List",
        items: {},
      };
      lists.add(id, newList);
      activeListId.set(id);
    }
  }

  // list is guaranteed to exist here because we either set it above or it was already set
  const activeList = lists.get(activeListId.value!)!;

  return (
    <div className={styles.container}>
      <ControlBar lists={lists} activeListId={activeListId} />
      <List items={activeList!} />
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
  const activeList = lists.get(activeListId.value!);
  const nTasks = activeList?.value?.items
    ? Object.values(activeList.value.items).length
    : 0;
  const nCompletedTasks = activeList?.value?.items
    ? Object.values(activeList.value.items).filter((item) => item.completed)
        .length
    : 0;
  return (
    <div className={styles.controlBar}>
      <input
        className={styles.renameInput}
        value={activeList?.value?.title ?? ""}
        onChange={(e) => {
          activeList?.update((draft) => ({ ...draft, title: e.target.value }));
        }}
      />
      <button className={styles.controlButton}>
        <ChevronDownIcon />
      </button>
      <button className={styles.controlButton}>
        <PlusIcon />
      </button>
      <button className={styles.controlButton}>
        <TrashIcon />
      </button>
      <span className={styles.taskCountLabel}>
        {nTasks} task{Math.abs(nTasks) !== 1 ? "s" : ""}
      </span>
      <span className={styles.taskCount}>
        {nCompletedTasks}/{nTasks}
      </span>
    </div>
  );
}

function Item({
  itemId,
  items,
}: {
  itemId: string;
  items: LiveObject<TodoList>;
}) {
  const item = items.value?.items[itemId];
  return (
    <li className={styles.item}>
      <Bars3Icon className={styles.dragHandle} />
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
        className={styles.itemTextInput}
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
        className={styles.removeButton}
        onClick={() => {
          items.update((draft) => {
            console.log("Removing item", itemId, "from", draft.items);
            const updatedItems = { ...draft.items };
            delete updatedItems[itemId];
            const newItems = { ...draft, items: updatedItems };
            console.log("Updated items after removal:", newItems.items);
            return newItems;
          });
        }}
      >
        <XMarkIcon className={styles.removeButton} />
      </button>
    </li>
  );
}

function List({ items }: { items: LiveObject<TodoList> }) {
  const [newItemText, setNewItemText] = useState("");
  console.log("Rendering List with items:", items.value?.items);

  return (
    <div>
      <ul>
        {items.value?.items &&
          Object.keys(items.value.items).map((item, i) => (
            <Item key={i} itemId={item} items={items} />
          ))}
        <li className={styles.item}>
          <Bars3Icon className={styles.dragHandle} />
          <input type="checkbox" checked={false} disabled />
          <input
            value={newItemText}
            className={styles.itemTextInput}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Add new item..."
          />
          <button className={styles.removeButton} disabled={!newItemText.trim()}>
            <XMarkIcon className={styles.removeButton} />
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

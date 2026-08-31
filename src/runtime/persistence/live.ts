import type { KeyValueType } from "./handles";

export class LiveKeyValue<T extends KeyValueType> {
  constructor(
    public readonly value: T,
    private readonly _set: (v: T) => void,
  ) {}
  set(v: T) {
    this._set(v);
  }
}

export class LiveObject<T extends object> {
  constructor(
    public readonly value: T,
    private readonly _commit: (v: T) => void,
    private readonly _update: (recipe: (draft: T) => T) => void,
  ) {}
  commit(v: T) {
    this._commit(v);
  }
  update(recipe: (draft: T) => T) {
    this._update(recipe);
  }
}

export class LiveCollection<T extends object> {
  constructor(
    private readonly _entries: Record<string, LiveObject<T>>,
    private readonly _add: (id: string, initial: T) => void,
    private readonly _delete: (id: string) => void,
  ) {}

  get items(): LiveObject<T>[] {
    return Object.values(this._entries);
  }
  get ids(): string[] {
    return Object.keys(this._entries);
  }
  get entries(): typeof this._entries {
    return this._entries;
  }

  add(id: string, initial: T) {
    this._add(id, initial);
  }
  /** Honestly optional: an id that isn't in the collection has no entry. */
  get(id: string): LiveObject<T> | undefined {
    return this._entries[id];
  }
  update(id: string, recipe: (draft: T) => T) {
    this._entries[id]?.update(recipe);
  }
  delete(id: string) {
    this._delete(id);
  }
}

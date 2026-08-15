// The cursor is forced globally for the duration of a drag: per-element
// cursor/:active styling drops out once the pointer is captured or leaves
// the source element mid-drag. Pairs with the body.dragging rule in App.css.
export function beginDragCursor(cursor: string) {
  document.body.classList.add("dragging");
  document.body.style.setProperty("--drag-cursor", cursor);
}

export function endDragCursor() {
  document.body.classList.remove("dragging");
  document.body.style.removeProperty("--drag-cursor");
}

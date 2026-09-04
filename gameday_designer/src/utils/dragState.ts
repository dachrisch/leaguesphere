/**
 * Tracks the source stage of a game currently being dragged in the list
 * designer (Issue #1921).
 *
 * The HTML5 drag-and-drop API only exposes `dataTransfer` payload data on
 * the `drop` event — `dragenter`/`dragover` handlers cannot read it. Drop
 * targets that need to know the dragged item's origin while the drag is in
 * progress (e.g. to avoid highlighting the game's own current stage) must
 * track it out-of-band instead.
 */

let draggedGameSourceStageId: string | null = null;

export function setDraggedGameSourceStageId(stageId: string | null): void {
  draggedGameSourceStageId = stageId;
}

export function getDraggedGameSourceStageId(): string | null {
  return draggedGameSourceStageId;
}

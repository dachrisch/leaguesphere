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
let draggedGameSourceFieldId: string | null = null;

export function setDraggedGameSourceStageId(stageId: string | null): void {
  draggedGameSourceStageId = stageId;
}

export function getDraggedGameSourceStageId(): string | null {
  return draggedGameSourceStageId;
}

/**
 * The field the dragged game is rendered under right now (its resolved
 * field within a multi-field stage, i.e. the specific field-instance card
 * the drag started from) -- distinct from the stage id, since a stage can
 * render once per field it spans (see `StageNodeData.fieldIds`) and a drop
 * onto a different field-instance of the SAME stage reassigns the game's
 * field rather than moving it to a different stage.
 */
export function setDraggedGameSourceFieldId(fieldId: string | null): void {
  draggedGameSourceFieldId = fieldId;
}

export function getDraggedGameSourceFieldId(): string | null {
  return draggedGameSourceFieldId;
}

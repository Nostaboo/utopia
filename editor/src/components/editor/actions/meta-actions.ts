import { ElementPath } from '../../../core/shared/project-file-types'
import { EditorModes } from '../editor-modes'
import * as EditorActions from './action-creators'
import CanvasActions from '../../canvas/canvas-actions'
import { RightMenuTab } from '../store/editor-state'
import { EditorAction } from '../action-types'

export type HandleInteractionSession =
  | 'apply-changes'
  | 'do-not-apply-changes'
  | 'ignore-it-completely'

export function cancelInsertModeActions(
  handleInteractionSession: HandleInteractionSession,
): Array<EditorAction> {
  let result: Array<EditorAction> = []
  // Determine if the interaction session is cleared or ignored.
  switch (handleInteractionSession) {
    case 'apply-changes':
      result.push(CanvasActions.clearInteractionSession(true))
      break
    case 'do-not-apply-changes':
      result.push(CanvasActions.clearInteractionSession(false))
      break
    case 'ignore-it-completely':
      break
    default:
      const _exhaustiveCheck: never = handleInteractionSession
      throw new Error(`Unhandled ${handleInteractionSession}.`)
  }
  // Common actions across all cases.
  result.push(EditorActions.switchEditorMode(EditorModes.selectMode()))
  result.push(EditorActions.setRightMenuTab(RightMenuTab.Inspector))
  result.push(EditorActions.clearHighlightedViews())
  result.push(CanvasActions.clearDragState(false))

  return result
}

export function selectComponents(
  target: Array<ElementPath>,
  addToSelection: boolean,
): Array<EditorAction> {
  return [
    ...cancelInsertModeActions('apply-changes'),
    EditorActions.selectComponents(target, addToSelection),
  ]
}

import { isHorizontalPoint } from 'utopia-api/core'
import { getLayoutProperty } from '../../../core/layout/getLayoutProperty'
import { framePointForPinnedProp } from '../../../core/layout/layout-helpers-new'
import { MetadataUtils, PropsOrJSXAttributes } from '../../../core/model/element-metadata-utils'
import { mapDropNulls } from '../../../core/shared/array-utils'
import { isRight, right } from '../../../core/shared/either'
import * as EP from '../../../core/shared/element-path'
import type { ElementInstanceMetadataMap, JSXElement } from '../../../core/shared/element-template'
import {
  boundingRectangleArray,
  CanvasPoint,
  CanvasRectangle,
  CanvasVector,
  LocalRectangle,
  offsetRect,
  zeroCanvasPoint,
} from '../../../core/shared/math-utils'
import { ElementPath } from '../../../core/shared/project-file-types'
import { ProjectContentTreeRoot } from '../../assets'

import {
  getElementFromProjectContents,
  withUnderlyingTarget,
} from '../../editor/store/editor-state'
import { stylePropPathMappingFn } from '../../inspector/common/property-path-hooks'
import { determineConstrainedDragAxis } from '../canvas-controls-frame'
import { CanvasFrameAndTarget, CSSCursor } from '../canvas-types'
import {
  adjustCssLengthProperty,
  AdjustCssLengthProperty,
} from '../commands/adjust-css-length-command'
import { CanvasCommand } from '../commands/commands'
import { pushIntendedBounds } from '../commands/push-intended-bounds-command'
import { setCursorCommand } from '../commands/set-cursor-command'
import { setElementsToRerenderCommand } from '../commands/set-elements-to-rerender-command'
import { setSnappingGuidelines } from '../commands/set-snapping-guidelines-command'
import { updateHighlightedViews } from '../commands/update-highlighted-views-command'
import {
  collectParentAndSiblingGuidelines,
  runLegacyAbsoluteMoveSnapping,
} from '../controls/guideline-helpers'
import {
  ConstrainedDragAxis,
  GuidelineWithRelevantPoints,
  GuidelineWithSnappingVectorAndPointsOfRelevance,
} from '../guideline'
import { AbsolutePin } from './absolute-resize-helpers'
import {
  CustomStrategyState,
  emptyStrategyApplicationResult,
  getTargetPathsFromInteractionTarget,
  InteractionCanvasState,
  StrategyApplicationResult,
  strategyApplicationResult,
} from './canvas-strategy-types'
import { InteractionSession, StrategyState } from './interaction-state'

export interface MoveCommandsOptions {
  ignoreLocalFrame?: boolean
}

export const getAdjustMoveCommands =
  (
    canvasState: InteractionCanvasState,
    interactionSession: InteractionSession,
    options?: MoveCommandsOptions,
  ) =>
  (
    snappedDragVector: CanvasPoint,
  ): {
    commands: Array<AdjustCssLengthProperty>
    intendedBounds: Array<CanvasFrameAndTarget>
  } => {
    const selectedElements = getTargetPathsFromInteractionTarget(canvasState.interactionTarget)
    const filteredSelectedElements = getDragTargets(selectedElements)
    let commands: Array<AdjustCssLengthProperty> = []
    let intendedBounds: Array<CanvasFrameAndTarget> = []
    filteredSelectedElements.forEach((selectedElement) => {
      const elementResult = getMoveCommandsForSelectedElement(
        selectedElement,
        snappedDragVector,
        canvasState,
        interactionSession,
        options,
      )
      commands.push(...elementResult.commands)
      intendedBounds.push(...elementResult.intendedBounds)
    })
    return { commands, intendedBounds }
  }

export function applyMoveCommon(
  canvasState: InteractionCanvasState,
  interactionSession: InteractionSession,
  getMoveCommands: (snappedDragVector: CanvasPoint) => {
    commands: Array<CanvasCommand>
    intendedBounds: Array<CanvasFrameAndTarget>
  },
): StrategyApplicationResult {
  if (
    interactionSession.interactionData.type === 'DRAG' &&
    interactionSession.interactionData.drag != null
  ) {
    const drag = interactionSession.interactionData.drag
    const shiftKeyPressed = interactionSession.interactionData.modifiers.shift
    const cmdKeyPressed = interactionSession.interactionData.modifiers.cmd
    const selectedElements = getTargetPathsFromInteractionTarget(canvasState.interactionTarget)
    if (cmdKeyPressed) {
      const commandsForSelectedElements = getMoveCommands(drag)

      return strategyApplicationResult([
        ...commandsForSelectedElements.commands,
        pushIntendedBounds(commandsForSelectedElements.intendedBounds),
        updateHighlightedViews('mid-interaction', []),
        setElementsToRerenderCommand(selectedElements),
        setCursorCommand('mid-interaction', CSSCursor.Select),
      ])
    } else {
      const constrainedDragAxis =
        shiftKeyPressed && drag != null ? determineConstrainedDragAxis(drag) : null

      const targetsForSnapping = selectedElements.map(
        (path) => interactionSession.updatedTargetPaths[EP.toString(path)] ?? path,
      )
      const moveGuidelines = collectParentAndSiblingGuidelines(
        canvasState.startingMetadata,
        targetsForSnapping,
      )

      const { snappedDragVector, guidelinesWithSnappingVector } = snapDrag(
        drag,
        constrainedDragAxis,
        canvasState.startingMetadata,
        selectedElements,
        moveGuidelines,
        canvasState.scale,
      )
      const commandsForSelectedElements = getMoveCommands(snappedDragVector)
      return strategyApplicationResult([
        ...commandsForSelectedElements.commands,
        updateHighlightedViews('mid-interaction', []),
        setSnappingGuidelines('mid-interaction', guidelinesWithSnappingVector),
        pushIntendedBounds(commandsForSelectedElements.intendedBounds),
        setElementsToRerenderCommand([...selectedElements, ...targetsForSnapping]),
        setCursorCommand('mid-interaction', CSSCursor.Select),
      ])
    }
  } else {
    // Fallback for when the checks above are not satisfied.
    return emptyStrategyApplicationResult
  }
}

export function getMoveCommandsForSelectedElement(
  selectedElement: ElementPath,
  drag: CanvasVector,
  canvasState: InteractionCanvasState,
  interactionSession: InteractionSession,
  options?: MoveCommandsOptions,
): {
  commands: Array<AdjustCssLengthProperty>
  intendedBounds: Array<CanvasFrameAndTarget>
} {
  const element: JSXElement | null = getElementFromProjectContents(
    selectedElement,
    canvasState.projectContents,
    canvasState.openFile,
  )

  const elementMetadata = MetadataUtils.findElementByElementPath(
    canvasState.startingMetadata, // TODO should this be using the current metadata?
    selectedElement,
  )

  const elementParentBounds =
    elementMetadata?.specialSizeMeasurements.coordinateSystemBounds ?? null

  const localFrame = options?.ignoreLocalFrame
    ? null
    : MetadataUtils.getLocalFrameFromSpecialSizeMeasurements(
        selectedElement,
        canvasState.startingMetadata,
      )

  const globalFrame = MetadataUtils.getFrameInCanvasCoords(
    selectedElement,
    canvasState.startingMetadata,
  )

  if (element == null) {
    return { commands: [], intendedBounds: [] }
  }

  const mappedPath =
    interactionSession.updatedTargetPaths[EP.toString(selectedElement)] ?? selectedElement

  return createMoveCommandsForElement(
    element,
    selectedElement,
    mappedPath,
    drag,
    localFrame,
    globalFrame,
    elementParentBounds,
  )
}

function createMoveCommandsForElement(
  element: JSXElement,
  selectedElement: ElementPath,
  mappedPath: ElementPath,
  drag: CanvasVector,
  localFrame: LocalRectangle | null,
  globalFrame: CanvasRectangle | null,
  elementParentBounds: CanvasRectangle | null,
): {
  commands: Array<AdjustCssLengthProperty>
  intendedBounds: Array<CanvasFrameAndTarget>
} {
  const { existingPins, extendedPins } = ensureAtLeastOnePinPerDimension(right(element.props))

  const adjustPinCommands = mapDropNulls((pin) => {
    const horizontal = isHorizontalPoint(
      // TODO avoid using the loaded FramePoint enum
      framePointForPinnedProp(pin),
    )
    const negative = pin === 'right' || pin === 'bottom'

    // if this is a new pin which was missing, we offset the drag value with the initial value, which is
    // coming from the localFrame from metadata
    const isNewPin = !existingPins.includes(pin)

    const offsetX = isNewPin && pin === 'left' ? localFrame?.x ?? 0 : 0
    const offsetY = isNewPin && pin === 'top' ? localFrame?.y ?? 0 : 0

    const updatedPropValue =
      (horizontal ? offsetX + drag.x : offsetY + drag.y) * (negative ? -1 : 1)
    const parentDimension = horizontal ? elementParentBounds?.width : elementParentBounds?.height

    return adjustCssLengthProperty(
      'always',
      selectedElement,
      stylePropPathMappingFn(pin, ['style']),
      updatedPropValue,
      parentDimension,
      true,
    )
  }, extendedPins)

  const intendedBounds = (() => {
    if (globalFrame == null) {
      return []
    } else {
      const intendedGlobalFrame = offsetRect(globalFrame, drag)
      return [{ target: mappedPath, frame: intendedGlobalFrame }]
    }
  })()

  return { commands: adjustPinCommands, intendedBounds: intendedBounds }
}

export function getMultiselectBounds(
  jsxMetadata: ElementInstanceMetadataMap,
  selectedElements: Array<ElementPath>,
): CanvasRectangle | null {
  const frames = mapDropNulls((element) => {
    return MetadataUtils.getFrameInCanvasCoords(element, jsxMetadata)
  }, selectedElements)

  return boundingRectangleArray(frames)
}

export function getFileOfElement(
  target: ElementPath | null,
  projectContents: ProjectContentTreeRoot,
  openFile: string | null | undefined,
): string | null {
  return withUnderlyingTarget(
    target,
    projectContents,
    {},
    openFile,
    null,
    (_success, _element, _underlyingTarget, underlyingFilePath) => underlyingFilePath,
  )
}

// No need to include descendants in multiselection when dragging
// Note: this maybe slow when there are lot of selected views
export function getDragTargets(selectedViews: Array<ElementPath>): Array<ElementPath> {
  return selectedViews.filter((view) =>
    selectedViews.every((otherView) => !EP.isDescendantOf(view, otherView)),
  )
}

export function snapDrag(
  drag: CanvasPoint | null,
  constrainedDragAxis: ConstrainedDragAxis | null,
  jsxMetadata: ElementInstanceMetadataMap,
  selectedElements: Array<ElementPath>,
  moveGuidelines: Array<GuidelineWithRelevantPoints>,
  canvasScale: number,
): {
  snappedDragVector: CanvasPoint
  guidelinesWithSnappingVector: Array<GuidelineWithSnappingVectorAndPointsOfRelevance>
} {
  if (drag == null) {
    return {
      snappedDragVector: zeroCanvasPoint,
      guidelinesWithSnappingVector: [],
    }
  }

  const multiselectBounds = getMultiselectBounds(jsxMetadata, selectedElements)

  // This is the entry point to extend the list of snapping strategies, if we want to add more

  const { snappedDragVector, guidelinesWithSnappingVector } = runLegacyAbsoluteMoveSnapping(
    drag,
    constrainedDragAxis,
    moveGuidelines,
    canvasScale,
    multiselectBounds,
  )

  return { snappedDragVector, guidelinesWithSnappingVector }
}

const horizontalPins: Array<AbsolutePin> = ['left', 'right']
const verticalPins: Array<AbsolutePin> = ['top', 'bottom']

function ensureAtLeastOnePinPerDimension(props: PropsOrJSXAttributes): {
  existingPins: Array<AbsolutePin>
  extendedPins: Array<AbsolutePin>
} {
  const existingHorizontalPins = horizontalPins.filter((p) => {
    const prop = getLayoutProperty(p, props, ['style'])
    return isRight(prop) && prop.value != null
  })
  const existingVerticalPins = verticalPins.filter((p) => {
    const prop = getLayoutProperty(p, props, ['style'])
    return isRight(prop) && prop.value != null
  })

  const horizontalPinsToAdd: Array<AbsolutePin> = [...existingHorizontalPins]
  if (existingHorizontalPins.length === 0) {
    horizontalPinsToAdd.push('left')
  }

  const verticalPinsToAdd: Array<AbsolutePin> = [...existingVerticalPins]
  if (existingVerticalPins.length === 0) {
    verticalPinsToAdd.push('top')
  }

  return {
    existingPins: [...existingHorizontalPins, ...existingVerticalPins],
    extendedPins: [...horizontalPinsToAdd, ...verticalPinsToAdd],
  }
}

export function areAllSelectedElementsNonAbsolute(
  selectedElements: Array<ElementPath>,
  metadata: ElementInstanceMetadataMap,
): boolean {
  if (selectedElements.length > 0) {
    return selectedElements.every((element) => {
      const elementMetadata = MetadataUtils.findElementByElementPath(metadata, element)
      return !MetadataUtils.isPositionAbsolute(elementMetadata)
    })
  } else {
    return false
  }
}

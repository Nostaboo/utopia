import { PERFORMANCE_MARKS_ALLOWED, PRODUCTION_ENV } from '../../../common/env-vars'
import { getAllUniqueUids } from '../../../core/model/element-template-utils'
import { isParseSuccess, isTextFile } from '../../../core/shared/project-file-types'
import {
  codeNeedsParsing,
  codeNeedsPrinting,
} from '../../../core/workers/common/project-file-utils'
import {
  createParseFile,
  createPrintCode,
  getParseResult,
  ParseOrPrint,
  UtopiaTsWorkers,
} from '../../../core/workers/common/worker-types'
import { runLocalCanvasAction } from '../../../templates/editor-canvas'
import { runLocalNavigatorAction } from '../../../templates/editor-navigator'
import { optionalDeepFreeze } from '../../../utils/deep-freeze'
import Utils from '../../../utils/utils'
import { CanvasAction } from '../../canvas/canvas-types'
import { LocalNavigatorAction } from '../../navigator/actions'
import { PreviewIframeId, projectContentsUpdateMessage } from '../../preview/preview-pane'
import { EditorAction, EditorDispatch, isLoggedIn, LoginState } from '../action-types'
import { isTransientAction, isUndoOrRedo, isFromVSCode } from '../actions/action-utils'
import * as EditorActions from '../actions/action-creators'
import * as History from '../history'
import { StateHistory } from '../history'
import { saveStoredState } from '../stored-state'
import {
  DerivedState,
  deriveState,
  EditorState,
  EditorStoreFull,
  EditorStoreUnpatched,
  persistentModelFromEditorModel,
  reconstructJSXMetadata,
  storedEditorStateFromEditorState,
} from './editor-state'
import { runLocalEditorAction } from './editor-update'
import { fastForEach, isBrowserEnvironment } from '../../../core/shared/utils'
import { UiJsxCanvasContextData } from '../../canvas/ui-jsx-canvas'
import { ProjectContentTreeRoot, treeToContents, walkContentsTree } from '../../assets'
import { isSendPreviewModel, restoreDerivedState, UPDATE_FNS } from '../actions/actions'
import { getTransitiveReverseDependencies } from '../../../core/shared/project-contents-dependencies'
import {
  reduxDevtoolsSendActions,
  reduxDevtoolsUpdateState,
} from '../../../core/shared/redux-devtools'
import { pick } from '../../../core/shared/object-utils'
import {
  ProjectChanges,
  emptyProjectChanges,
  combineProjectChanges,
  getProjectChanges,
  sendVSCodeChanges,
} from './vscode-changes'
import { isFeatureEnabled } from '../../../utils/feature-switches'
import { handleStrategies } from './dispatch-strategies'

import { emptySet } from '../../../core/shared/set-utils'
import {
  MetaCanvasStrategy,
  RegisteredCanvasStrategies,
} from '../../canvas/canvas-strategies/canvas-strategies'
import { removePathsWithDeadUIDs } from '../../../core/shared/element-path'
import { CanvasStrategy } from '../../canvas/canvas-strategies/canvas-strategy-types'

type DispatchResultFields = {
  nothingChanged: boolean
  entireUpdateFinished: Promise<any>
}

export type InnerDispatchResult = EditorStoreFull & DispatchResultFields // TODO delete me
export type DispatchResult = EditorStoreFull & DispatchResultFields

function simpleStringifyAction(action: EditorAction): string {
  switch (action.action) {
    case 'TRANSIENT_ACTIONS':
      return `Transient: ${simpleStringifyActions(action.transientActions)}`
    case 'ATOMIC':
      return `Atomic: ${simpleStringifyActions(action.actions)}`
    default:
      return action.action
  }
}

export function simpleStringifyActions(actions: ReadonlyArray<EditorAction>): string {
  return `[\n\t${actions.map(simpleStringifyAction).join(',\n')}\n]`
}

function processAction(
  dispatchEvent: EditorDispatch,
  working: EditorStoreUnpatched,
  action: EditorAction,
  spyCollector: UiJsxCanvasContextData,
): EditorStoreUnpatched {
  const workingHistory = working.history
  // Sidestep around the local actions so that we definitely run them locally.
  if (action.action === 'TRANSIENT_ACTIONS') {
    // Drill into the array.
    return processActions(dispatchEvent, working, action.transientActions, spyCollector)
  } else if (action.action === 'ATOMIC') {
    // Drill into the array.
    return processActions(dispatchEvent, working, action.actions, spyCollector)
  } else if (action.action === 'UNDO' && !History.canUndo(workingHistory)) {
    // Bail early and make no changes.
    return working
  } else if (action.action === 'REDO' && !History.canRedo(workingHistory)) {
    // Bail early and make no changes.
    return working
  } else if (action.action === 'SET_SHORTCUT') {
    return {
      ...working,
      userState: UPDATE_FNS.SET_SHORTCUT(action, working.userState),
    }
  } else if (action.action === 'SET_LOGIN_STATE') {
    return {
      ...working,
      userState: UPDATE_FNS.SET_LOGIN_STATE(action, working.userState),
    }
  } else if (action.action === 'SET_GITHUB_STATE') {
    return {
      ...working,
      userState: UPDATE_FNS.SET_GITHUB_STATE(action, working.userState),
    }
  } else {
    // Process action on the JS side.
    const editorAfterUpdateFunction = runLocalEditorAction(
      working.unpatchedEditor,
      working.unpatchedDerived,
      working.userState,
      working.workers,
      action as EditorAction,
      workingHistory,
      dispatchEvent,
      spyCollector,
      working.builtInDependencies,
    )
    const editorAfterCanvas = runLocalCanvasAction(
      dispatchEvent,
      editorAfterUpdateFunction,
      working.unpatchedDerived,
      working.builtInDependencies,
      action as CanvasAction,
    )
    let editorAfterNavigator = runLocalNavigatorAction(
      editorAfterCanvas,
      working.unpatchedDerived,
      action as LocalNavigatorAction,
    )

    let newStateHistory: StateHistory
    switch (action.action) {
      case 'UNDO':
        newStateHistory = History.undo(workingHistory)
        break
      case 'REDO':
        newStateHistory = History.redo(workingHistory)
        break
      case 'NEW':
      case 'LOAD':
        const derivedState = deriveState(editorAfterNavigator, null)
        newStateHistory = History.init(editorAfterNavigator, derivedState)
        break
      default:
        newStateHistory = workingHistory
        break
    }

    return {
      unpatchedEditor: editorAfterNavigator,
      unpatchedDerived: working.unpatchedDerived,
      strategyState: working.strategyState, // this means the actions cannot update strategyState – this piece of state lives outside our "redux" state
      history: newStateHistory,
      userState: working.userState,
      workers: working.workers,
      persistence: working.persistence,
      dispatch: dispatchEvent,
      alreadySaved: working.alreadySaved,
      builtInDependencies: working.builtInDependencies,
    }
  }
}

function processActions(
  dispatchEvent: EditorDispatch,
  working: EditorStoreUnpatched,
  actions: Array<EditorAction>,
  spyCollector: UiJsxCanvasContextData,
): EditorStoreUnpatched {
  return actions.reduce((workingFuture: EditorStoreUnpatched, action: EditorAction) => {
    return processAction(dispatchEvent, workingFuture, action, spyCollector)
  }, working)
}

export function updateEmbeddedPreview(
  modelId: string | null,
  projectContents: ProjectContentTreeRoot,
): void {
  const embeddedPreviewElement = document.getElementById(PreviewIframeId)
  if (embeddedPreviewElement != null) {
    const embeddedPreviewIframe = embeddedPreviewElement as any as HTMLIFrameElement
    const contentWindow = embeddedPreviewIframe.contentWindow
    if (contentWindow != null) {
      try {
        contentWindow.postMessage(projectContentsUpdateMessage(projectContents), '*')
      } catch (exception) {
        // Don't nuke the editor if there's an exception posting the message.
        // This can happen if a value can't be cloned when posted.
        console.error('Error updating preview.', exception)
      }
    }
  }
}

function maybeRequestModelUpdate(
  projectContents: ProjectContentTreeRoot,
  workers: UtopiaTsWorkers,
  forceParseFiles: Array<string>,
  dispatch: EditorDispatch,
): {
  modelUpdateRequested: boolean
  parseOrPrintFinished: Promise<boolean>
  forciblyParsedFiles: Array<string>
} {
  // Walk the project contents to see if anything needs to be sent across.
  let filesToUpdate: Array<ParseOrPrint> = []
  let forciblyParsedFiles: Array<string> = []
  let existingUIDs: Set<string> = emptySet()
  walkContentsTree(projectContents, (fullPath, file) => {
    if (isTextFile(file)) {
      if (codeNeedsParsing(file.fileContents.revisionsState)) {
        const lastParseSuccess = isParseSuccess(file.fileContents.parsed)
          ? file.fileContents.parsed
          : file.lastParseSuccess
        filesToUpdate.push(
          createParseFile(fullPath, file.fileContents.code, lastParseSuccess, file.lastRevisedTime),
        )
      } else if (
        codeNeedsPrinting(file.fileContents.revisionsState) &&
        isParseSuccess(file.fileContents.parsed)
      ) {
        filesToUpdate.push(
          createPrintCode(fullPath, file.fileContents.parsed, PRODUCTION_ENV, file.lastRevisedTime),
        )
        const uidsFromFile = Object.keys(file.fileContents.parsed.highlightBounds)
        fastForEach(uidsFromFile, (uid) => existingUIDs.add(uid))
      } else if (forceParseFiles.includes(fullPath)) {
        forciblyParsedFiles.push(fullPath)
        const lastParseSuccess = isParseSuccess(file.fileContents.parsed)
          ? file.fileContents.parsed
          : file.lastParseSuccess
        filesToUpdate.push(
          createParseFile(fullPath, file.fileContents.code, lastParseSuccess, file.lastRevisedTime),
        )
      } else if (isParseSuccess(file.fileContents.parsed)) {
        const uidsFromFile = Object.keys(file.fileContents.parsed.highlightBounds)
        fastForEach(uidsFromFile, (uid) => existingUIDs.add(uid))
      }
    }
  })

  // Should anything need to be sent across, do so here.
  if (filesToUpdate.length > 0) {
    const parseFinished = getParseResult(workers, filesToUpdate, existingUIDs)
      .then((parseResult) => {
        const updates = parseResult.map((fileResult) => {
          switch (fileResult.type) {
            case 'parsefileresult':
              return EditorActions.workerParsedUpdate(
                fileResult.filename,
                fileResult.parseResult,
                fileResult.lastRevisedTime,
              )
            case 'printcoderesult':
              return EditorActions.workerCodeUpdate(
                fileResult.filename,
                fileResult.printResult,
                fileResult.highlightBounds,
                fileResult.lastRevisedTime,
              )
            default:
              const _exhaustiveCheck: never = fileResult
              throw new Error(`Unhandled file result ${JSON.stringify(fileResult)}`)
          }
        })

        dispatch([EditorActions.updateFromWorker(updates)])
        return true
      })
      .catch((e) => {
        console.error('error during parse', e)
        dispatch([EditorActions.clearParseOrPrintInFlight()])
        return true
      })
    return {
      modelUpdateRequested: true,
      parseOrPrintFinished: parseFinished,
      forciblyParsedFiles: forciblyParsedFiles,
    }
  } else {
    return {
      modelUpdateRequested: false,
      parseOrPrintFinished: Promise.resolve(true),
      forciblyParsedFiles: forciblyParsedFiles,
    }
  }
}

function maybeRequestModelUpdateOnEditor(
  editor: EditorState,
  workers: UtopiaTsWorkers,
  dispatch: EditorDispatch,
): { editorState: EditorState; modelUpdateFinished: Promise<boolean> } {
  if (editor.parseOrPrintInFlight) {
    // Prevent repeated requests
    return { editorState: editor, modelUpdateFinished: Promise.resolve(true) }
  } else {
    const modelUpdateRequested = maybeRequestModelUpdate(
      editor.projectContents,
      workers,
      editor.forceParseFiles,
      dispatch,
    )
    const remainingForceParseFiles = editor.forceParseFiles.filter(
      (filePath) => !modelUpdateRequested.forciblyParsedFiles.includes(filePath),
    )
    return {
      editorState: {
        ...editor,
        parseOrPrintInFlight: modelUpdateRequested.modelUpdateRequested,
        forceParseFiles: remainingForceParseFiles,
      },
      modelUpdateFinished: modelUpdateRequested.parseOrPrintFinished,
    }
  }
}

let accumulatedProjectChanges: ProjectChanges = emptyProjectChanges
let applyProjectChangesCoordinator: Promise<void> = Promise.resolve()

export function resetDispatchGlobals(): void {
  accumulatedProjectChanges = emptyProjectChanges
  applyProjectChangesCoordinator = Promise.resolve()
}

export function editorDispatch(
  boundDispatch: EditorDispatch,
  dispatchedActions: readonly EditorAction[],
  storedState: EditorStoreFull,
  spyCollector: UiJsxCanvasContextData,
  strategiesToUse: Array<MetaCanvasStrategy> = RegisteredCanvasStrategies, // only override this for tests
): DispatchResult {
  const isLoadAction = dispatchedActions.some((a) => a.action === 'LOAD')
  const nameUpdated = dispatchedActions.some(
    (action) => action.action === 'SET_PROJECT_NAME' || action.action === 'SET_PROJECT_ID',
  )
  const forceSave =
    nameUpdated ||
    dispatchedActions.some((action) => action.action === 'SAVE_CURRENT_FILE') ||
    dispatchedActions.some(
      (action) => action.action === 'UPDATE_FROM_CODE_EDITOR' && action.unsavedContent == null,
    )

  const allTransient = dispatchedActions.every(isTransientAction)
  const anyFinishCheckpointTimer = dispatchedActions.some((action) => {
    return action.action === 'FINISH_CHECKPOINT_TIMER'
  })
  const anyWorkerUpdates = dispatchedActions.some(
    (action) => action.action === 'UPDATE_FROM_WORKER',
  )
  const anyUndoOrRedo = dispatchedActions.some(isUndoOrRedo)
  const anySendPreviewModel = dispatchedActions.some(isSendPreviewModel)

  // With this reducer we can split the actions into groups (arrays) which can be dispatched together without rebuilding the derived state.
  // Between the different group derived state rebuild is needed
  const reducerToSplitToActionGroups = (
    actionGroups: EditorAction[][],
    currentAction: EditorAction,
    i: number,
    actions: readonly EditorAction[],
  ): EditorAction[][] => {
    if (currentAction.action === `TRANSIENT_ACTIONS`) {
      // if this is a transient action we need to split its sub-actions into groups which can be dispatched together
      const transientActionGroups = currentAction.transientActions.reduce(
        reducerToSplitToActionGroups,
        [[]],
      )
      const wrappedTransientActionGroups = transientActionGroups.map((actionGroup) => [
        EditorActions.transientActions(actionGroup),
      ])
      return [...actionGroups, ...wrappedTransientActionGroups]
    } else if (i > 0 && actions[i - 1].action === 'CLEAR_INTERACTION_SESSION') {
      // CLEAR_INTERACTION_SESSION must be the last action for a given action group, so if the previous action was CLEAR_INTERACTION_SESSION,
      // then we need to start a new action group
      return [...actionGroups, [currentAction]]
    } else {
      // if this action does not need a rebuilt derived state we can just push it into the last action group to dispatch them together
      let updatedGroups = actionGroups
      updatedGroups[actionGroups.length - 1].push(currentAction)
      return updatedGroups
    }
  }
  const actionGroupsToProcess = dispatchedActions.reduce(reducerToSplitToActionGroups, [[]])

  const result: InnerDispatchResult = actionGroupsToProcess.reduce(
    (working: InnerDispatchResult, actions) => {
      const newStore = editorDispatchInner(
        boundDispatch,
        actions,
        working,
        spyCollector,
        strategiesToUse,
      )
      return newStore
    },
    { ...storedState, entireUpdateFinished: Promise.resolve(true), nothingChanged: true },
  )

  // The FINISH_CHECKPOINT_TIMER action effectively overrides the case where nothing changed,
  // as it's likely that action on it's own didn't change anything, but the actions that paired with
  // START_CHECKPOINT_TIMER likely did.
  const transientOrNoChange = (allTransient || result.nothingChanged) && !anyFinishCheckpointTimer
  const workerUpdatedModel = dispatchedActions.some(
    (action) => action.action === 'UPDATE_FROM_WORKER',
  )

  const { unpatchedEditorState, patchedEditorState, newStrategyState, patchedDerivedState } = {
    unpatchedEditorState: result.unpatchedEditor,
    patchedEditorState: result.patchedEditor,
    newStrategyState: result.strategyState,
    patchedDerivedState: result.patchedDerived,
  }

  const editorFilteredForFiles = filterEditorForFiles(unpatchedEditorState)

  const frozenDerivedState = result.unpatchedDerived

  // NOTE:
  // We add the current editor state to undo history synchronously, although the parsed state can be out of date, and
  // will be only fixed after the next UPDATE_FROM_WORKER action (which is transient and will not modify the
  // undo history).
  // This causes two known bugs:
  // 1. the first undo step after load is unparsed, so if you undo till the beginning, the canvas is unmounted,
  //    only mounted back after the worker is ready with the parsing (which causes a blink)
  // 2. If you modify the code in the code editor, the undo history is going to contain out of date parse results,
  //    so if you undo back until a code change, the canvas content will briefly contain the position from one
  //    step earlier. How to reproduce?
  //    1 - left is initially set to 50
  //    2 - Change left to 100 via code - undo history now stores CODE_AHEAD version of the model, with the parsed
  //        model still containing 50 until the workers return the new value (at which point the canvas updates)
  //    3 - Drag the element on the canvas to update left to 200
  //    4 - Undo the drag. Canvas renders with left: 50 briefly whilst the worker re-parses, then updates to left: 100
  //
  // All these issues are eventually fixed after the worker reparses the code, but they cause visual glitches.
  //
  // Potential solution:
  //    Adding something with CODE_AHEAD or PARSED_AHEAD to the undo stack triggers its own worker request, that then
  //    only updates that undo stack entry (i.e. that doesn't feed into the rest of the editor at all)
  //    This worker could get an undo stack item id and only update that item in the undo history after it is ready

  let newHistory: StateHistory
  if (transientOrNoChange) {
    newHistory = result.history
  } else {
    newHistory = History.add(result.history, editorFilteredForFiles, frozenDerivedState)
  }

  const alreadySaved = result.alreadySaved

  const isLoaded = editorFilteredForFiles.isLoaded
  const shouldSave =
    isLoaded &&
    !isLoadAction &&
    (!transientOrNoChange || anyUndoOrRedo || (anyWorkerUpdates && alreadySaved)) &&
    isBrowserEnvironment

  const editorWithModelChecked =
    !anyUndoOrRedo && transientOrNoChange && !workerUpdatedModel
      ? { editorState: unpatchedEditorState, modelUpdateFinished: Promise.resolve(true) }
      : maybeRequestModelUpdateOnEditor(unpatchedEditorState, storedState.workers, boundDispatch)

  const frozenEditorState = editorWithModelChecked.editorState

  const finalStore: DispatchResult = {
    unpatchedEditor: frozenEditorState,
    patchedEditor: patchedEditorState,
    unpatchedDerived: frozenDerivedState,
    patchedDerived: patchedDerivedState,
    strategyState: optionalDeepFreeze(newStrategyState),
    history: newHistory,
    userState: result.userState,
    workers: storedState.workers,
    persistence: storedState.persistence,
    dispatch: boundDispatch,
    nothingChanged: result.nothingChanged,
    entireUpdateFinished: Promise.all([
      result.entireUpdateFinished,
      editorWithModelChecked.modelUpdateFinished,
    ]),
    alreadySaved: alreadySaved || shouldSave,
    builtInDependencies: storedState.builtInDependencies,
  }

  reduxDevtoolsSendActions(actionGroupsToProcess, finalStore, allTransient)

  if (storedState.userState.loginState.type !== result.userState.loginState.type) {
    if (isLoggedIn(result.userState.loginState)) {
      storedState.persistence.login()
    } else {
      storedState.persistence.logout()
    }
  }

  if (shouldSave) {
    storedState.persistence.save(
      frozenEditorState.projectName,
      persistentModelFromEditorModel(frozenEditorState),
      forceSave ? 'force' : 'throttle',
    )
    const stateToStore = storedEditorStateFromEditorState(frozenEditorState)
    void saveStoredState(frozenEditorState.id, stateToStore)
    reduxDevtoolsUpdateState('Save Editor', finalStore)
  }

  const updatedFromVSCode = dispatchedActions.some(isFromVSCode)
  if (updatedFromVSCode && !dispatchedActions.every(isFromVSCode)) {
    console.error(
      `VS Code actions mixed with Utopia actions`,
      simpleStringifyActions(dispatchedActions),
    )
  }

  const projectChanges = getProjectChanges(storedState.unpatchedEditor, frozenEditorState)
  applyProjectChanges(frozenEditorState, projectChanges, updatedFromVSCode)

  const shouldUpdatePreview =
    anySendPreviewModel ||
    frozenEditorState.projectContents !== storedState.unpatchedEditor.projectContents
  if (shouldUpdatePreview) {
    updateEmbeddedPreview(frozenEditorState.id, frozenEditorState.projectContents)
  }

  if (frozenEditorState.id != null && frozenEditorState.id != storedState.unpatchedEditor.id) {
    storedState.workers.initWatchdogWorker(frozenEditorState.id)
  }

  maybeCullElementPathCache(
    storedState.unpatchedEditor.projectContents,
    anyWorkerUpdates ? 'schedule-now' : 'dont-schedule',
  )

  return finalStore
}

let cullElementPathCacheTimeoutId: number | undefined = undefined
const CullElementPathCacheTimeout = 1000
let lastProjectContents: ProjectContentTreeRoot = {}
export function setLastProjectContentsForTesting(projectContents: ProjectContentTreeRoot) {
  lastProjectContents = projectContents
}

function maybeCullElementPathCache(
  projectContents: ProjectContentTreeRoot,
  scheduleOrNot: 'schedule-now' | 'dont-schedule',
) {
  lastProjectContents = projectContents
  if (scheduleOrNot === 'schedule-now') {
    // Updates from the worker indicate that paths might have changed, so schedule a
    // cache cull for the next time the browser is idle
    if (typeof window.requestIdleCallback !== 'undefined') {
      if (cullElementPathCacheTimeoutId != null) {
        window.cancelIdleCallback(cullElementPathCacheTimeoutId)
      }

      cullElementPathCacheTimeoutId = window.requestIdleCallback(cullElementPathCache)
    } else {
      clearTimeout(cullElementPathCacheTimeoutId)
      cullElementPathCacheTimeoutId = window.setTimeout(
        cullElementPathCache,
        CullElementPathCacheTimeout,
      )
    }
  }
}

function cullElementPathCache() {
  const allExistingUids = getAllUniqueUids(lastProjectContents)
  removePathsWithDeadUIDs(new Set(allExistingUids))
}

function applyProjectChanges(
  frozenEditorState: EditorState,
  projectChanges: ProjectChanges,
  updatedFromVSCode: boolean,
) {
  accumulatedProjectChanges = combineProjectChanges(
    accumulatedProjectChanges,
    updatedFromVSCode ? { ...projectChanges, fileChanges: [] } : projectChanges,
  )

  if (frozenEditorState.vscodeReady) {
    // Chain off of the previous one to ensure the ordering is maintained.
    applyProjectChangesCoordinator = applyProjectChangesCoordinator.then(async () => {
      const changesToSend = accumulatedProjectChanges
      accumulatedProjectChanges = emptyProjectChanges
      return sendVSCodeChanges(changesToSend).catch((error) => {
        console.error('Error sending updates to VS Code', error)
      })
    })
  }

  const updatedFileNames = projectChanges.fileChanges.map((fileChange) => fileChange.fullPath)
  const updatedAndReverseDepFilenames = getTransitiveReverseDependencies(
    frozenEditorState.projectContents,
    frozenEditorState.nodeModules.files,
    updatedFileNames,
  )

  // Mutating the evaluation cache.
  for (const fileToDelete of updatedAndReverseDepFilenames) {
    delete frozenEditorState.codeResultCache.evaluationCache[fileToDelete]
  }
}

function editorDispatchInner(
  boundDispatch: EditorDispatch,
  dispatchedActions: EditorAction[],
  storedState: InnerDispatchResult,
  spyCollector: UiJsxCanvasContextData,
  strategiesToUse: Array<MetaCanvasStrategy>,
): InnerDispatchResult {
  // console.trace('DISPATCH', simpleStringifyActions(dispatchedActions))

  const MeasureDispatchTime =
    isFeatureEnabled('Debug mode – Performance Marks') && PERFORMANCE_MARKS_ALLOWED

  if (MeasureDispatchTime) {
    window.performance.mark('dispatch_begin')
  }
  if (dispatchedActions.length > 0) {
    // Run everything in a big chain.
    let result = processActions(boundDispatch, storedState, dispatchedActions, spyCollector)

    const anyUndoOrRedo = dispatchedActions.some(isUndoOrRedo)

    if (MeasureDispatchTime) {
      window.performance.mark('derived_state_begin')
    }

    const editorStayedTheSame =
      storedState.nothingChanged &&
      storedState.unpatchedEditor === result.unpatchedEditor &&
      storedState.userState === result.userState

    const domMetadataChanged =
      storedState.unpatchedEditor.domMetadata !== result.unpatchedEditor.domMetadata
    const spyMetadataChanged =
      storedState.unpatchedEditor.spyMetadata !== result.unpatchedEditor.spyMetadata
    const allElementPropsChanged =
      storedState.unpatchedEditor._currentAllElementProps_KILLME !==
      result.unpatchedEditor._currentAllElementProps_KILLME
    const dragStateLost =
      storedState.unpatchedEditor.canvas.dragState != null &&
      result.unpatchedEditor.canvas.dragState == null
    const metadataChanged =
      domMetadataChanged || spyMetadataChanged || allElementPropsChanged || dragStateLost
    if (metadataChanged) {
      if (result.unpatchedEditor.canvas.dragState != null) {
        result = {
          ...result,
          unpatchedEditor: {
            ...result.unpatchedEditor,
            canvas: {
              ...result.unpatchedEditor.canvas,
              dragState: {
                ...result.unpatchedEditor.canvas.dragState,
                metadata: reconstructJSXMetadata(result.unpatchedEditor),
              },
            },
          },
        }
      } else if (result.unpatchedEditor.canvas.interactionSession != null) {
        result = {
          ...result,
          unpatchedEditor: {
            ...result.unpatchedEditor,
            canvas: {
              ...result.unpatchedEditor.canvas,
              interactionSession: {
                ...result.unpatchedEditor.canvas.interactionSession,
                latestMetadata: reconstructJSXMetadata(result.unpatchedEditor),
                latestAllElementProps: result.unpatchedEditor._currentAllElementProps_KILLME,
              },
            },
          },
        }
      } else {
        result = {
          ...result,
          unpatchedEditor: {
            ...result.unpatchedEditor,
            jsxMetadata: reconstructJSXMetadata(result.unpatchedEditor),
            allElementProps: result.unpatchedEditor._currentAllElementProps_KILLME,
          },
        }
      }
    }

    let frozenEditorState: EditorState = optionalDeepFreeze(result.unpatchedEditor)

    let frozenDerivedState: DerivedState
    if (anyUndoOrRedo) {
      frozenDerivedState = optionalDeepFreeze(restoreDerivedState(result.history))
      // TODO BB put inspector and navigator back to history
    } else if (editorStayedTheSame) {
      // !! We completely skip creating a new derived state, since the editor state stayed the exact same
      frozenDerivedState = storedState.unpatchedDerived
    } else {
      const derivedState = deriveState(frozenEditorState, storedState.unpatchedDerived)
      frozenDerivedState = optionalDeepFreeze(derivedState)
    }

    const actionNames = dispatchedActions.map((action) => action.action).join(',')
    getAllUniqueUids(frozenEditorState.projectContents, actionNames)

    if (MeasureDispatchTime) {
      window.performance.mark('dispatch_end')
      window.performance.measure(
        `Momentum Dispatch: [${actionNames}]`,
        'dispatch_begin',
        'dispatch_end',
      )
      window.performance.measure(
        'Momentum Editor State Update',
        'dispatch_begin',
        'derived_state_begin',
      )
      window.performance.measure(
        'Momentum Editor Derived State',
        'derived_state_begin',
        'dispatch_end',
      )
    }

    const { unpatchedEditorState, patchedEditorState, newStrategyState, patchedDerivedState } =
      isFeatureEnabled('Canvas Strategies')
        ? handleStrategies(
            strategiesToUse,
            dispatchedActions,
            storedState,
            result,
            storedState.patchedDerived,
          )
        : {
            unpatchedEditorState: result.unpatchedEditor,
            patchedEditorState: result.unpatchedEditor,
            newStrategyState: result.strategyState,
            patchedDerivedState: result.unpatchedDerived,
          }

    return {
      unpatchedEditor: unpatchedEditorState,
      patchedEditor: patchedEditorState,
      unpatchedDerived: frozenDerivedState,
      patchedDerived: patchedDerivedState,
      strategyState: newStrategyState,
      history: result.history,
      userState: result.userState,
      workers: storedState.workers,
      persistence: storedState.persistence,
      dispatch: boundDispatch,
      nothingChanged: editorStayedTheSame,
      entireUpdateFinished: Promise.all([storedState.entireUpdateFinished]),
      alreadySaved: storedState.alreadySaved,
      builtInDependencies: storedState.builtInDependencies,
    }
  } else {
    //empty return
    return {
      ...storedState,
      nothingChanged: true,
    }
  }
}

function filterEditorForFiles(editor: EditorState) {
  // FIXME: Reimplement this in a way that doesn't require converting from `ProjectContents`.
  const projectContents = treeToContents(editor.projectContents)
  const allFiles = Object.keys(projectContents)
  return {
    ...editor,
    codeResultCache: {
      ...editor.codeResultCache,
      cache: pick(allFiles, editor.codeResultCache.cache),
    },
    codeEditorErrors: {
      buildErrors: pick(allFiles, editor.codeEditorErrors.buildErrors),
      lintErrors: pick(allFiles, editor.codeEditorErrors.lintErrors),
    },
  }
}

/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
import * as Path from 'path'
import pathParse from 'path-parse'
import React from 'react'
import { ConnectableElement, ConnectDragPreview, useDrag, useDrop } from 'react-dnd'
import { ProjectFileType } from '../../core/shared/project-file-types'
import { parseClipboardData } from '../../utils/clipboard'
import Utils from '../../utils/utils'
import { ContextMenuItem, requireDispatch } from '../context-menu-items'
import { ContextMenuWrapper } from '../context-menu-wrapper'
import { EditorAction, EditorDispatch } from '../editor/action-types'
import * as EditorActions from '../editor/actions/action-creators'
import { ExpandableIndicator } from '../navigator/navigator-item/expandable-indicator'
import { FileBrowserItemInfo, FileBrowserItemType } from './filebrowser'
import { PasteResult } from '../../utils/clipboard-utils'
import { last } from '../../core/shared/array-utils'
import { FileResult } from '../../core/shared/file-utils'
import { WarningIcon } from '../../uuiui/warning-icon'
import { fileResultUploadAction } from '../editor/image-insert'
import {
  Icn,
  Icons,
  flexRowStyle,
  OnClickOutsideHOC,
  StringInput,
  //TODO: switch to functional component and make use of 'useColorTheme':
  colorTheme,
  UtopiaTheme,
  SimpleFlexRow,
  Button,
} from '../../uuiui'
import { notice } from '../common/notice'
import { appendToPath, getParentDirectory } from '../../utils/path-utils'
import { AddingFile, applyAddingFile } from './filepath-utils'
import CanvasActions from '../canvas/canvas-actions'
import {
  boundingArea,
  createInteractionViaMouse,
} from '../canvas/canvas-strategies/interaction-state'
import { emptyModifiers } from '../../utils/modifiers'
import { CanvasMousePositionRaw } from '../../utils/global-positions'
import { imagePathURL } from '../../common/server'
import { generateUidWithExistingComponents } from '../../core/model/element-template-utils'
import { useEditorState } from '../editor/store/store-hook'
import { createJsxImage } from '../images'
import { resize, size, Size } from '../../core/shared/math-utils'
import { EditorModes } from '../editor/editor-modes'

export interface FileBrowserItemProps extends FileBrowserItemInfo {
  isSelected: boolean
  renamingTarget: string | null
  key: string
  dispatch: EditorDispatch
  collapsed: boolean
  dropTarget: string | null
  toggleCollapse: (filePath: string) => void
  expand: (filePath: string) => void
  setSelected: (selectedItem: FileBrowserItemInfo | null) => void
  generateNewUid: () => string
}

interface FileBrowserItemState {
  isRenaming: boolean
  isHovered: boolean
  adding: AddingFile | null
  // we need the following to keep track of 'internal' exits,
  // eg when moving from the outer folder div to a span with the folder name inside it
  // see https://medium.com/@650egor/simple-drag-and-drop-file-upload-in-react-2cb409d88929
  currentExternalFilesDragEventCounter: number
  externalFilesDraggedIn: boolean
  filename: string
  pathParts: Array<string>
}

const BaseIndentationPadding = 15

function onDrop(
  draggedOntoProps: FileBrowserItemProps | 'CANVAS',
  draggedProps: FileBrowserItemProps,
) {
  if (draggedOntoProps !== 'CANVAS') {
    const isRootArea = draggedOntoProps.fileType != null
    if (
      draggedOntoProps.fileType == null ||
      (draggedOntoProps.dropTarget != null &&
        draggedOntoProps.path.includes(draggedOntoProps.dropTarget)) ||
      isRootArea
    ) {
      const newDirectory = draggedOntoProps.dropTarget != null ? draggedOntoProps.dropTarget : '/'
      const newFilePath = appendToPath(newDirectory, last(draggedProps.path.split('/')) as string)
      if (draggedProps.path !== newFilePath && draggedProps.path !== draggedOntoProps.path) {
        draggedOntoProps.dispatch(
          [
            EditorActions.updateFilePath(draggedProps.path, newFilePath),
            EditorActions.setFilebrowserDropTarget(null),
          ],
          'everyone',
        )
      } else {
        draggedOntoProps.dispatch([EditorActions.setFilebrowserDropTarget(null)], 'everyone')
      }
    } else {
      draggedOntoProps.dispatch([EditorActions.setFilebrowserDropTarget(null)], 'everyone')
    }
  }
}

export function getIconNameForFilePath(filePath: string): string {
  const parts = filePath.toLowerCase().split('.')
  const extension = parts.length > 0 ? last(parts) : null

  switch (extension) {
    case 'jsx':
    case 'js':
    case 'tsx':
    case 'ts':
    case 'html':
    case 'css':
    case 'txt':
    case 'md':
    case 'json':
    case 'svg':
      return extension
    case 'otf':
    case 'ttf':
    case 'woff':
    case 'woff2':
      return 'font'
    case 'jpg':
    case 'gif':
    case 'png':
    case 'jpeg':
    case 'webp':
      return 'img'
    case 'avi':
    case 'mpeg':
    case 'mpg':
    case 'qt':
    case 'mp4':
    case 'webm':
    case 'ogv':
    case 'mov':
      return 'video'
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'm4a':
    case 'flac':
    case 'aac':
      return 'audio'
    default:
      return 'other'
  }
}

export function getIconTypeForFileBrowserItem(
  fileBrowserItemType: FileBrowserItemType,
  filePath: string,
  fileType: ProjectFileType | null,
  collapsed: boolean,
  exportedFunction: boolean = false,
): string {
  if (fileBrowserItemType === 'export') {
    if (exportedFunction) {
      return 'function'
    } else {
      return 'export'
    }
  }
  if (fileType == null) {
    return 'folder-open'
  } else {
    switch (fileType) {
      case 'DIRECTORY':
        if (collapsed) {
          return 'folder-closed'
        } else {
          return 'folder-open'
        }
      case 'IMAGE_FILE':
      case 'TEXT_FILE':
      case 'ASSET_FILE':
        return getIconNameForFilePath(filePath)
      default:
        const _exhaustiveCheck: never = fileType
        throw new Error(`Unhandled type ${JSON.stringify(fileType)}`)
    }
  }
}

const canDelete = (fileBrowserItem: FileBrowserItemInfo) => {
  return isFileButNotPackageJson(fileBrowserItem)
}

const canDragnDrop = (fileBrowserItem: FileBrowserItemInfo) => {
  return isFileButNotPackageJson(fileBrowserItem)
}

const canRename = (fileBrowserItem: FileBrowserItemInfo) => {
  return isFileButNotPackageJson(fileBrowserItem)
}

const isFileButNotPackageJson = (fileBrowserItem: FileBrowserItemInfo) => {
  return fileBrowserItem.type === 'file' && fileBrowserItem.path != 'package.json'
}

const isFile = (fileBrowserItem: FileBrowserItemInfo) => {
  return fileBrowserItem.type === 'file'
}

export function addingChildElement(
  indentation: number,
  addingChildName: string,
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void,
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void,
  onBlur: () => void,
): React.ReactNode {
  return (
    <SimpleFlexRow
      style={{
        // make it look indented, plus extra to account for missing icon
        paddingLeft: (indentation + 1) * BaseIndentationPadding + 20,
        paddingTop: 3,
        paddingBottom: 3,
        height: 32,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <StringInput
        testId=''
        value={addingChildName}
        autoFocus
        onKeyDown={onKeyDown}
        onChange={onChange}
        onBlur={onBlur}
      />
    </SimpleFlexRow>
  )
}

interface FileBrowserItemDragProps {
  isDragging: boolean
  isOver: boolean
  connectDragPreview: ConnectDragPreview
  forwardedRef: any
}

class FileBrowserItemInner extends React.PureComponent<
  FileBrowserItemProps & FileBrowserItemDragProps & DragHandleProps,
  FileBrowserItemState
> {
  constructor(props: FileBrowserItemProps & FileBrowserItemDragProps & DragHandleProps) {
    super(props)
    this.state = {
      isRenaming: false,
      isHovered: false,
      adding: null,
      currentExternalFilesDragEventCounter: 0,
      externalFilesDraggedIn: false,
      filename: '',
      pathParts: [],
    }
  }

  static getDerivedStateFromProps(
    props: FileBrowserItemProps,
    state: FileBrowserItemState,
  ): Partial<FileBrowserItemState> | null {
    if (state.isRenaming) {
      return {
        isRenaming: props.renamingTarget === props.path,
      }
    }
    const pathParts = props.path.split('/').filter((s) => s !== '')
    const filename = Utils.last(pathParts)
    return {
      filename: filename,
      isRenaming: props.renamingTarget === props.path,
      pathParts: pathParts,
    }
  }

  toggleCollapse = () => this.props.toggleCollapse(this.props.path)

  renderIcon() {
    return (
      <Icn
        style={{
          marginRight: 0,
        }}
        category='filetype'
        type={getIconTypeForFileBrowserItem(
          this.props.type,
          this.props.path,
          this.props.fileType,
          this.props.collapsed,
          this.props.exportedFunction,
        )}
        color={this.props.errorMessages.length > 0 ? 'error' : undefined}
        width={18}
        height={18}
        onDoubleClick={this.toggleCollapse}
      />
    )
  }

  renderModifiedIcon() {
    return this.props.modified ? <Icons.CircleSmall color='primary' /> : null
  }

  onChangeFilename = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ filename: event.target.value })
  }

  onKeyDownFilename = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && this.state.filename.trim().length > 0) {
      const newFileName = this.state.filename
      const parsedPath = pathParse(this.props.path)
      const newPath = Path.normalize(`${parsedPath.dir}/${newFileName}`)
      this.props.dispatch(
        [
          EditorActions.updateFilePath(this.props.path, newPath),
          EditorActions.setFilebrowserRenamingTarget(null),
        ],
        'everyone',
      )
    }
    if (event.key === 'Escape') {
      this.props.dispatch([EditorActions.setFilebrowserRenamingTarget(null)], 'everyone')
    }
  }

  onBlurFilename = () => {
    this.props.dispatch([EditorActions.setFilebrowserRenamingTarget(null)], 'everyone')
  }

  onFocusFilename = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select()
  }

  onDoubleClickFilename = () => {
    if (canRename(this.props)) {
      this.props.dispatch([EditorActions.setFilebrowserRenamingTarget(this.props.path)], 'everyone')
    } else if (isFile(this.props)) {
      this.props.dispatch(
        [EditorActions.showToast(notice('We need this file. You cannot rename it.', 'WARNING'))],
        'everyone',
      )
    }
  }

  onClickOutsideLabel = () => {
    this.props.dispatch([EditorActions.setFilebrowserRenamingTarget(null)], 'everyone')
  }

  renderLabel() {
    if (this.state.isRenaming) {
      return (
        <div style={{ ...flexRowStyle, marginLeft: 2 }}>
          <OnClickOutsideHOC onClickOutside={this.onClickOutsideLabel}>
            <StringInput
              testId=''
              value={this.state.filename}
              onChange={this.onChangeFilename}
              onKeyDown={this.onKeyDownFilename}
              onFocus={this.onFocusFilename}
              focusOnMount
            />
          </OnClickOutsideHOC>
        </div>
      )
    } else {
      let labelColor: string = colorTheme.neutralForeground.value
      if (this.props.errorMessages.length > 0) {
        labelColor = colorTheme.errorForeground.value
      } else if (this.props.fileType === 'ASSET_FILE') {
        labelColor = colorTheme.primary.value
      }
      return (
        <div
          style={{
            ...flexRowStyle,
            marginLeft: 6,
            color: labelColor,
          }}
          onDoubleClick={this.onDoubleClickFilename}
        >
          <span>{this.state.filename}</span>
          {this.props.typeInformation != null ? <span>: {this.props.typeInformation}</span> : null}
        </div>
      )
    }
  }

  renderDeleteButton() {
    return <Icons.CrossSmall />
  }

  deleteContextMenuItem(): ContextMenuItem<unknown> {
    return {
      name: `Delete ${
        this.props.fileType != null
          ? this.props.fileType === 'DIRECTORY'
            ? 'folder'
            : 'file'
          : 'item'
      }`,
      enabled: this.props.fileType != null && canDelete(this.props),
      action: (data: unknown, dispatch?: EditorDispatch) => {
        requireDispatch(dispatch)(
          [
            EditorActions.showModal({
              type: 'file-delete',
              filePath: this.props.path,
            }),
          ],
          'everyone',
        )
      },
    }
  }

  renameContextMenuItem(): ContextMenuItem<unknown> {
    return {
      name: `Rename ${
        this.props.fileType != null
          ? this.props.fileType === 'DIRECTORY'
            ? 'Folder'
            : 'File'
          : 'this'
      }`,
      enabled: this.props.fileType != null && canRename(this.props),
      action: () => {
        this.props.dispatch(
          [EditorActions.setFilebrowserRenamingTarget(this.props.path)],
          'everyone',
        )
      },
    }
  }

  delete = () => {
    this.props.dispatch(
      [
        EditorActions.showModal({
          type: 'file-delete',
          filePath: this.props.path,
        }),
      ],
      'everyone',
    )
  }

  onItemDrop = (event: React.DragEvent<HTMLDivElement>) => {
    // this disables react-dnd while dropping external files
    if (!this.props.isOver) {
      event.preventDefault()
      event.stopPropagation()
    }

    this.setState({
      externalFilesDraggedIn: false,
      currentExternalFilesDragEventCounter: 0,
    })

    void parseClipboardData(event.dataTransfer).then((result: PasteResult) => {
      let actions: Array<EditorAction> = []
      Utils.fastForEach(result.files, (resultFile: FileResult) => {
        let targetPath: string | null = null
        let replace = false
        switch (this.props.fileType) {
          case 'DIRECTORY':
            // Put the image "into" the directory.
            targetPath = `${this.props.path}/${resultFile.filename}`
            break
          case 'ASSET_FILE':
          case 'IMAGE_FILE':
            // Overwrite the image.
            targetPath = this.props.path
            replace = true
            break
          default:
          // Do nothing, overwriting an image onto a UI file seems wrong.
        }

        if (targetPath != null) {
          actions.push(fileResultUploadAction(resultFile, targetPath, replace))
        }
      })
      this.props.dispatch(actions, 'everyone')
    })
  }

  setItemIsHovered = () => {
    this.setState({ isHovered: true })
  }

  setItemIsNotHovered = () => {
    this.setState({ isHovered: false })
  }

  onItemDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    // this disables react-dnd while dropping external files

    if (!this.props.isOver) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  onItemMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) {
      return
    }

    if (
      this.props.fileType != null &&
      this.props.fileType !== 'DIRECTORY' &&
      this.props.fileType !== 'ASSET_FILE'
    ) {
      this.props.setSelected(this.props)
      this.props.dispatch([EditorActions.openCodeEditorFile(this.props.path, true)], 'everyone')
      return
    }
  }

  onDragEnter = (e: React.DragEvent) => {
    // this disables react-dnd while dropping external files
    if (
      this.props.isOver ||
      (e.dataTransfer?.items != null &&
        Array.from(e.dataTransfer?.items).filter((item) => item.kind === 'file').length === 0)
    ) {
      return
    }
    this.setState((prevState) => {
      return {
        currentExternalFilesDragEventCounter: prevState.currentExternalFilesDragEventCounter + 1,
      }
    })
    const filesBeingDragged = e.dataTransfer?.items?.length ?? 0
    if (filesBeingDragged > 0) {
      this.setState({ externalFilesDraggedIn: true })
    }
  }

  onDragLeave = () => {
    this.setState((prevState) => {
      return {
        currentExternalFilesDragEventCounter: prevState.currentExternalFilesDragEventCounter - 1,
        externalFilesDraggedIn:
          prevState.currentExternalFilesDragEventCounter > 1 && prevState.externalFilesDraggedIn,
      }
    })
  }

  showAddingFileRow = () => {
    this.setState({
      adding: {
        fileOrFolder: 'file',
        filename: '',
      },
    })
  }

  showAddingFolderRow = () => {
    this.setState({
      adding: {
        fileOrFolder: 'folder',
        filename: '',
      },
    })
  }

  confirmAddingFile = () => {
    this.props.expand(this.props.path)
    applyAddingFile(this.props.dispatch, this.props.path, this.state.adding)
    this.setState({
      adding: null,
    })
  }

  inputLabelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (this.state.adding != null) {
      this.setState({
        adding: {
          ...this.state.adding,
          filename: event.target.value,
        },
      })
    }
  }

  abandonAddingFile = () => {
    this.setState({
      adding: null,
    })
  }

  inputLabelKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      this.confirmAddingFile()
    }
    if (event.key === 'Escape') {
      this.abandonAddingFile()
    }
  }

  isCurrentDropTargetForInternalFiles = () => {
    return this.props.dropTarget === this.props.path
  }

  render() {
    const isCurrentDropTargetForInternalFiles = this.isCurrentDropTargetForInternalFiles()
    const isCurrentDropTargetForExternalFiles =
      this.state.externalFilesDraggedIn && this.props.fileType === 'DIRECTORY'

    const isCurrentDropTargetForAnyFiles =
      isCurrentDropTargetForInternalFiles || isCurrentDropTargetForExternalFiles

    const extraIndentationForExport = 0
    const indentation = this.state.pathParts.length + extraIndentationForExport - 1

    const getBackground = () => {
      if (this.props.isSelected) {
        return colorTheme.subtleBackground.value
      } else if (this.state.isHovered) {
        return colorTheme.secondaryBackground.value
      } else if (isCurrentDropTargetForAnyFiles) {
        return colorTheme.brandNeonYellow.value
      } else {
        return 'transparent'
      }
    }

    const fileIconStyle = {
      marginRight: 4,
      marginLeft: 'auto',
    }

    const displayAddFolder =
      this.state.isHovered && this.props.fileType != null && this.props.fileType === 'DIRECTORY'
    const displayAddTextFile =
      this.state.isHovered && this.props.fileType != null && this.props.fileType === 'DIRECTORY'
    const displayDelete = this.state.isHovered

    let fileBrowserItem = (
      <div style={{ width: '100%' }}>
        <div
          tabIndex={0}
          onDrop={this.onItemDrop}
          onMouseEnter={this.setItemIsHovered}
          onMouseLeave={this.setItemIsNotHovered}
          onDragEnter={this.onDragEnter}
          onDragOver={this.onItemDragOver}
          onDragLeave={this.onDragLeave}
          onMouseDown={this.onItemMouseDown}
          key={this.props.key}
          className='FileItem'
          style={{
            marginLeft: 8,
            marginRight: 8,
            paddingLeft: indentation * BaseIndentationPadding,
            paddingTop: 3,
            paddingBottom: 3,
            height: UtopiaTheme.layout.rowHeight.smaller,
            display: 'flex',
            alignItems: 'center',
            opacity: this.props.isDragging ? 0.5 : undefined,
            backgroundColor: getBackground(),
            borderRadius: 2,
            position: 'relative',
          }}
        >
          <ExpandableIndicator
            key='expandable-indicator'
            visible={
              this.props.type === 'file' &&
              this.props.fileType != null &&
              this.props.fileType === 'DIRECTORY'
            }
            collapsed={this.props.collapsed}
            selected={false}
            onMouseDown={this.toggleCollapse}
          />
          {this.props.connectDragPreview(
            <div
              style={{
                ...flexRowStyle,
                overflowX: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {this.props.imageFile != null && (
                <DragHandle
                  onDragHandleStart={this.props.onDragHandleStart}
                  onDragHandleCancelled={this.props.onDragHandleCancelled}
                />
              )}
              {this.renderIcon()}
              {this.renderLabel()}
              {this.renderModifiedIcon()}
              {this.props.isUploadedAssetFile ? (
                <span
                  style={{
                    border: '1px solid primary',
                    padding: '2px 4px',
                    fontSize: 9,
                    color: colorTheme.primary.value,
                  }}
                >
                  S3
                </span>
              ) : null}
            </div>,
          )}
          {this.props.type === 'file' ? (
            <SimpleFlexRow style={{ position: 'absolute', right: '0px' }}>
              {displayAddFolder ? (
                <Button style={{ marginRight: '2px' }} onClick={this.showAddingFolderRow}>
                  <Icons.NewFolder style={fileIconStyle} tooltipText='Add New Folder' />
                </Button>
              ) : null}
              {displayAddTextFile ? (
                <Button style={{ marginRight: '2px' }} onClick={this.showAddingFileRow}>
                  <Icons.NewTextFile style={fileIconStyle} tooltipText='Add Code File' />
                </Button>
              ) : null}
              {displayDelete ? (
                <Button style={{ marginRight: '2px' }} onClick={this.delete}>
                  <Icons.Cross tooltipText='Delete' />
                </Button>
              ) : null}

              {this.props.errorMessages.length > 0 ? (
                <span style={{ margin: '0px 4px' }}>
                  <WarningIcon
                    color='error'
                    tooltipText={this.props.errorMessages
                      .map(
                        (errorMessage) =>
                          `${errorMessage.startLine}:${errorMessage.startColumn} - ${errorMessage.source}: ${errorMessage.message}`,
                      )
                      .join(`,\n`)}
                  />
                </span>
              ) : null}
            </SimpleFlexRow>
          ) : null}
        </div>
        {this.state.adding == null
          ? null
          : addingChildElement(
              indentation,
              this.state.adding.filename,
              this.inputLabelKeyDown,
              this.inputLabelChange,
              this.abandonAddingFile,
            )}
      </div>
    )

    // The context menu wrapper causes focus issues with renaming.
    if (this.props.type === 'file' && !this.state.isRenaming) {
      const contextMenuID = `file-context-menu-${this.state.filename.replace(' ', '_space_')}`
      fileBrowserItem = (
        <div
          ref={this.props.forwardedRef}
          style={{ width: '100%' }}
          key={`${contextMenuID}-wrapper`}
        >
          <ContextMenuWrapper
            id={contextMenuID}
            dispatch={this.props.dispatch}
            items={[this.deleteContextMenuItem(), this.renameContextMenuItem()]}
            data={{}}
          >
            {fileBrowserItem}
          </ContextMenuWrapper>
        </div>
      )
    }

    return fileBrowserItem
  }
}

export const FileBrowserItem: React.FC<FileBrowserItemProps> = (props: FileBrowserItemProps) => {
  const projectContents = useEditorState(
    (store) => store.editor.projectContents,
    'FileBrowserItem projectContents',
  )

  const interactionSession = useEditorState(
    (store) => store.editor.canvas.interactionSession,
    'FileBrowserItem interactionSession',
  )

  const imageDragInProgress =
    interactionSession != null && interactionSession.activeControl.type === 'BOUNDING_AREA'

  const dispatch = useEditorState((store) => store.dispatch, 'FileBrowserItem dispatch')

  const [{ isDragging }, drag, dragPreview] = useDrag(
    () => ({
      type: 'files',
      canDrag: () => !imageDragInProgress && canDragnDrop(props),
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      item: () => {
        return props
      },
      end: () => {
        dispatch([
          CanvasActions.clearInteractionSession(false),
          EditorActions.setFilebrowserDropTarget(null),
        ])
      },
    }),
    [props, imageDragInProgress],
  )
  const [{ isOver }, drop] = useDrop(
    {
      accept: 'files',
      canDrop: () => true,
      drop: (item, monitor) => {
        dispatch([
          CanvasActions.clearInteractionSession(false),
          EditorActions.switchEditorMode(EditorModes.selectMode(null)),
          EditorActions.setFilebrowserDropTarget(null),
        ])
        onDrop(props, item)
      },
      hover: (item: FileBrowserItemProps) => {
        const targetDirectory =
          props.fileType === 'DIRECTORY' ? props.path : getParentDirectory(props.path)
        // do not trigger highlight when it tries to move to it's descendant directories
        if (targetDirectory.includes(item.path) && props.dropTarget != null) {
          props.dispatch(
            [
              CanvasActions.clearInteractionSession(false),
              EditorActions.setFilebrowserDropTarget(null),
            ],
            'leftpane',
          )
        } else if (props.dropTarget !== targetDirectory) {
          props.dispatch(
            [
              CanvasActions.clearInteractionSession(false),
              EditorActions.setFilebrowserDropTarget(targetDirectory),
            ],
            'leftpane',
          )
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
      }),
    },
    [props],
  )

  const onMouseDown = React.useCallback(() => {
    if (props.imageFile == null) {
      return
    }

    const newUID = generateUidWithExistingComponents(projectContents)
    const elementSize: Size = resize(
      size(props.imageFile.width ?? 100, props.imageFile.height ?? 100),
      size(200, 200),
      'keep-aspect-ratio',
    )
    const newElement = createJsxImage(newUID, {
      width: elementSize.width,
      height: elementSize.height,
      src: imagePathURL(props.path),
    })

    props.dispatch(
      [
        EditorActions.enableInsertModeForJSXElement(newElement, newUID, {}, elementSize),
        CanvasActions.createInteractionSession(
          createInteractionViaMouse(CanvasMousePositionRaw!, emptyModifiers, boundingArea()),
        ),
      ],
      'everyone',
    )
  }, [projectContents, props])

  const onMouseUp = React.useCallback(() => {
    props.dispatch([CanvasActions.clearInteractionSession(false)])
  }, [props])

  const forwardedRef = (node: ConnectableElement) => drag(drop(node))

  return (
    <FileBrowserItemInner
      {...props}
      isDragging={isDragging}
      isOver={isOver}
      connectDragPreview={dragPreview}
      // eslint-disable-next-line react/jsx-no-bind
      forwardedRef={forwardedRef}
      onDragHandleCancelled={onMouseUp}
      onDragHandleStart={onMouseDown}
    />
  )
}

export interface DragHandleProps {
  onDragHandleCancelled: () => void
  onDragHandleStart: () => void
}

const DragHandle = (props: DragHandleProps) => {
  const { onDragHandleStart: onDragStart, onDragHandleCancelled: onDragCancelled } = props
  return (
    <div
      data-testid={'file-image-drag-handle'}
      style={{ padding: 5, cursor: 'pointer' }}
      onMouseDown={onDragStart}
      onMouseUp={onDragCancelled}
    >
      <div style={{ height: 2, width: 10, borderRadius: 2, backgroundColor: 'gray' }} />
      <div style={{ height: 2, background: 'transparent' }} />
      <div style={{ height: 2, width: 10, borderRadius: 2, backgroundColor: 'gray' }} />
      <div style={{ height: 2, background: 'transparent' }} />
      <div style={{ height: 2, width: 10, borderRadius: 2, backgroundColor: 'gray' }} />
    </div>
  )
}

/* eslint-disable jest/expect-expect */
import {
  EditorRenderResult,
  getPrintedUiJsCode,
  makeTestProjectCodeWithSnippet,
  renderTestEditorWithCode,
  TestAppUID,
  TestSceneUID,
} from '../ui-jsx.test-utils'
import * as EP from '../../../core/shared/element-path'
import { selectComponents } from '../../editor/actions/action-creators'
import { canvasPoint, CanvasVector, offsetPoint } from '../../../core/shared/math-utils'
import { ElementPath } from '../../../core/shared/project-file-types'
import { EdgePosition, edgePosition } from '../canvas-types'
import { slightlyOffsetPointBecauseVeryWeirdIssue } from '../../../utils/utils.test-utils'
import { BakedInStoryboardUID } from '../../../core/model/scene-utils'
import { mouseDownAtPoint, mouseMoveToPoint, mouseUpAtPoint } from '../event-helpers.test-utils'
import { CanvasControlsContainerID } from '../controls/new-canvas-controls'

async function dragResizeControl(
  renderResult: EditorRenderResult,
  target: ElementPath,
  pos: EdgePosition,
  dragDelta: CanvasVector,
) {
  await renderResult.dispatch([selectComponents([target], false)], true)
  const resizeControl = renderResult.renderedDOM.getByTestId(`resize-control-${pos.x}-${pos.y}`)
  const resizeControlBounds = resizeControl.getBoundingClientRect()
  const canvasControlsLayer = renderResult.renderedDOM.getByTestId(CanvasControlsContainerID)

  const startPoint = canvasPoint(
    slightlyOffsetPointBecauseVeryWeirdIssue({
      x: resizeControlBounds.x + resizeControlBounds.width / 2,
      y: resizeControlBounds.y + resizeControlBounds.height / 2,
    }),
  )

  const endPoint = offsetPoint(startPoint, dragDelta)

  mouseMoveToPoint(resizeControl, startPoint)
  mouseDownAtPoint(resizeControl, startPoint)
  mouseMoveToPoint(canvasControlsLayer, endPoint, { eventOptions: { buttons: 1 } })
  mouseUpAtPoint(canvasControlsLayer, endPoint)

  await renderResult.getDispatchFollowUpActionsFinished()
}

describe('Flex Resize', () => {
  describe('Flex resize in row', () => {
    // Corner tests
    it('resizes a flex element from edgePosition 0, 0 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(0, 0), canvasPoint({ x: 15, y: 25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 0, 0 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(0, 0), canvasPoint({ x: 15, y: -25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 0, 0 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(0, 0), canvasPoint({ x: -15, y: 25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 0, 0 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(0, 0), canvasPoint({ x: -15, y: -25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(0, 1), canvasPoint({ x: 15, y: 25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(0, 1), canvasPoint({ x: 15, y: -25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(0, 1), canvasPoint({ x: -15, y: 25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(0, 1), canvasPoint({ x: -15, y: -25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(1, 0), canvasPoint({ x: 15, y: 25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(1, 0), canvasPoint({ x: 15, y: -25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(1, 0), canvasPoint({ x: -15, y: 25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(1, 0), canvasPoint({ x: -15, y: -25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(1, 1), canvasPoint({ x: 15, y: 25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(1, 1), canvasPoint({ x: 15, y: -25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(1, 1), canvasPoint({ x: -15, y: 25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(1, 1), canvasPoint({ x: -15, y: -25 }), 65, 165)
    })
    // Edge tests
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(0, 0.5), canvasPoint({ x: 15, y: 25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(0, 0.5), canvasPoint({ x: 15, y: -25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(0, 0.5), canvasPoint({ x: -15, y: 25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(0, 0.5), canvasPoint({ x: -15, y: -25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(0.5, 0), canvasPoint({ x: 15, y: 25 }), 80, 165)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(0.5, 0), canvasPoint({ x: 15, y: -25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(0.5, 0), canvasPoint({ x: -15, y: 25 }), 80, 165)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(0.5, 0), canvasPoint({ x: -15, y: -25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(1, 0.5), canvasPoint({ x: 15, y: 25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(1, 0.5), canvasPoint({ x: 15, y: -25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(1, 0.5), canvasPoint({ x: -15, y: 25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(1, 0.5), canvasPoint({ x: -15, y: -25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (15, 25)', async () => {
      await resizeTestRow(edgePosition(0.5, 1), canvasPoint({ x: 15, y: 25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (15, -25)', async () => {
      await resizeTestRow(edgePosition(0.5, 1), canvasPoint({ x: 15, y: -25 }), 80, 165)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (-15, 25)', async () => {
      await resizeTestRow(edgePosition(0.5, 1), canvasPoint({ x: -15, y: 25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (-15, -25)', async () => {
      await resizeTestRow(edgePosition(0.5, 1), canvasPoint({ x: -15, y: -25 }), 80, 165)
    })
  })

  describe('Flex resize in column', () => {
    // Corner tests
    it('resizes a flex element from edgePosition 0, 0 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(0, 0), canvasPoint({ x: 15, y: 25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 0, 0 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(0, 0), canvasPoint({ x: 15, y: -25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 0, 0 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(0, 0), canvasPoint({ x: -15, y: 25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 0, 0 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(0, 0), canvasPoint({ x: -15, y: -25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(0, 1), canvasPoint({ x: 15, y: 25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(0, 1), canvasPoint({ x: 15, y: -25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(0, 1), canvasPoint({ x: -15, y: 25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 0, 1 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(0, 1), canvasPoint({ x: -15, y: -25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(1, 0), canvasPoint({ x: 15, y: 25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(1, 0), canvasPoint({ x: 15, y: -25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(1, 0), canvasPoint({ x: -15, y: 25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 1, 0 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(1, 0), canvasPoint({ x: -15, y: -25 }), 65, 215)
    })
    // Edge tests
    it('resizes a flex element from edgePosition 1, 1 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(1, 1), canvasPoint({ x: 15, y: 25 }), 95, 215)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(1, 1), canvasPoint({ x: 15, y: -25 }), 95, 165)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(1, 1), canvasPoint({ x: -15, y: 25 }), 65, 215)
    })
    it('resizes a flex element from edgePosition 1, 1 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(1, 1), canvasPoint({ x: -15, y: -25 }), 65, 165)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(0, 0.5), canvasPoint({ x: 15, y: 25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(0, 0.5), canvasPoint({ x: 15, y: -25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(0, 0.5), canvasPoint({ x: -15, y: 25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 0, 0.5 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(0, 0.5), canvasPoint({ x: -15, y: -25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 0), canvasPoint({ x: 15, y: 25 }), 80, 165)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 0), canvasPoint({ x: 15, y: -25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 0), canvasPoint({ x: -15, y: 25 }), 80, 165)
    })
    it('resizes a flex element from edgePosition 0.5, 0 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 0), canvasPoint({ x: -15, y: -25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(1, 0.5), canvasPoint({ x: 15, y: 25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(1, 0.5), canvasPoint({ x: 15, y: -25 }), 95, 190)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(1, 0.5), canvasPoint({ x: -15, y: 25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 1, 0.5 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(1, 0.5), canvasPoint({ x: -15, y: -25 }), 65, 190)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (15, 25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 1), canvasPoint({ x: 15, y: 25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (15, -25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 1), canvasPoint({ x: 15, y: -25 }), 80, 165)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (-15, 25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 1), canvasPoint({ x: -15, y: 25 }), 80, 215)
    })
    it('resizes a flex element from edgePosition 0.5, 1 with drag vector (-15, -25)', async () => {
      await resizeTestColumn(edgePosition(0.5, 1), canvasPoint({ x: -15, y: -25 }), 80, 165)
    })
  })

  describe('when the element has missing dimensions', () => {
    describe('both missing', () => {
      describe('horizontal movement', () => {
        it('adds only the width', async () => {
          await resizeWithoutDimensions(
            edgePosition(1, 0),
            canvasPoint({ x: 15, y: 0 }),
            {},
            { width: 15 },
          )
        })
      })

      describe('vertical movement', () => {
        it('adds only the height', async () => {
          await resizeWithoutDimensions(
            edgePosition(0, 0),
            canvasPoint({ x: 0, y: 15 }),
            {},
            { height: 385 },
          )
        })
      })

      describe('diagonal movement', () => {
        it('adds width and height', async () => {
          await resizeWithoutDimensions(
            edgePosition(0, 0),
            canvasPoint({ x: 10, y: 15 }),
            {},
            { width: 10, height: 385 },
          )
        })
      })
    })

    describe('width missing', () => {
      describe('horizontal movement', () => {
        it('updates only the width', async () => {
          await resizeWithoutDimensions(
            edgePosition(1, 0),
            canvasPoint({ x: 15, y: 0 }),
            { height: 10 },
            { height: 10, width: 15 },
          )
        })
      })

      describe('vertical movement', () => {
        it('does not add the width', async () => {
          await resizeWithoutDimensions(
            edgePosition(0, 0),
            canvasPoint({ x: 0, y: 15 }),
            { height: 20 },
            { height: 5 },
          )
        })
      })

      describe('diagonal movement', () => {
        it('adds the width and updates height', async () => {
          await resizeWithoutDimensions(
            edgePosition(0, 0),
            canvasPoint({ x: 10, y: 15 }),
            { height: 20 },
            { height: 5, width: 10 },
          )
        })
      })
    })

    describe('height missing', () => {
      describe('horizontal movement', () => {
        it('updates only the width', async () => {
          await resizeWithoutDimensions(
            edgePosition(1, 0),
            canvasPoint({ x: 15, y: 0 }),
            { width: 15 },
            { width: 30 },
          )
        })
      })

      describe('vertical movement', () => {
        it('does not change the width', async () => {
          await resizeWithoutDimensions(
            edgePosition(0, 0),
            canvasPoint({ x: 0, y: 15 }),
            { width: 15 },
            { width: 15, height: 385 },
          )
        })
      })

      describe('diagonal movement', () => {
        it('adds the height and updates width', async () => {
          await resizeWithoutDimensions(
            edgePosition(0, 0),
            canvasPoint({ x: 10, y: 15 }),
            { width: 15 },
            { width: 5, height: 385 },
          )
        })
      })
    })
  })
})

async function resizeTestRow(
  pos: EdgePosition,
  dragVector: CanvasVector,
  expectedWidth: number,
  expextedHeight: number,
) {
  const inputCode = makeTestProjectCodeWithSnippet(`
      <div
        data-uid='aaa'
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          position: 'relative',
          display: 'flex',
          gap: 10,
        }}
      >
        <div
          data-uid='bbb'
          data-testid='bbb'
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            backgroundColor: '#d3d3d3',
          }}
        />
        <div
          data-uid='ccc'
          style={{
            width: 80,
            height: 190,
            backgroundColor: '#FF0000',
          }}
        />
        <div
          data-uid='ddd'
          style={{
            width: 50,
            height: 110,
            backgroundColor: '#FF0000',
          }}
        />
      </div>
    `)

  const renderResult = await renderTestEditorWithCode(inputCode, 'await-first-dom-report')
  const target = EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:aaa/ccc`)

  await dragResizeControl(renderResult, target, pos, dragVector)

  expect(getPrintedUiJsCode(renderResult.getEditorState())).toEqual(
    makeTestProjectCodeWithSnippet(`
      <div
        data-uid='aaa'
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          position: 'relative',
          display: 'flex',
          gap: 10,
        }}
      >
        <div
          data-uid='bbb'
          data-testid='bbb'
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            backgroundColor: '#d3d3d3',
          }}
        />
        <div
          data-uid='ccc'
          style={{
            width: ${expectedWidth},
            height: ${expextedHeight},
            backgroundColor: '#FF0000',
          }}
        />
        <div
          data-uid='ddd'
          style={{
            width: 50,
            height: 110,
            backgroundColor: '#FF0000',
          }}
        />
      </div>
      `),
  )
}

async function resizeTestColumn(
  pos: EdgePosition,
  dragVector: CanvasVector,
  expectedWidth: number,
  expextedHeight: number,
) {
  const inputCode = makeTestProjectCodeWithSnippet(`
      <div
        data-uid='aaa'
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          data-uid='bbb'
          data-testid='bbb'
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            backgroundColor: '#d3d3d3',
          }}
        />
        <div
          data-uid='ccc'
          style={{
            width: 80,
            height: 190,
            backgroundColor: '#FF0000',
          }}
        />
        <div
          data-uid='ddd'
          style={{
            width: 50,
            height: 110,
            backgroundColor: '#FF0000',
          }}
        />
      </div>
    `)

  const renderResult = await renderTestEditorWithCode(inputCode, 'await-first-dom-report')
  const target = EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:aaa/ccc`)

  await dragResizeControl(renderResult, target, pos, dragVector)

  expect(getPrintedUiJsCode(renderResult.getEditorState())).toEqual(
    makeTestProjectCodeWithSnippet(`
      <div
        data-uid='aaa'
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          data-uid='bbb'
          data-testid='bbb'
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            backgroundColor: '#d3d3d3',
          }}
        />
        <div
          data-uid='ccc'
          style={{
            width: ${expectedWidth},
            height: ${expextedHeight},
            backgroundColor: '#FF0000',
          }}
        />
        <div
          data-uid='ddd'
          style={{
            width: 50,
            height: 110,
            backgroundColor: '#FF0000',
          }}
        />
      </div>
      `),
  )
}

const resizeWithoutDimensions = async (
  pos: EdgePosition,
  dragVector: CanvasVector,
  initialDimensions: { width?: number; height?: number },
  expectDimensions: { width?: number; height?: number },
) => {
  const inputCode = makeTestProjectCodeWithSnippet(`
      <div
        data-uid='aaa'
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          position: 'relative',
          display: 'flex',
          gap: 10,
        }}
      >
        <div
          data-uid='bbb'
          data-testid='bbb'
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            backgroundColor: '#d3d3d3',
          }}
        />
        <div
          data-uid='ccc'
          style={
            ${JSON.stringify({ backgroundColor: '#f0f', ...initialDimensions })}
          }
        />
        <div
          data-uid='ddd'
          style={{
            width: 50,
            height: 110,
            backgroundColor: '#FF0000',
          }}
        />
      </div>
    `)

  const renderResult = await renderTestEditorWithCode(inputCode, 'await-first-dom-report')
  const target = EP.fromString(`${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:aaa/ccc`)

  await dragResizeControl(renderResult, target, pos, dragVector)

  expect(getPrintedUiJsCode(renderResult.getEditorState())).toEqual(
    makeTestProjectCodeWithSnippet(`
      <div
        data-uid='aaa'
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          position: 'relative',
          display: 'flex',
          gap: 10,
        }}
      >
        <div
          data-uid='bbb'
          data-testid='bbb'
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            backgroundColor: '#d3d3d3',
          }}
        />
        <div
          data-uid='ccc'
          style={
            ${JSON.stringify({ backgroundColor: '#f0f', ...expectDimensions })}
          }
        />
        <div
          data-uid='ddd'
          style={{
            width: 50,
            height: 110,
            backgroundColor: '#FF0000',
          }}
        />
      </div>
      `),
  )
}

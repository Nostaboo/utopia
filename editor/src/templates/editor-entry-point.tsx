// import * as React from 'react'
// const whyDidYouRender = require('@welldone-software/why-did-you-render')
// whyDidYouRender(React, {
//   trackAllPureComponents: true,
// })

import '../vite-shims'

// import feature switches so they are loaded before anything else can read them
import '../utils/feature-switches'

// Fire off server requests that later block, to improve initial load on slower connections. These will still block,
// but this gives us a chance to cache the result first
import { getLoginState } from '../common/server'
import { triggerHashedAssetsUpdate, preloadPrioritizedAssets } from '../utils/hashed-assets'

void getLoginState('no-cache')
void triggerHashedAssetsUpdate().then(() => preloadPrioritizedAssets())

import { addStyleSheetToPage } from '../core/shared/dom-utils'
import { STATIC_BASE_URL } from '../common/env-vars'

const editorCSS = [
  `${STATIC_BASE_URL}editor/css/initial-load.css`,
  `${STATIC_BASE_URL}editor/css/canvas.css`,
  `${STATIC_BASE_URL}editor/css/slider.css`,
  `${STATIC_BASE_URL}editor/css/ReactContexify.css`,
  `${STATIC_BASE_URL}editor/css/codicons.css`,
]

// Queue up further CSS downloads before going any further
editorCSS.forEach((url) => addStyleSheetToPage(url, true))

import { Editor } from './editor'
import { applyUIDMonkeyPatch } from '../utils/canvas-react-utils'

applyUIDMonkeyPatch()

// eslint-disable-next-line
const EditorRunner = new Editor()

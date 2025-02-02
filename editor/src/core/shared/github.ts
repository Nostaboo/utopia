import { UTOPIA_BACKEND } from '../../common/env-vars'
import urljoin from 'url-join'
import { GithubRepo, PersistentModel } from '../../components/editor/store/editor-state'
import { trimUpToAndIncluding } from './string-utils'
import { HEADERS, MODE } from '../../common/server'
import { EditorDispatch } from '../../components/editor/action-types'
import { notice } from '../../components/common/notice'
import { showToast, updateProjectContents } from '../../components/editor/actions/action-creators'
import { ProjectContentTreeRoot } from '../../components/assets'

export function parseGithubProjectString(maybeProject: string): GithubRepo | null {
  const withoutGithubPrefix = trimUpToAndIncluding('github.com/', maybeProject)

  const repoParts = withoutGithubPrefix.split('/')
  const owner = repoParts[0] ?? ''
  const repo = repoParts[1] ?? ''

  if (owner === '' || repo === '') {
    return null
  } else {
    return {
      owner: owner,
      repository: repo,
    }
  }
}

export interface SaveToGithubSuccess {
  type: 'SUCCESS'
  branchName: string
  url: string
}

export interface GithubFailure {
  type: 'FAILURE'
  failureReason: string
}

export type SaveToGithubResponse = SaveToGithubSuccess | GithubFailure

export interface GetBranchesBranch {
  name: string
}

export type GetBranchesResult = Array<GetBranchesBranch>

export interface GetBranchesSuccess {
  type: 'SUCCESS'
  branches: GetBranchesResult
}

export type GetBranchesResponse = GetBranchesSuccess | GithubFailure

export interface GetBranchContentSuccess {
  type: 'SUCCESS'
  content: ProjectContentTreeRoot
}

export type GetBranchContentResponse = GetBranchContentSuccess | GithubFailure

export async function saveProjectToGithub(
  persistentModel: PersistentModel,
  dispatch: EditorDispatch,
): Promise<void> {
  const url = urljoin(UTOPIA_BACKEND, 'github', 'save')

  const postBody = JSON.stringify(persistentModel)
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: HEADERS,
    mode: MODE,
    body: postBody,
  })
  if (response.ok) {
    const responseBody: SaveToGithubResponse = await response.json()
    switch (responseBody.type) {
      case 'FAILURE':
        dispatch(
          [
            showToast(
              notice(`Error when saving to Github: ${responseBody.failureReason}`, 'ERROR'),
            ),
          ],
          'everyone',
        )
        break
      case 'SUCCESS':
        dispatch(
          [showToast(notice(`Saved to branch ${responseBody.branchName}.`, 'INFO'))],
          'everyone',
        )
        break
      default:
        const _exhaustiveCheck: never = responseBody
        throw new Error(`Unhandled response body ${JSON.stringify(responseBody)}`)
    }
  } else {
    dispatch(
      [showToast(notice(`Unexpected status returned from endpoint: ${response.status}`, 'ERROR'))],
      'everyone',
    )
  }
}

export async function getBranchesForGithubRepository(
  githubRepo: GithubRepo,
): Promise<GetBranchesResponse> {
  const url = urljoin(UTOPIA_BACKEND, 'github', 'branches', githubRepo.owner, githubRepo.repository)

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: HEADERS,
    mode: MODE,
  })
  if (response.ok) {
    const responseBody: GetBranchesResponse = await response.json()
    return responseBody
  } else {
    return {
      type: 'FAILURE',
      failureReason: 'Server error.',
    }
  }
}

export async function getBranchContent(
  dispatch: EditorDispatch,
  githubRepo: GithubRepo,
  branchName: string,
): Promise<void> {
  const url = urljoin(
    UTOPIA_BACKEND,
    'github',
    'branches',
    githubRepo.owner,
    githubRepo.repository,
    branchName,
  )

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: HEADERS,
    mode: MODE,
  })
  if (response.ok) {
    const responseBody: GetBranchContentResponse = await response.json()
    switch (responseBody.type) {
      case 'FAILURE':
        dispatch(
          [
            showToast(
              notice(`Error when saving to Github: ${responseBody.failureReason}`, 'ERROR'),
            ),
          ],
          'everyone',
        )
        break
      case 'SUCCESS':
        dispatch(
          [
            updateProjectContents(responseBody.content),
            showToast(notice(`Updated the project with the content from ${branchName}`, 'SUCCESS')),
          ],
          'everyone',
        )
        break
      default:
        const _exhaustiveCheck: never = responseBody
        throw new Error(`Unhandled response body ${JSON.stringify(responseBody)}`)
    }
  } else {
    dispatch(
      [showToast(notice(`Unexpected status returned from endpoint: ${response.status}`, 'ERROR'))],
      'everyone',
    )
  }
}

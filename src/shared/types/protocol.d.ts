/* UI */

type Preferences = {
  darkThemeEnabled: boolean
  rawModeEnabled: boolean
}

type RawPanelPreferences = {
  rawModeFollowRedirect: boolean
  rawModeAutoRenderEnabled: boolean
}

/* Request */

type Header = {
  enabled: boolean
  name: string
  value: string
  removeIfEmptyValue: boolean
  _createdAt: number // Only used in UI
}

type BrowseRequest = {
  cookiePolicy?: 'default' | 'omit' | 'override'
  method: string
  url: string
  body: {
    enctype: string
    content: string
  }
  headers: Array<Header>
  followRedirect: boolean // Only used in Raw mode
  timeoutMs?: number
}

type PostFile = {
  name: string
  type: string
  data: Blob
}

type TextPostField = {
  type: 'input' | 'textarea'
  name: string
  value: string
}

type FilePostField = {
  type: 'file'
  name: string
  file: PostFile
}

type PostField = TextPostField | FilePostField

type PostInfo = {
  contentTypeArguments: Record<string, string>
  fields: Array<PostField>
}

type CustomPayload = {
  name: string
  value: string
  category: string
}

type TestRequest = {
  action: 'start' | 'toggle' | 'stop'
  script?: string
  argument: any
}

type BackgroundFunctionType =
  | 'init'
  | 'load'
  | 'execute'
  | 'cancel'
  | 'ping'
  | 'evidence'
  | 'history'
  | 'test'
  | 'render'

interface BackgroundFunctionMessage {
  tabId: number
  type: BackgroundFunctionType
}

interface BackgroundInitMessage extends BackgroundFunctionMessage {
  type: Extract<BackgroundFunctionType, 'init'>
}

interface BackgroundLoadMessage extends BackgroundFunctionMessage {
  type: Extract<BackgroundFunctionType, 'load'>
  loadId?: string
  draftOnly?: boolean
  reload?: boolean
}

interface BackgroundExecuteMessage extends BackgroundFunctionMessage {
  type: Extract<BackgroundFunctionType, 'execute'>
  data: {
    rawMode: boolean
    request: BrowseRequest
    requestId?: string
  }
}

interface BackgroundPingMessage extends BackgroundFunctionMessage {
  type: 'ping'
}

interface BackgroundHistoryMessage extends BackgroundFunctionMessage {
  type: 'history'
  data: import('@/features/history/model/request-history').HistoryAction
}

interface BackgroundCancelMessage extends BackgroundFunctionMessage {
  type: 'cancel'
  data: { requestId: string }
}

interface BackgroundTestMessage extends BackgroundFunctionMessage {
  type: Extract<BackgroundFunctionType, 'test'>
  data: TestRequest
}

interface BackgroundRenderMessage extends BackgroundFunctionMessage {
  type: Extract<BackgroundFunctionType, 'render'>
  data: BrowseResponse
}

/* Response */

type HttpHeader = {
  name: string
  value: string
}

type BrowseResponse = {
  protocolVersion: string
  statusCode: number
  statusMessage: string
  baseUrl: string
  headers: Array<HttpHeader>
  body: string
  durationMs?: number
  bodyBytes?: number
  bodyUnavailable?: boolean
}

type TestProgress = {
  status: string
  percentage: number
}

type TestResultData = Record<string, string>

type TestResult = {
  header: Array<{
    text: string
    value: string
  }>
  data: Array<TestResultData>
}

type DevtoolsFunctionType =
  | 'load'
  | 'execute'
  | 'test'
  | 'command'
  | 'error'
  | 'evidence'
  | 'history'
  | 'ready'

interface DevtoolsHistoryMessage extends DevtoolsFunctionMessage {
  type: 'history'
  data?: import('@/features/history/model/request-history').HistorySnapshot
  error?: string
}

interface DevtoolsFunctionMessage {
  type: DevtoolsFunctionType
}

interface DevtoolsLoadMessage extends DevtoolsFunctionMessage {
  type: Extract<DevtoolsFunctionType, 'load'>
  data: BrowseRequest | undefined
  loadId?: string
  source?: 'captured' | 'draft'
  reason?:
    | 'partial'
    | 'no-record'
    | 'permission'
    | 'unsupported'
    | 'unavailable'
    | 'navigating'
  detail?: string
}

interface DevtoolsReadyMessage extends DevtoolsFunctionMessage {
  type: 'ready'
}

interface DevtoolsExecuteMessage extends DevtoolsFunctionMessage {
  type: Extract<DevtoolsFunctionType, 'execute'>
  data: BrowseResponse | undefined
  requestId?: string
  durationMs?: number
}

interface DevtoolsCommandMessage extends DevtoolsFunctionMessage {
  type: Extract<DevtoolsFunctionType, 'command'>
  data: 'load_url' | 'split_url' | 'execute_url' | 'switch_mode'
}

interface DevtoolsErrorMessage extends DevtoolsFunctionMessage {
  type: Extract<DevtoolsFunctionType, 'error'>
  data: string
  requestId?: string
  operation?: BackgroundFunctionType
  code?: 'cancelled' | 'timeout' | 'failed'
}

interface DevtoolsTestMessage extends DevtoolsFunctionMessage {
  type: Extract<DevtoolsFunctionType, 'test'>
  data:
    | {
        type: 'progress'
        data: TestProgress
      }
    | {
        type: 'finished'
        data: TestResult
      }
    | {
        type: 'error'
        data: string
      }
}

interface BackgroundEvidenceMessage extends BackgroundFunctionMessage {
  type: 'evidence'
  actionId: string
  data: import('@/features/evidence/model/evidence-store').EvidenceAction
}
interface DevtoolsEvidenceMessage extends DevtoolsFunctionMessage {
  type: 'evidence'
  actionId?: string
  data?: import('@/features/evidence/model/evidence-store').EvidenceSnapshot
  error?: string
}

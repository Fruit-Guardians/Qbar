import {
  mdiArrowTopRight,
  mdiConsoleLine,
  mdiMenuDown,
  mdiTrayArrowDown,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from '@mdi/js'
import { nextTick, onMounted, onUnmounted, provide, reactive, ref } from 'vue'
import { VAppBar } from 'vuetify/components'
import browser from 'webextension-polyfill'
import packageJson from '../../../package.json'
import { type ConnectionState, createPanelConnection } from './panel-connection'
import { useEditorTools } from './use-editor-tools'
import { usePanelTheme } from './use-panel-theme'
import { AppBarKey, ControlTestKey, LoadFromKey } from '@/app/context'
import { useEvidence } from '@/features/evidence/composables/use-evidence'
import type {
  HistoryAction,
  HistoryEntry,
  HistorySnapshot,
} from '@/features/history/model/request-history'
import BasicRequestEditor from '@/features/request/components/BasicRequestEditor.vue'
import RawRequestEditor from '@/features/request/components/RawRequestEditor.vue'
import {
  createLoadGuard,
  loadFeedback,
} from '@/features/request/model/load-feedback'
import {
  prepareExecutionRequest,
  toCurl,
} from '@/features/request/model/request'
import bodyProcessors from '@/features/request/processors/index'
import type { Exchange } from '@/features/workbench/model/exchange-diff'
import {
  type CapturedRequest,
  type NetworkApi,
  createNetworkCapture,
} from '@/features/workbench/model/network-capture'
import { NetworkCaptureKey } from '@/features/workbench/model/network-context'
import { createRepeaterTabs } from '@/features/workbench/model/repeater-tabs'
import { openExtensionPermissionGrantPage } from '@/shared/lib/browser'

export function usePanelWorkspace() {
  /* DOM element and refs */
  const appBar = ref<InstanceType<typeof VAppBar>>()
  const requestPanel =
    ref<InstanceType<typeof BasicRequestEditor | typeof RawRequestEditor>>()

  provide(AppBarKey, appBar)

  /* Dialog */
  const curlCommandLoaderDialog = ref({
    show: false,
  })
  const testProgressDialog = ref({
    show: false,
    percentage: 0,
    status: '',
    error: '',
    result: null as TestResult | null,
  })
  /* Snackbar */
  const snackbar = ref({
    show: false,
    text: '',
  })
  const {
    sqlInjectionDialog,
    reverseShellDialog,
    customPayloadDialog,
    onFocus,
    clearEditorFocus,
  } = useEditorTools(snackbar)
  /* HTTP Request / Response */
  const request = reactive<BrowseRequest>({
    method: 'GET',
    url: '',
    body: {
      content: '',
      enctype: bodyProcessors.getDefaultProcessorName(),
    },
    cookiePolicy: 'default',
    headers: [],
    followRedirect: false,
    timeoutMs: 30000,
  })
  const response = ref<BrowseResponse>()
  const lastExchange = ref<Exchange>()
  const lastAttempt = ref<Exchange>()
  let sentRequest: BrowseRequest | undefined
  const historyOpen = ref(false)
  const historySnapshot = ref<HistorySnapshot>()
  const historyError = ref('')
  const isSending = ref(false)
  const pendingRequestId = ref('')
  const executionStatus = ref('Ready')
  const elapsedMs = ref(0)
  const lastDurationMs = ref<number | null>(null)
  const copyNotice = ref('')
  let acknowledgementTimer: ReturnType<typeof setTimeout> | undefined
  let sendStarted = 0
  let elapsedTimer: ReturnType<typeof setInterval> | undefined
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const finishRequest = () => {
    sentRequest = undefined
    clearTimeout(acknowledgementTimer)
    isSending.value = false
    if (elapsedTimer) clearInterval(elapsedTimer)
    elapsedTimer = undefined
  }
  let restoringTab = false
  /* Mode / Status */
  const isRawMode = ref(false)

  const enableRawMode = (enabled: boolean) => {
    if (isSending.value) return
    if (!enabled && !['GET', 'POST'].includes(request.method)) return
    if (isRawMode.value !== enabled) {
      clearEditorFocus()
    }

    void browser.storage.local.set({ rawModeEnabled: enabled }).catch(() => {
      snackbar.value = {
        show: true,
        text: 'Editor mode applied to this panel; saving the preference failed.',
      }
    })
    isRawMode.value = enabled
  }

  /* Communication */
  const connectionState = ref<ConnectionState>('connecting')
  const loadNotice = ref('')
  const loadReason = ref<DevtoolsLoadMessage['reason']>()
  const requestSource = ref('')
  const captureRows = ref<CapturedRequest[]>([]),
    captureError = ref('')
  const captureController = browser.devtools?.network
    ? createNetworkCapture(
        browser.devtools.network as unknown as NetworkApi,
        (rows, error) => {
          captureRows.value = rows
          captureError.value = error
        },
      )
    : undefined
  provide(NetworkCaptureKey, {
    rows: captureRows,
    error: captureError,
    refresh: async () => {
      await captureController?.refresh()
    },
    clear: () => captureController?.clear(),
  })
  onMounted(() => captureController?.start())
  const evidence = useEvidence(message =>
    connection.send({
      ...message,
      tabId: browser.devtools.inspectedWindow.tabId,
    }),
  )
  const loading = ref(false)
  const diagnostic = ref('')
  const loadGuard = createLoadGuard()
  let activeLoadId = ''
  let initialDraft = true
  let loadTimer: ReturnType<typeof setTimeout> | undefined
  const clearLoad = () => {
    loading.value = false
    clearTimeout(loadTimer)
  }
  const tabs = createRepeaterTabs({
    read: () => ({
      request,
      rawMode: isRawMode.value,
      response: response.value,
      exchange: lastExchange.value,
      attempt: lastAttempt.value,
      status: executionStatus.value,
      duration: lastDurationMs.value,
      source: requestSource.value,
    }),
    empty: () => ({
      request: {
        method: 'GET',
        url: '',
        body: {
          content: '',
          enctype: bodyProcessors.getDefaultProcessorName(),
        },
        headers: [],
        followRedirect: request.followRedirect,
        timeoutMs: request.timeoutMs,
      },
      rawMode: isRawMode.value,
      status: 'Ready',
      duration: null,
      source: '',
    }),
    busy: () => isSending.value,
    apply: draft => {
      restoringTab = true
      loadGuard.clear()
      clearLoad()
      loadNotice.value = ''
      loadReason.value = undefined
      clearEditorFocus()
      Object.assign(request, draft.request, {
        cookiePolicy: draft.request.cookiePolicy || 'default',
      })
      isRawMode.value = draft.rawMode
      response.value = draft.response
      lastExchange.value = draft.exchange
      lastAttempt.value = draft.attempt
      executionStatus.value = draft.status
      lastDurationMs.value = draft.duration
      requestSource.value = draft.source
      pendingRequestId.value = ''
      diagnostic.value = ''
      copyNotice.value = ''
      void nextTick(() => {
        restoringTab = false
      })
    },
  })
  const load = (options: { draftOnly?: boolean; reload?: boolean } = {}) => {
    if (isSending.value || loading.value) return
    const loadId = crypto.randomUUID()
    activeLoadId = loadId
    loadGuard.begin(loadId, request)
    loading.value = true
    loadNotice.value = options.reload
      ? 'Reloading page to capture its request…'
      : 'Reading page information…'
    loadTimer = setTimeout(() => {
      loadGuard.clear()
      clearLoad()
      loadNotice.value = 'Load timed out. Check the connection and retry.'
    }, 17000)
    if (
      !connection.send({
        tabId: browser.devtools.inspectedWindow.tabId,
        type: 'load',
        loadId,
        ...options,
      })
    ) {
      loadGuard.clear()
      clearLoad()
      loadNotice.value =
        'Background disconnected. Reconnecting; your editor is unchanged.'
    }
  }
  const refreshAndLoad = () => load({ reload: true })
  const copyDiagnostics = async () => {
    const summary = [
      `QBar ${packageJson.version}`,
      `Connection: ${connectionState.value}`,
      `Status: ${executionStatus.value}`,
      `Load: ${loadReason.value ?? 'none'}`,
      `Transport: ${isRawMode.value ? 'Raw' : 'Basic'}`,
      `Timeout: ${request.timeoutMs ?? 30000} ms`,
      // No URL, headers, body, or raw server error text is copied.
      `Failure category: ${diagnostic.value || 'none'}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(summary)
      copyNotice.value = 'Diagnostics copied (no request data)'
    } catch (_) {
      snackbar.value = {
        show: true,
        text: 'Clipboard access failed. Select and copy the visible status instead.',
      }
    }
  }

  const loadFrom = (
    source: BrowseRequest,
    options: { rawMode?: boolean; preserveOptions?: boolean } = {},
  ) => {
    if (isSending.value) {
      snackbar.value.text =
        'Wait for the running request or cancel it before loading another request.'
      snackbar.value.show = true
      return
    }
    loadNotice.value = ''
    loadReason.value = undefined
    loadGuard.clear()
    clearLoad()
    requestSource.value = 'Edited / imported request'
    request.cookiePolicy = source.cookiePolicy || 'default'
    request.method = source.method
    request.url = source.url
    request.body = JSON.parse(JSON.stringify(source.body))
    request.headers = JSON.parse(JSON.stringify(source.headers))
    if (options.preserveOptions) {
      request.followRedirect = source.followRedirect
      request.timeoutMs = source.timeoutMs ?? 30000
    }
    if (options.rawMode !== undefined) enableRawMode(options.rawMode)
    if (!['GET', 'POST'].includes(source.method.toUpperCase()))
      enableRawMode(true)
    response.value = undefined
    lastAttempt.value = undefined
    pendingRequestId.value = ''
    executionStatus.value = 'Ready'
    lastDurationMs.value = null
    nextTick(() => requestPanel.value?.focus())
  }

  const split = () => {
    if (isRawMode.value) {
      return
    }

    request.url = request.url.replace(/[^\n][?&#]/g, str => {
      return str[0] + '\n' + str[1]
    })

    request.body.content = bodyProcessors
      .find(request.body.enctype)!
      .format(request.body.content)
  }

  const execute = () => {
    if (
      isSending.value ||
      !request.url.trim() ||
      connectionState.value !== 'connected'
    )
      return
    loadGuard.clear()
    clearLoad()
    diagnostic.value = ''
    let snapshot: BrowseRequest
    try {
      requestPanel.value?.validate()
      const execution = prepareExecutionRequest(request, isRawMode.value)
      snapshot = execution.request
      if (execution.rawMode && !isRawMode.value) {
        Object.assign(request, snapshot)
        enableRawMode(true)
      }
    } catch (error) {
      snackbar.value.text = (error as Error).message
      snackbar.value.show = true
      diagnostic.value = 'validation'
      executionStatus.value = 'Failed'
      lastDurationMs.value = null
      return
    }
    if (!['GET', 'POST'].includes(snapshot.method)) enableRawMode(true)
    sentRequest = JSON.parse(JSON.stringify(snapshot))
    pendingRequestId.value = crypto.randomUUID()
    isSending.value = true
    lastAttempt.value = undefined
    response.value = undefined
    executionStatus.value = 'Sending'
    lastDurationMs.value = null
    sendStarted = Date.now()
    elapsedMs.value = 0
    elapsedTimer = setInterval(() => {
      elapsedMs.value = Date.now() - sendStarted
      // Keep the MV3 worker connected while waiting for a slow response.
      if (elapsedMs.value % 20000 < 1000)
        connection.send({
          tabId: browser.devtools.inspectedWindow.tabId,
          type: 'ping',
        })
    }, 1000)
    acknowledgementTimer = setTimeout(
      unknownOutcome,
      (snapshot.timeoutMs ?? 30000) + 10000,
    )
    try {
      const sent = connection.send({
        tabId: browser.devtools.inspectedWindow.tabId,
        type: 'execute',
        data: {
          rawMode: isRawMode.value,
          request: snapshot,
          requestId: pendingRequestId.value,
        },
      })
      if (!sent)
        throw new Error(
          'Connection interrupted. The request was not automatically retried.',
        )
    } catch (error) {
      recordAttempt('Connection interrupted', (error as Error).message)
      finishRequest()
      executionStatus.value = 'Failed'
      snackbar.value.text = (error as Error).message
      snackbar.value.show = true
    }
  }
  function recordAttempt(outcome: string, error?: string) {
    if (!sentRequest) return
    lastAttempt.value = {
      request: JSON.parse(JSON.stringify(sentRequest)),
      durationMs: Date.now() - sendStarted,
      outcome,
      error,
      completedAt: Date.now(),
      rawMode: isRawMode.value,
    }
  }
  function unknownOutcome() {
    if (!isSending.value) return
    recordAttempt(
      'Connection interrupted',
      'No terminal acknowledgement; server outcome unknown; not retried.',
    )
    finishRequest()
    pendingRequestId.value = ''
    executionStatus.value = 'Connection interrupted'
    diagnostic.value = 'acknowledgement-missing; outcome unknown; not retried'
    loadNotice.value =
      'No completion acknowledgement was received. The request may have reached the server; reconnecting without retrying.'
    connection.reconnect()
  }
  const cancelRequest = () => {
    if (!isSending.value || executionStatus.value === 'Cancelling…') return
    try {
      const sent = connection.send({
        tabId: browser.devtools.inspectedWindow.tabId,
        type: 'cancel',
        data: { requestId: pendingRequestId.value },
      })
      if (!sent) throw new Error('Connection interrupted')
      executionStatus.value = 'Cancelling…'
      clearTimeout(acknowledgementTimer)
      acknowledgementTimer = setTimeout(unknownOutcome, 5000)
    } catch (_) {
      recordAttempt(
        'Connection interrupted',
        'Cancellation could not be confirmed; server outcome unknown.',
      )
      finishRequest()
      executionStatus.value = 'Connection interrupted'
    }
  }
  const writeCurl = async (source: BrowseRequest, rawMode: boolean) => {
    try {
      const command = toCurl(source, rawMode)
      await navigator.clipboard.writeText(command)
      copyNotice.value = 'cURL copied'
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => {
        copyNotice.value = ''
      }, 2500)
    } catch (error) {
      snackbar.value.text = (error as Error).message
      snackbar.value.show = true
    }
  }
  const copyCurl = () => {
    try {
      requestPanel.value?.validate()
    } catch (error) {
      snackbar.value.text = (error as Error).message
      snackbar.value.show = true
      return
    }
    return writeCurl(request, isRawMode.value)
  }
  const copyHistoryCurl = (entry: HistoryEntry) =>
    writeCurl(entry.request, entry.rawMode)
  const historyAction = (action: HistoryAction) => {
    historyError.value = ''
    try {
      if (
        !connection.send({
          tabId: browser.devtools.inspectedWindow.tabId,
          type: 'history',
          data: action,
        })
      )
        historyError.value =
          'Background disconnected. Retry after reconnection.'
    } catch (error) {
      historyError.value = (error as Error).message
    }
  }
  const closeHistory = () => {
    historyOpen.value = false
    nextTick(() =>
      document.querySelector<HTMLButtonElement>('.history-toggle')?.focus(),
    )
  }
  const toggleHistory = () => {
    if (historyOpen.value) {
      closeHistory()
      return
    }
    historyOpen.value = true
    historyAction({ action: 'list' })
  }
  const restoreHistory = (entry: HistoryEntry) => {
    if (isSending.value) return
    loadGuard.clear()
    clearLoad()
    loadNotice.value = ''
    loadReason.value = undefined
    lastAttempt.value = undefined
    requestSource.value = 'Restored from history'
    Object.assign(request, JSON.parse(JSON.stringify(entry.request)), {
      cookiePolicy: entry.request.cookiePolicy || 'default',
    })
    enableRawMode(entry.rawMode || !['GET', 'POST'].includes(request.method))
    response.value = undefined
    executionStatus.value = 'Restored from history'
    pendingRequestId.value = ''
    lastDurationMs.value = null
    copyNotice.value = ''
    historyOpen.value = false
    nextTick(() => requestPanel.value?.focus())
  }
  let disposed = false
  onUnmounted(() => {
    disposed = true
    cancelRequest()
    finishRequest()
    clearTimeout(noticeTimer)
    clearLoad()
    captureController?.dispose()
    evidence.dispose()
    connection.dispose()
  })

  function isLoadMessage(m: DevtoolsFunctionMessage): m is DevtoolsLoadMessage {
    return m.type === 'load'
  }

  function isExecuteMessage(
    m: DevtoolsFunctionMessage,
  ): m is DevtoolsExecuteMessage {
    return m.type === 'execute'
  }

  function isCommandMessage(
    m: DevtoolsFunctionMessage,
  ): m is DevtoolsCommandMessage {
    return m.type === 'command'
  }

  function isErrorMessage(
    m: DevtoolsFunctionMessage,
  ): m is DevtoolsErrorMessage {
    return m.type === 'error'
  }

  function isTestMessage(m: DevtoolsFunctionMessage): m is DevtoolsTestMessage {
    return m.type === 'test'
  }

  const handleMessage = async (message: DevtoolsFunctionMessage) => {
    if (message.type === 'evidence') {
      evidence.receive(message as DevtoolsEvidenceMessage)
    } else if (message.type === 'history') {
      const update = message as DevtoolsHistoryMessage
      if (update.error) historyError.value = update.error
      else if (
        update.data &&
        (!historySnapshot.value ||
          update.data.revision >= historySnapshot.value.revision)
      ) {
        historySnapshot.value = update.data
        historyError.value = ''
      }
    } else if (message.type === 'ready') {
      historyAction({ action: 'list' })
      if (initialDraft) {
        initialDraft = false
        if (!request.url && !request.body.content && !request.headers.length)
          load()
      }
    } else if (isLoadMessage(message)) {
      if (message.source === 'draft' && message.data && captureController) {
        await captureController.refresh()
        if (disposed) return
        const target = new URL(message.data.url)
        target.hash = ''
        const captured = captureRows.value.find(row => {
          try {
            const url = new URL(row.url)
            url.hash = ''
            return row.resourceType === 'document' && url.href === target.href
          } catch {
            return false
          }
        })
        if (captured?.request) {
          message.data = JSON.parse(JSON.stringify(captured.request))
          message.source = 'captured'
          message.reason = undefined
        }
      }
      if (!loadGuard.accept(message.loadId, request)) {
        if (!loading.value || message.loadId !== activeLoadId) return
        clearLoad()
        loadNotice.value =
          'Load result ignored because the editor changed. Your edits are preserved.'
        return
      }
      clearLoad()
      if (message.data) {
        loadFrom(message.data)
        requestSource.value =
          message.source === 'captured'
            ? 'Captured page request'
            : 'URL-only GET draft'
      }
      loadReason.value = message.reason
      loadNotice.value = loadFeedback(message)
    } else if (isCommandMessage(message)) {
      switch (message.data) {
        case 'load_url':
          load()
          break
        case 'split_url':
          split()
          break
        case 'execute_url':
          execute()
          break
        case 'switch_mode':
          enableRawMode(!isRawMode.value)
          break
      }
    } else if (isExecuteMessage(message)) {
      if (!isSending.value) return
      if (message.requestId && message.requestId !== pendingRequestId.value)
        return
      const completedRequest = sentRequest
      finishRequest()
      diagnostic.value = ''
      executionStatus.value =
        message.data && message.data.statusCode >= 400
          ? 'HTTP error response'
          : 'Completed'
      lastDurationMs.value = message.durationMs ?? Date.now() - sendStarted
      response.value = message.data
      if (completedRequest) {
        lastExchange.value = {
          request: completedRequest,
          response: message.data
            ? JSON.parse(JSON.stringify(message.data))
            : undefined,
          durationMs: lastDurationMs.value,
          outcome: executionStatus.value,
          completedAt: Date.now(),
          rawMode: isRawMode.value,
        }
        lastAttempt.value = JSON.parse(JSON.stringify(lastExchange.value))
        sentRequest = undefined
      }
      await nextTick()
    } else if (isErrorMessage(message)) {
      if (
        message.operation &&
        message.operation !== 'execute' &&
        message.operation !== 'cancel'
      ) {
        if (message.operation === 'load') {
          loadGuard.clear()
          clearLoad()
          loadReason.value = 'unavailable'
        }
        loadNotice.value = message.data
        return
      }
      if (message.requestId && message.requestId !== pendingRequestId.value)
        return
      if (!isSending.value) return
      recordAttempt(
        message.code === 'cancelled'
          ? 'Cancelled'
          : message.code === 'timeout'
            ? 'Timed out'
            : 'Network / transport error',
        message.data,
      )
      finishRequest()
      executionStatus.value =
        message.code === 'cancelled'
          ? 'Cancelled'
          : message.code === 'timeout'
            ? 'Timed out'
            : 'Failed'
      diagnostic.value = message.code ?? 'failed'
      lastDurationMs.value = Date.now() - sendStarted
      if (message.code === 'cancelled') return
      snackbar.value.text = message.data
      snackbar.value.show = true
    } else if (isTestMessage(message)) {
      const report = message.data

      switch (report.type) {
        case 'progress':
          testProgressDialog.value.status =
            report.data.status || testProgressDialog.value.status
          testProgressDialog.value.percentage =
            report.data.percentage || testProgressDialog.value.percentage
          break
        case 'finished':
          if (!testProgressDialog.value.error) {
            // Only change to "Finished" if there is no error; otherwise, keep
            // last status.
            testProgressDialog.value.status = 'Finished'
          }
          testProgressDialog.value.result = report.data
          break
        case 'error':
          testProgressDialog.value.error = report.data
          break
      }
    }
  }

  const connection = createPanelConnection({
    connect: () => browser.runtime.connect(),
    tabId: browser.devtools.inspectedWindow.tabId,
    onMessage: handleMessage,
    onState: state => {
      connectionState.value = state
      if (state !== 'connected') {
        evidence.disconnected()
        loadGuard.clear()
        clearLoad()
        if (isSending.value) {
          recordAttempt(
            'Connection interrupted',
            'Connection interrupted; server outcome unknown; not retried.',
          )
          finishRequest()
          pendingRequestId.value = ''
          executionStatus.value = 'Connection interrupted'
          diagnostic.value =
            'connection-interrupted; outcome unknown; not retried'
          loadNotice.value =
            'Connection interrupted. The request may have reached the server; it will not be retried automatically.'
        }
      }
    },
  })

  provide(LoadFromKey, loadFrom)

  const {
    theme,
    themeMode,
    themeNotice,
    setThemeMode,
    enableDarkTheme,
    preferencesReady,
  } = usePanelTheme(request, isRawMode)
  onMounted(async () => {
    await preferencesReady
    await nextTick()
    if (!disposed) connection.start()
  })

  /* Test */
  const controlTest = (
    action: BackgroundTestMessage['data']['action'],
    script?: string,
    argument?: any,
  ) => {
    if (action === 'start') {
      testProgressDialog.value.percentage = 0
      testProgressDialog.value.status = ''
      testProgressDialog.value.error = ''
      testProgressDialog.value.result = null
      testProgressDialog.value.show = true
    }

    connection.send({
      tabId: browser.devtools.inspectedWindow.tabId,
      type: 'test',
      data: { action, script, argument },
    })
  }

  provide(ControlTestKey, controlTest)

  /* Events */

  const onRenderRequested = () => {
    if (restoringTab || !response.value) {
      return
    }

    connection.send({
      tabId: browser.devtools.inspectedWindow.tabId,
      type: 'render',
      data: response.value,
    })
  }

  return {
    mdiArrowTopRight,
    mdiConsoleLine,
    mdiMenuDown,
    mdiTrayArrowDown,
    mdiWeatherNight,
    mdiWhiteBalanceSunny,
    isPreview: import.meta.env.DEV,

    appBar,
    requestPanel,

    theme,
    themeMode,
    themeNotice,
    setThemeMode,

    connectionState,
    reconnect: connection.reconnect,
    loading,
    loadNotice,
    dismissLoadNotice: () => {
      loadNotice.value = ''
      loadReason.value = undefined
    },
    loadReason,
    requestSource,
    refreshAndLoad,
    openPermissions: openExtensionPermissionGrantPage,
    diagnostic,
    copyDiagnostics,
    curlCommandLoaderDialog,
    sqlInjectionDialog,
    reverseShellDialog,
    customPayloadDialog,
    testProgressDialog,
    snackbar,

    request,
    response,
    lastExchange,
    lastAttempt,
    tabs,
    evidence,
    loadFrom,
    isRawMode,

    load,
    split,
    execute,
    isSending,
    executionStatus,
    elapsedMs,
    lastDurationMs,
    copyNotice,
    cancelRequest,
    copyCurl,
    historyOpen,
    historySnapshot,
    historyError,
    toggleHistory,
    closeHistory,
    historyAction,
    restoreHistory,
    copyHistoryCurl,
    enableRawMode,
    enableDarkTheme,
    onFocus,
    onRenderRequested,
  }
}

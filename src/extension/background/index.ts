import browser from 'webextension-polyfill'
import { loadTabRequest, reloadTabRequest } from './tab-request'
import { BaseRequestExecutor } from '@/extension/background/executors/base-executor'
import { FetchRequestExecutor } from '@/extension/background/executors/fetch-executor'
import { NavigationRequestExecutor } from '@/extension/background/executors/navigation-executor'
import store from '@/extension/background/session-store'
import { EvidenceStore } from '@/features/evidence/model/evidence-store'
import { RequestHistory } from '@/features/history/model/request-history'
import {
  prepareExecutionRequest,
  requestError,
} from '@/features/request/model/request'
import bodyProcessors from '@/features/request/processors/index'
import {
  checkExtensionPermission,
  openExtensionPermissionGrantPage,
} from '@/shared/lib/browser'

const evidence = new EvidenceStore(browser.storage.local)
const decoder = new TextDecoder()
const history = new RequestHistory(browser.storage.local)
const historyConnections = new Set<browser.Runtime.Port>()
const publishHistory = (data: DevtoolsHistoryMessage['data']) => {
  for (const connection of historyConnections) {
    try {
      connection.postMessage({ type: 'history', data })
    } catch (_) {
      historyConnections.delete(connection)
    }
  }
}
const reportHistoryError = (error: unknown) => {
  for (const connection of historyConnections) {
    try {
      connection.postMessage({
        type: 'history',
        error: error instanceof Error ? error.message : String(error),
      })
    } catch (_) {
      historyConnections.delete(connection)
    }
  }
}
const activeRequests = new Map<
  number,
  {
    requestId?: string
    executor: BaseRequestExecutor
    owner: browser.Runtime.Port
  }
>()
const preparingRequests = new Map<
  number,
  { requestId?: string; cancelled: boolean; owner: browser.Runtime.Port }
>()
const startupReady = browser.declarativeNetRequest
  .getSessionRules()
  .then(rules =>
    rules.length
      ? browser.declarativeNetRequest.updateSessionRules({
          removeRuleIds: rules.map(rule => rule.id),
        })
      : undefined,
  )

function isInitMessage(
  m: BackgroundFunctionMessage,
): m is BackgroundInitMessage {
  return m.type === 'init'
}

function isLoadMessage(
  m: BackgroundFunctionMessage,
): m is BackgroundLoadMessage {
  return m.type === 'load'
}

function isExecuteMessage(
  m: BackgroundFunctionMessage,
): m is BackgroundExecuteMessage {
  return m.type === 'execute'
}

function isTestMessage(
  m: BackgroundFunctionMessage,
): m is BackgroundTestMessage {
  return m.type === 'test'
}

function isRenderMessage(
  m: BackgroundFunctionMessage,
): m is BackgroundRenderMessage {
  return m.type === 'render'
}

/* Communication */

const handleMessage = async (
  message: BackgroundFunctionMessage,
  sender: browser.Runtime.Port,
) => {
  if (message.type === 'evidence') {
    const input = message as BackgroundEvidenceMessage
    const port = sender
    try {
      const data = await evidence.action(input.data)
      for (const client of historyConnections) {
        try {
          client.postMessage({
            type: 'evidence',
            data,
            actionId: client === port ? input.actionId : undefined,
          })
        } catch {
          historyConnections.delete(client)
        }
      }
    } catch (error) {
      port?.postMessage({
        type: 'evidence',
        actionId: input.actionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }
  if (message.type === 'history') {
    history
      .action((message as BackgroundHistoryMessage).data)
      .then(publishHistory, reportHistoryError)
    return
  }
  await startupReady
  const connection = sender
  if (!connection) return

  if (isInitMessage(message)) {
    connection.postMessage({ type: 'ready' })
  } else if (isLoadMessage(message)) {
    connection.postMessage({
      ...(await (message.reload
        ? reloadTabRequest(message.tabId)
        : loadTabRequest(message.tabId, message.draftOnly))),
      loadId: message.loadId,
    })
  } else if (isExecuteMessage(message)) {
    const { requestId } = message.data
    if (
      activeRequests.has(message.tabId) ||
      preparingRequests.has(message.tabId)
    ) {
      connection.postMessage({
        type: 'error',
        data: 'A request is already running.',
        requestId,
        code: 'failed',
      })
      return
    }
    const reservation = { requestId, cancelled: false, owner: sender }
    preparingRequests.set(message.tabId, reservation)
    let executor: BaseRequestExecutor
    let request: BrowseRequest
    let isRawMode: boolean
    try {
      if (!(await checkExtensionPermission())) {
        connection.postMessage({
          type: 'error',
          requestId,
          code: 'failed',
          data: 'Site access is missing. Open extension permissions and grant access before sending.',
        })
        return
      }
      if (reservation.cancelled) {
        connection.postMessage({
          type: 'error',
          requestId,
          code: 'cancelled',
          data: 'Request cancelled before sending.',
        })
        return
      }
      const prepared = prepareExecutionRequest(
        message.data.request,
        message.data.rawMode,
      )
      request = prepared.request
      isRawMode = prepared.rawMode
      executor = isRawMode
        ? new FetchRequestExecutor(message.tabId, request)
        : new NavigationRequestExecutor(message.tabId, request)
      activeRequests.set(message.tabId, { executor, requestId, owner: sender })
    } finally {
      preparingRequests.delete(message.tabId)
    }
    const historyId = requestId || crypto.randomUUID()
    const started = Date.now()
    const recorded = history.begin(historyId, request, isRawMode).then(
      snapshot => {
        publishHistory(snapshot)
        return true
      },
      error => {
        reportHistoryError(error)
        return false
      },
    )
    try {
      const result = await executor.execute()
      void recorded
        .then(saved =>
          saved
            ? history
                .finish(
                  historyId,
                  result,
                  result.type === 'execute'
                    ? (result.durationMs ?? Date.now() - started)
                    : Date.now() - started,
                )
                .then(publishHistory)
            : undefined,
        )
        .catch(reportHistoryError)
      connection.postMessage({ ...result, requestId })
    } finally {
      activeRequests.delete(message.tabId)
    }
  } else if (message.type === 'cancel') {
    const id = (message as BackgroundCancelMessage).data.requestId
    const active = activeRequests.get(message.tabId),
      preparing = preparingRequests.get(message.tabId)
    if (preparing?.requestId === id && preparing.owner === sender)
      preparing.cancelled = true
    if (active?.requestId === id && active.owner === sender)
      active.executor.abort()
  } else if (isTestMessage(message)) {
    if (message.data.action === 'start') {
      await browser.scripting.executeScript({
        target: {
          tabId: message.tabId,
        },
        files: [message.data.script!],
      })
    }

    await browser.tabs.sendMessage(message.tabId, message.data)
  } else if (isRenderMessage(message)) {
    await browser.scripting.executeScript({
      target: {
        tabId: message.tabId,
      },
      files: ['requests/render-response.js'],
    })
    await browser.tabs.sendMessage(message.tabId, message.data)
  }
}

browser.runtime.onConnect.addListener(devToolsConnection => {
  historyConnections.add(devToolsConnection)
  const devToolsListener = async (message: BackgroundFunctionMessage) => {
    await store.updateConnection(message.tabId, devToolsConnection)
    handleMessage(message, devToolsConnection).catch(error => {
      try {
        devToolsConnection.postMessage({
          ...requestError(error),
          operation: message.type,
          requestId: (message as BackgroundExecuteMessage).data?.requestId,
        })
      } catch (_) {
        /* The panel may have closed while a request was running. */
      }
    })
  }

  devToolsConnection.onMessage.addListener(devToolsListener)
  devToolsConnection.onDisconnect.addListener(() => {
    historyConnections.delete(devToolsConnection)
    devToolsConnection.onMessage.removeListener(devToolsListener)
    for (const preparing of preparingRequests.values())
      if (preparing.owner === devToolsConnection) preparing.cancelled = true
    for (const active of activeRequests.values()) {
      if (active.owner === devToolsConnection) active.executor.abort()
    }
  })
})

browser.runtime.onMessage.addListener(
  async (
    message: DevtoolsTestMessage['data'],
    sender: browser.Runtime.MessageSender,
  ) => {
    if (sender.tab?.id) {
      const connection = (await store.getConnection(sender.tab.id))!

      connection?.postMessage({
        type: 'test',
        data: message,
      })
    }
  },
)

/* Request recorder */

const onBeforeRequestOptions: Array<browser.WebRequest.OnBeforeRequestOptions> =
  ['requestBody', chrome.webRequest.OnBeforeRequestOptions.EXTRA_HEADERS]
browser.webRequest.onBeforeRequest.addListener(
  details => {
    const requestBody = details.requestBody
    let bodyContent = ''

    if (requestBody?.formData) {
      const params = new URLSearchParams()

      for (const name in requestBody?.formData) {
        requestBody?.formData[name].forEach(value => {
          const fieldContent =
            value instanceof ArrayBuffer ? decoder.decode(value) : value
          params.append(name, fieldContent)
        })
      }

      bodyContent = params.toString()
    } else if (requestBody?.raw) {
      bodyContent = requestBody?.raw
        ?.map(data => {
          if (data.file) {
            return `[Content of '${data.file}']`
          }
          if (!data.bytes) {
            return ''
          }

          return decoder.decode(data.bytes)
        })
        .join('')
    }

    const problem =
      requestBody?.error ||
      requestBody?.formData ||
      requestBody?.raw?.some(data => data.file) ||
      bodyContent.includes('\uFFFD')
        ? 'body-unavailable'
        : undefined
    const url = details.url
    const body: BrowseRequest['body'] = {
      enctype: bodyProcessors.getDefaultProcessorName(), // Updated in onBeforeSendHeaders
      content: bodyContent,
    }

    void store
      .updateBrowseRequest(
        details.tabId,
        {
          url,
          body,
          method: details.method.toUpperCase(),
          headers: [], // Ignored in UI
          followRedirect: false, // Ignored in UI
        },
        details.requestId,
        false,
        false,
        problem,
      )
      .catch(() => {})
  },
  {
    urls: ['*://*/*'],
    types: ['main_frame'],
  },
  onBeforeRequestOptions.filter(Boolean),
)

const onBeforeSendHeadersOptions: Array<browser.WebRequest.OnBeforeSendHeadersOptions> =
  ['requestHeaders', chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS]
browser.webRequest.onBeforeSendHeaders.addListener(
  details => {
    store
      .getBrowseRequest(details.tabId)
      .then(request => {
        if (
          !request ||
          !store.matchesCapture(details.tabId, details.requestId, details.url)
        )
          return
        request.headers = []
        details.requestHeaders?.forEach(({ name, value }, idx) => {
          request!.headers.push({
            enabled: true,
            name,
            value: value ?? '',
            removeIfEmptyValue: false,
            _createdAt: Date.now() * 1000 + idx,
          })

          if (name.toLowerCase() === 'content-type') {
            const processor =
              bodyProcessors.findByContentType(value ?? '') ??
              bodyProcessors.getDefaultProcessor()

            request!.body.enctype = processor.getName()
          }
        })

        void store
          .updateBrowseRequest(
            details.tabId,
            request,
            details.requestId,
            true,
            true,
            request.body.enctype.startsWith('multipart/')
              ? 'body-unavailable'
              : undefined,
          )
          .catch(() => {})
      })
      .catch(() => {})
  },
  {
    urls: ['*://*/*'],
    types: ['main_frame'],
  },
  onBeforeSendHeadersOptions.filter(Boolean),
)

browser.tabs.onRemoved.addListener(async tabId => {
  activeRequests.get(tabId)?.executor.abort()
  await store.remove(tabId)
})

/* Shortcut handler */

browser.commands.onCommand.addListener(async command => {
  const tabs = await browser.tabs.query({ currentWindow: true, active: true })

  const tabId = tabs[0]?.id
  if (!tabId) {
    return
  }

  const connection = await store.getConnection(tabId)
  if (!connection) {
    return
  }

  connection.postMessage({
    type: 'command',
    data: command,
  } as DevtoolsCommandMessage)
})

/* Permission handler */

browser.runtime.onInstalled.addListener(async details => {
  if (details.reason != 'install') {
    return
  }

  if (await checkExtensionPermission()) {
    return
  }

  openExtensionPermissionGrantPage()
})

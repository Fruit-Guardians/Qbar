import browser from 'webextension-polyfill'
import store from '@/extension/background/session-store'
import {
  abortable,
  prepareRequest,
  requestError,
} from '@/features/request/model/request'

export abstract class BaseRequestExecutor {
  tabId: number
  request: BrowseRequest
  protected controller = new AbortController()
  protected cleanups: Array<() => void | Promise<void>> = []
  get signal() {
    return this.controller.signal
  }

  constructor(tabId: number, request: BrowseRequest) {
    this.tabId = tabId
    this.request = prepareRequest(request)
    this.setupAdditionalHeaders()
  }

  abort(reason: Error = new DOMException('Request cancelled.', 'AbortError')) {
    this.controller.abort(reason)
  }

  async execute(): Promise<DevtoolsExecuteMessage | DevtoolsErrorMessage> {
    const started = performance.now()
    const timer = setTimeout(
      () =>
        this.abort(
          new DOMException(
            `Request timed out after ${this.request.timeoutMs! / 1000} s.`,
            'TimeoutError',
          ),
        ),
      this.request.timeoutMs,
    )
    let result: DevtoolsExecuteMessage | DevtoolsErrorMessage = requestError(
      new Error('Request did not complete.'),
    )
    try {
      this.signal.throwIfAborted()
      await abortable(this.setupModifyHeaderRules(), this.signal)
      this.signal.throwIfAborted()
      await abortable(this.setupEventHandlers(), this.signal)
      this.signal.throwIfAborted()
      result = await abortable(this.sendRequest(), this.signal)
      if (result.type === 'execute') {
        result.durationMs = Math.round(performance.now() - started)
        if (result.data) {
          result.data.durationMs = result.durationMs
          result.data.bodyBytes = result.data.bodyUnavailable
            ? 0
            : new TextEncoder().encode(result.data.body).byteLength
        }
      }
    } catch (error) {
      result = requestError(error)
    } finally {
      clearTimeout(timer)
      const cleanupResults = await Promise.allSettled(
        this.cleanups.splice(0).map(cleanup => Promise.resolve().then(cleanup)),
      )
      if (cleanupResults.some(result => result.status === 'rejected')) {
        result = requestError(
          new Error(
            'Temporary request cleanup failed. Reload the extension before sending again.',
          ),
        )
      }
    }
    return result
  }

  abstract setupAdditionalHeaders(): void
  abstract getModifyHeaderCondition(): browser.DeclarativeNetRequest.RuleConditionType

  getModifyHeaderInfo() {
    return this.request.headers.map(
      (
        header,
      ): browser.DeclarativeNetRequest.RuleActionRequestHeadersItemType =>
        header.value.length !== 0 || !header.removeIfEmptyValue
          ? { header: header.name, operation: 'set', value: header.value }
          : { header: header.name, operation: 'remove' },
    )
  }

  async setupModifyHeaderRules() {
    const ruleId = await store.allocateRuleId()
    this.signal.throwIfAborted()
    this.cleanups.push(async () => {
      await browser.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId],
      })
    })
    const headers = this.getModifyHeaderInfo()
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      ...(headers.length
        ? {
            addRules: [
              {
                id: ruleId,
                priority: 9999,
                action: { type: 'modifyHeaders', requestHeaders: headers },
                condition: this.getModifyHeaderCondition(),
              },
            ],
          }
        : {}),
    })
  }

  abstract setupEventHandlers(): Promise<void>
  abstract sendRequest(): Promise<DevtoolsExecuteMessage | DevtoolsErrorMessage>
}

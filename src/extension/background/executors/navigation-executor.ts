import browser from 'webextension-polyfill'
import { BaseRequestExecutor } from '@/extension/background/executors/base-executor'
import { requestTarget } from '@/features/request/model/request'
import bodyProcessors from '@/features/request/processors/index'

export class NavigationRequestExecutor extends BaseRequestExecutor {
  private requestId?: string
  private lastNavigationUrl?: string
  private responseInfo?: BrowseResponse
  private completion!: Promise<void>

  setupAdditionalHeaders() {
    if (!['GET', 'POST'].includes(this.request.method)) {
      throw new Error(`Use Raw mode for ${this.request.method} requests.`)
    }
    if (this.request.method === 'GET') return
    if (this.request.body.enctype !== 'application/x-www-form-urlencoded')
      throw new Error('Use exact-body Raw transport for this content type.')
    const processor = bodyProcessors.find(this.request.body.enctype)
    if (!processor) throw new Error('Unsupported content type.')
    if (processor.getFormEnctype() !== processor.getHttpContentType()) {
      this.request.headers = this.request.headers.filter(
        h => h.name.toLowerCase() !== 'content-type',
      )
      this.request.headers.push({
        enabled: true,
        name: 'Content-Type',
        value: processor.getHttpContentType(),
        removeIfEmptyValue: false,
        _createdAt: 0,
      })
    }
  }

  getModifyHeaderCondition(): browser.DeclarativeNetRequest.RuleConditionType {
    return { tabIds: [this.tabId], resourceTypes: ['main_frame'] }
  }

  async setupEventHandlers() {
    let resolve!: () => void
    let reject!: (reason: unknown) => void
    this.completion = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    this.completion.catch(() => {})
    const filter: browser.WebRequest.RequestFilter = {
      urls: ['*://*/*'],
      types: ['main_frame'],
      tabId: this.tabId,
    }
    const onBeforeRequest = (
      details: browser.WebRequest.OnBeforeRequestDetailsType,
    ) => {
      if (details.tabId !== this.tabId) return
      if (
        !this.requestId &&
        requestTarget(details.url) === requestTarget(this.request.url) &&
        details.method.toUpperCase() === this.request.method
      )
        this.requestId = details.requestId
      if (details.requestId === this.requestId)
        this.lastNavigationUrl = details.url
    }
    const onHeaders = (
      details: browser.WebRequest.OnHeadersReceivedDetailsType,
    ) => {
      if (details.tabId !== this.tabId || details.requestId !== this.requestId)
        return
      const [protocolVersion, , ...status] = details.statusLine.split(' ')
      this.responseInfo = {
        protocolVersion,
        statusCode: details.statusCode,
        statusMessage: status.join(' '),
        baseUrl: details.url,
        headers: (details.responseHeaders ?? []).map(h => ({
          name: h.name,
          value: h.value ?? '',
        })),
        body: '',
        bodyUnavailable: true,
      }
    }
    const onCompleted = (
      details: browser.WebRequest.OnCompletedDetailsType,
    ) => {
      if (details.tabId === this.tabId && details.requestId === this.requestId)
        resolve()
    }
    const onError = (
      details: browser.WebRequest.OnErrorOccurredDetailsType,
    ) => {
      if (details.tabId === this.tabId && details.requestId === this.requestId)
        reject(new Error(details.error))
    }
    browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, filter)
    browser.webRequest.onHeadersReceived.addListener(onHeaders, filter, [
      'responseHeaders',
    ])
    browser.webRequest.onCompleted.addListener(onCompleted, filter)
    browser.webRequest.onErrorOccurred.addListener(onError, filter)
    this.cleanups.push(async () => {
      browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest)
      browser.webRequest.onHeadersReceived.removeListener(onHeaders)
      browser.webRequest.onCompleted.removeListener(onCompleted)
      browser.webRequest.onErrorOccurred.removeListener(onError)
      if (this.signal.aborted && this.lastNavigationUrl) {
        try {
          const tab = await browser.tabs.get(this.tabId)
          if (
            tab.url &&
            requestTarget(tab.url) === requestTarget(this.lastNavigationUrl)
          ) {
            await browser.scripting.executeScript({
              target: { tabId: this.tabId },
              func: () => window.stop(),
            })
          }
        } catch (_) {
          /* A closed tab has already stopped its navigation. */
        }
      }
    })
  }

  async sendRequest(): Promise<DevtoolsExecuteMessage | DevtoolsErrorMessage> {
    if (this.request.method === 'POST') {
      await browser.scripting.executeScript({
        target: { tabId: this.tabId },
        files: ['requests/post-form.js'],
      })
      this.signal.throwIfAborted()
      let messageError: unknown
      try {
        messageError = await browser.tabs.sendMessage(this.tabId, this.request)
      } catch (error) {
        // Navigation may disconnect the content-script response port.
        if (!this.requestId) throw error
      }
      if (typeof messageError === 'string') throw new Error(messageError)
    } else {
      await browser.tabs.update(this.tabId, { url: this.request.url })
    }
    await this.completion
    return { type: 'execute', data: this.responseInfo }
  }
}

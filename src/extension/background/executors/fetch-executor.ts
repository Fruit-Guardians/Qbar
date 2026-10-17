import browser from 'webextension-polyfill'
import { BaseRequestExecutor } from '@/extension/background/executors/base-executor'
import { rawRequestQueue } from '@/extension/background/request-queue'
import {
  methodAllowsBody,
  requestError,
  requestTarget,
} from '@/features/request/model/request'
import { DefaultSentRequestHeaders } from '@/shared/http-headers'
import { isChrome, isSelfOrigin } from '@/shared/lib/browser'

export class FetchRequestExecutor extends BaseRequestExecutor {
  private requestId?: string
  private responseInfo?: Omit<BrowseResponse, 'body'>

  async execute(): Promise<DevtoolsExecuteMessage | DevtoolsErrorMessage> {
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
    try {
      return await rawRequestQueue.run(() => super.execute(), this.signal)
    } catch (error) {
      return requestError(error)
    } finally {
      clearTimeout(timer)
    }
  }

  setupAdditionalHeaders() {
    const names = new Set(this.request.headers.map(h => h.name.toLowerCase()))
    DefaultSentRequestHeaders.forEach(name => {
      if (!names.has(name.toLowerCase())) {
        this.request.headers.push({
          enabled: true,
          name,
          value: '',
          removeIfEmptyValue: true,
          _createdAt: 0,
        })
      }
    })
  }

  getModifyHeaderCondition(): browser.DeclarativeNetRequest.RuleConditionType {
    const target = requestTarget(this.request.url).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )
    return {
      initiatorDomains: [new URL(browser.runtime.getURL('/')).hostname],
      resourceTypes: ['xmlhttprequest'],
      regexFilter: `^${target}$`,
      isUrlFilterCaseSensitive: true,
    }
  }

  async setupEventHandlers() {
    const filter: browser.WebRequest.RequestFilter = {
      urls: ['*://*/*'],
      types: ['xmlhttprequest'],
    }
    const onBeforeRequest = (
      details: browser.WebRequest.OnBeforeRequestDetailsType,
    ) => {
      if (
        !this.requestId &&
        isSelfOrigin(details.initiator ?? details.originUrl) &&
        requestTarget(details.url) === requestTarget(this.request.url) &&
        details.method.toUpperCase() === this.request.method
      ) {
        this.requestId = details.requestId
      }
    }
    const onResponse = (
      details:
        | browser.WebRequest.OnHeadersReceivedDetailsType
        | browser.WebRequest.OnBeforeRedirectDetailsType,
    ) => {
      if (details.requestId !== this.requestId) return
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
      }
    }
    browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, filter)
    const responseOptions: Array<'responseHeaders' | 'extraHeaders'> =
      isChrome() ? ['responseHeaders', 'extraHeaders'] : ['responseHeaders']
    browser.webRequest.onHeadersReceived.addListener(
      onResponse,
      filter,
      responseOptions,
    )
    browser.webRequest.onBeforeRedirect.addListener(
      onResponse,
      filter,
      responseOptions,
    )
    this.cleanups.push(() => {
      browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest)
      browser.webRequest.onHeadersReceived.removeListener(onResponse)
      browser.webRequest.onBeforeRedirect.removeListener(onResponse)
    })
  }

  async sendRequest(): Promise<DevtoolsExecuteMessage | DevtoolsErrorMessage> {
    const response = await fetch(this.request.url, {
      method: this.request.method,
      cache: 'no-store',
      credentials: 'omit',
      keepalive: false,
      redirect: this.request.followRedirect ? 'follow' : 'manual',
      referrerPolicy: 'no-referrer',
      signal: this.signal,
      headers: this.request.headers
        .filter(h => !h.removeIfEmptyValue || h.value)
        .map((h): [string, string] => [h.name, h.value]),
      ...(methodAllowsBody(this.request.method)
        ? { body: this.request.body.content }
        : {}),
    })
    let body = await response.text()
    const info = this.responseInfo ?? {
      protocolVersion: 'HTTP',
      statusCode: response.status,
      statusMessage: response.statusText,
      baseUrl: response.url || this.request.url,
      headers: Array.from(response.headers, ([name, value]) => ({
        name,
        value,
      })),
    }
    if (response.type === 'opaqueredirect') {
      body = '[Redirect response body is hidden by the browser.]'
    }
    return {
      type: 'execute',
      data: {
        ...info,
        body,
        bodyUnavailable: response.type === 'opaqueredirect',
      },
    }
  }
}

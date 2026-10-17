import browser from 'webextension-polyfill'
import { sleep } from '@/shared/lib/time'

type RuntimePort = Omit<browser.Runtime.Port, 'postMessage'> & {
  postMessage(
    message:
      | DevtoolsLoadMessage
      | DevtoolsExecuteMessage
      | DevtoolsTestMessage
      | DevtoolsCommandMessage
      | DevtoolsErrorMessage
      | DevtoolsReadyMessage
      | DevtoolsEvidenceMessage,
  ): void
}

class Store {
  #isInitialized: boolean
  #records: Record<
    number,
    {
      connection?: RuntimePort
      request?: BrowseRequest
      _updatedAt: number
    }
  >
  #captures = new Map<
    number,
    { id: string; url: string; complete: boolean; problem?: string }
  >()
  #writes: Promise<unknown> = Promise.resolve()
  #ruleId: number
  #encoder: TextEncoder

  constructor() {
    this.#isInitialized = false
    this.#records = {}
    this.#ruleId = 1
    this.#encoder = new TextEncoder()
    this.#load().catch(() => {})
  }

  async allocateRuleId() {
    await this.#waitForInitialized()

    const result = this.#ruleId++

    await this.#sync()
    return result
  }

  async updateConnection(tabId: number, connection: RuntimePort) {
    await this.#waitForInitialized()

    const tabData = this.#records[tabId] || {}

    tabData.connection = connection
    tabData._updatedAt = Date.now()
    this.#records[tabId] = tabData
  }

  async getConnection(tabId: number) {
    await this.#waitForInitialized()

    return this.#records[tabId]?.connection
  }

  matchesCapture(tabId: number, id: string, url: string) {
    const capture = this.#captures.get(tabId)
    return capture?.id === id && capture.url === url
  }

  captureComplete(tabId: number) {
    const capture = this.#captures.get(tabId)
    return capture?.complete === true && !capture.problem
  }

  async updateBrowseRequest(
    tabId: number,
    request: BrowseRequest | undefined,
    captureId?: string,
    onlyIfCurrent = false,
    complete = true,
    problem?: string,
  ) {
    await this.#waitForInitialized()

    if (
      onlyIfCurrent &&
      (!request ||
        !captureId ||
        !this.matchesCapture(tabId, captureId, request.url))
    )
      return

    const tabData = this.#records[tabId] || {}

    if (captureId && request)
      this.#captures.set(tabId, {
        id: captureId,
        url: request.url,
        complete,
        problem: onlyIfCurrent
          ? problem || this.#captures.get(tabId)?.problem
          : problem,
      })
    tabData.request = request
    tabData._updatedAt = Date.now()
    this.#records[tabId] = tabData

    await this.#sync()
  }

  async getBrowseRequest(tabId: number) {
    await this.#waitForInitialized()

    return this.#records[tabId]?.request
  }

  async remove(tabId: number) {
    await this.#waitForInitialized()

    this.#captures.delete(tabId)
    delete this.#records[tabId]

    await this.#sync()
  }

  async #sync() {
    const sortedRecords = Object.entries(this.#records)
      .filter(([_, tabData]) => tabData.request)
      .sort(
        ([_tabIdA, tabDataA], [_tabIdB, tabDataB]) =>
          tabDataA._updatedAt - tabDataB._updatedAt,
      )

    let data = {
      ruleId: this.#ruleId,
      records: {} as Record<string, BrowseRequest>,
      captures: {} as Record<
        string,
        { id: string; url: string; complete: boolean; problem?: string }
      >,
    }
    while (sortedRecords.length) {
      data = {
        ruleId: this.#ruleId,
        captures: Object.fromEntries(
          sortedRecords.flatMap(([id]) =>
            this.#captures.has(Number(id))
              ? [[id, this.#captures.get(Number(id))!]]
              : [],
          ),
        ),
        records: sortedRecords.reduce(
          (result, [tabId, tabData]) => {
            result[tabId] = tabData.request!

            return result
          },
          {} as Record<string, BrowseRequest>,
        ),
      }

      const length = this.#encoder.encode(JSON.stringify(data)).length
      if (length > browser.storage.session.QUOTA_BYTES) {
        sortedRecords.shift()
      } else {
        break
      }
    }

    const write = this.#writes
      .catch(() => {})
      .then(() => browser.storage.session.set(data))
    this.#writes = write
    await write
  }

  async #load() {
    try {
      const data = (await browser.storage.session.get()) as {
        captures?: Record<
          string,
          { id: string; url: string; complete: boolean; problem?: string }
        >
        ruleId?: number
        records?: Record<number, BrowseRequest>
      }
      for (const [tabId, request] of Object.entries(data.records ?? {})) {
        this.#records[parseInt(tabId)] = { request, _updatedAt: Date.now() }
        const capture = data.captures?.[tabId]
        if (
          capture &&
          capture.url === request.url &&
          typeof capture.id === 'string'
        )
          this.#captures.set(Number(tabId), capture)
      }
      this.#ruleId = data.ruleId || this.#ruleId
    } finally {
      // A storage read failure must not leave every operation waiting forever.
      this.#isInitialized = true
    }
  }

  async #waitForInitialized() {
    while (!this.#isInitialized) {
      await sleep(1)
    }
  }
}

const store = new Store()

export default store

const listeners = {}
const ruleUpdates = []
const values = {}
const event = name =>
  (listeners[name] ||= {
    handlers: new Set(),
    addListener(fn) {
      this.handlers.add(fn)
    },
    removeListener(fn) {
      this.handlers.delete(fn)
    },
    emit(details) {
      for (const fn of [...this.handlers]) fn(details)
    },
  })
const browser = {
  runtime: { getURL: p => 'chrome-extension://fixture' + p },
  storage: {
    session: {
      QUOTA_BYTES: 10 * 1024 * 1024,
      async get() {
        return { ...values }
      },
      async set(data) {
        Object.assign(values, data)
      },
      async clear() {
        for (const k of Object.keys(values)) delete values[k]
      },
    },
  },
  declarativeNetRequest: {
    async updateSessionRules(update) {
      ruleUpdates.push(update)
    },
  },
  webRequest: Object.fromEntries(
    [
      'onBeforeRequest',
      'onSendHeaders',
      'onBeforeRedirect',
      'onHeadersReceived',
      'onCompleted',
      'onErrorOccurred',
    ].map(k => [k, event(k)]),
  ),
  tabs: {
    async get() {
      return { status: 'complete', url: 'http://fixture.test/' }
    },
    async update() {},
    async sendMessage() {
      return null
    },
    onUpdated: event('tabs.onUpdated'),
  },
  scripting: {
    async executeScript() {
      return []
    },
  },
}
module.exports = {
  __esModule: true,
  default: browser,
  browser,
  listeners,
  ruleUpdates,
  values,
}

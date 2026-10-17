type Event<T> = {
  addListener(listener: T): void
  removeListener(listener: T): void
}
type Port = {
  onMessage: Event<(message: any) => void>
  onDisconnect: Event<() => void>
  postMessage(message: any): void
  disconnect(): void
}
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'

// Reconnect only the transport. Never replay a send, render, or test action.
export function createPanelConnection(options: {
  connect: () => Port
  tabId: number
  onMessage: (message: any) => void
  onState: (state: ConnectionState) => void
  schedule?: typeof setTimeout
  unschedule?: typeof clearTimeout
}) {
  const schedule = options.schedule ?? setTimeout
  const unschedule = options.unschedule ?? clearTimeout
  let port: Port | undefined
  let cleanup: (() => void) | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let ready = false
  let attempts = 0
  const detach = () => {
    unschedule(handshakeTimer)
    cleanup?.()
    cleanup = undefined
    const old = port
    port = undefined
    ready = false
    try {
      old?.disconnect()
    } catch (_) {
      /* Already disconnected. */
    }
  }
  const retry = () => {
    if (disposed || retryTimer) return
    detach()
    options.onState(attempts >= 5 ? 'offline' : 'reconnecting')
    retryTimer = schedule(
      () => {
        retryTimer = undefined
        start()
      },
      Math.min(500 * 2 ** attempts++, 10000),
    )
  }
  const start = () => {
    if (disposed || port) return
    options.onState(attempts ? 'reconnecting' : 'connecting')
    try {
      const next = options.connect()
      port = next
      const receive = (message: any) => {
        if (disposed || port !== next) return
        if (message.type === 'ready') {
          ready = true
          attempts = 0
          unschedule(handshakeTimer)
          options.onState('connected')
        }
        options.onMessage(message)
      }
      next.onMessage.addListener(receive)
      next.onDisconnect.addListener(retry)
      cleanup = () => {
        next.onMessage.removeListener(receive)
        next.onDisconnect.removeListener(retry)
      }
      handshakeTimer = schedule(retry, 5000)
      next.postMessage({ type: 'init', tabId: options.tabId })
    } catch (_) {
      retry()
    }
  }
  return {
    start,
    send(message: any) {
      if (!ready || !port) return false
      try {
        port.postMessage(message)
        return true
      } catch (_) {
        retry()
        return false
      }
    },
    reconnect() {
      if (disposed) return
      unschedule(retryTimer)
      retryTimer = undefined
      attempts = 0
      detach()
      start()
    },
    dispose() {
      disposed = true
      unschedule(retryTimer)
      retryTimer = undefined
      detach()
    },
  }
}

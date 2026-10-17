import { abortable } from '@/features/request/model/request'

/** Header rules from this extension must not overlap between Raw requests. */
export class RequestQueue {
  #tail: Promise<void> = Promise.resolve()

  async run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const previous = this.#tail
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    this.#tail = previous.then(() => gate)
    try {
      await abortable(previous, signal)
      signal.throwIfAborted()
      return await task()
    } finally {
      // A cancelled waiter must not let later tasks jump ahead of the holder.
      previous.then(release)
    }
  }
}

export const rawRequestQueue = new RequestQueue()

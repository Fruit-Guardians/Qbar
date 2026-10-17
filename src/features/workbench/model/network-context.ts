import { type InjectionKey, type Ref, inject } from 'vue'
import type { CapturedRequest } from './network-capture'
export type NetworkCaptureContext = {
  rows: Ref<CapturedRequest[]>
  error: Ref<string>
  refresh(): Promise<void>
  clear(): void
}
export const NetworkCaptureKey: InjectionKey<NetworkCaptureContext> =
  Symbol('network-capture')
export const useNetworkCapture = () => inject(NetworkCaptureKey, undefined)

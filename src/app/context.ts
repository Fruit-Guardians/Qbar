import type { InjectionKey, Ref } from 'vue'
import type { VAppBar } from 'vuetify/components'

export const LoadFromKey: InjectionKey<
  (
    source: BrowseRequest,
    options?: { rawMode?: boolean; preserveOptions?: boolean },
  ) => void
> = Symbol('loadFrom')

export const ApplyFunctionKey: InjectionKey<
  (
    func: string,
    insertWhenNoSelection?: boolean,
    argument?: any,
  ) => Promise<void>
> = Symbol('applyFunction')

export const OpenSqlInjectionPromptKey: InjectionKey<
  (func: string, positionRequired?: boolean) => void
> = Symbol('openSqlInjectionPrompt')

export const OpenReverseShellPromptKey: InjectionKey<(func: string) => void> =
  Symbol('openReverseShellPrompt')

export const OpenCustomPayloadManagementKey: InjectionKey<() => void> = Symbol(
  'openCustomPayloadManagement',
)

export const ControlTestKey: InjectionKey<
  (
    action: BackgroundTestMessage['data']['action'],
    script?: string,
    argument?: any,
  ) => void
> = Symbol('controlTest')

export const AppBarKey: InjectionKey<
  Ref<InstanceType<typeof VAppBar> | undefined>
> = Symbol('appBar')

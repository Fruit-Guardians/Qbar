import { type Ref, nextTick, onMounted, provide, ref } from 'vue'
import {
  ApplyFunctionKey,
  OpenCustomPayloadManagementKey,
  OpenReverseShellPromptKey,
  OpenSqlInjectionPromptKey,
} from '@/app/context'
import { useCustomPayloadStore } from '@/features/tools/stores'
export function useEditorTools(snackbar: Ref<{ show: boolean; text: string }>) {
  let domFocusedInput: HTMLInputElement | HTMLTextAreaElement | null = null
  const sqlInjectionDialog = ref({
    show: false,
    positionRequired: true,
    func: '',
  })
  const reverseShellDialog = ref({
    show: false,
    positionRequired: true,
    func: '',
  })
  const customPayloadDialog = ref({
    show: false,
  })
  /* Functionality */
  const getNamespaceByPath = (path: string, root: any, returnName: boolean) => {
    let namespace = root === undefined ? window : root

    const paths = path.split('.')
    for (let idx = 0; idx < paths.length - 1; idx++) {
      if (namespace[paths[idx]]) {
        namespace = namespace[paths[idx]]
      } else {
        return undefined
      }
    }

    if (returnName) {
      return {
        namespace: namespace,
        name: paths.pop()!,
      }
    } else {
      return namespace
    }
  }

  const applyFunction = async (
    func: string,
    insertWhenNoSelection = false,
    argument?: any,
  ) => {
    if (domFocusedInput === null) {
      return
    }

    let startIndex = domFocusedInput.selectionStart ?? 0
    let endIndex = domFocusedInput.selectionEnd ?? 0
    const textSelected = endIndex - startIndex !== 0
    const inputText = domFocusedInput.value

    if (argument === undefined) {
      if (textSelected) {
        argument = inputText.substring(startIndex, endIndex)
      } else if (insertWhenNoSelection) {
        argument = ''
      } else {
        argument = inputText
      }
    }

    const funcObj = getNamespaceByPath(func, window, true)
    let processed = argument
    try {
      processed = funcObj.namespace[funcObj.name](argument)
    } catch (error) {
      snackbar.value.text = (error as Error).message
      snackbar.value.show = true
    }

    await nextTick()

    domFocusedInput.focus()
    if (!textSelected && !insertWhenNoSelection) {
      startIndex = 0
      endIndex = inputText.length

      document.execCommand('selectAll')
    }

    document.execCommand('insertText', false, processed)

    domFocusedInput.setSelectionRange(
      startIndex + (textSelected ? 0 : processed.length),
      startIndex + processed.length,
    )
  }

  const openSqlInjectionPrompt = (func: string, positionRequired = true) => {
    sqlInjectionDialog.value.func = func
    sqlInjectionDialog.value.positionRequired = positionRequired
    sqlInjectionDialog.value.show = true
  }

  const openReverseShellPrompt = (func: string) => {
    reverseShellDialog.value.func = func
    reverseShellDialog.value.show = true
  }

  const openCustomPayloadManagement = () => {
    customPayloadDialog.value.show = true
  }

  provide(ApplyFunctionKey, applyFunction)
  provide(OpenSqlInjectionPromptKey, openSqlInjectionPrompt)
  provide(OpenReverseShellPromptKey, openReverseShellPrompt)
  provide(OpenCustomPayloadManagementKey, openCustomPayloadManagement)

  const onFocus = (event: FocusEvent) => {
    domFocusedInput = event.target as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null
  }
  const clearEditorFocus = () => {
    domFocusedInput = null
  }
  const { init } = useCustomPayloadStore()
  onMounted(() => init())
  return {
    sqlInjectionDialog,
    reverseShellDialog,
    customPayloadDialog,
    onFocus,
    clearEditorFocus,
  }
}

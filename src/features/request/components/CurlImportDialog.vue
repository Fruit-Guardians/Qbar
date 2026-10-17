<template>
  <VDialog v-model="shown" max-width="100%" :width="680" persistent>
    <VCard>
      <VCardTitle> {{ $t('Load request manually') }} </VCardTitle>
      <VCardText>
        <VForm ref="form" v-model="valid">
          {{ $t('Paste your cURL command for sending request here.') }}<br />
          {{
            $t(
              'It will be parsed and used to overwrite current URL, body and headers settings.',
            )
          }}
          <VTooltip location="bottom start">
            <template #activator="{ props }">
              <VIcon
                class="text-disabled"
                :icon="mdiInformation"
                size="small"
                v-bind="props"
              />
            </template>
            {{ $t('You can get a command by right-clicking a request') }}<br />
            {{ $t('in "Network" tab and then clicking "Copy as cURL"') }}
          </VTooltip>
          <div class="d-flex pt-3">
            <VTextarea
              v-model="userInput"
              v-disable-prevent-default.keydown
              class="monospaced"
              :label="$t('Command')"
              :aria-label="$t('Command')"
              :rows="3"
              :rules="[v => !v.length || !parsingError.length || parsingError]"
              variant="underlined"
              auto-grow
              autofocus
            />
          </div>
          <div
            v-if="importNotes.length"
            class="curl-import-notes"
            role="status"
          >
            <p v-for="note in importNotes" :key="note">{{ $t(note) }}</p>
            <label class="native-checkbox"
              ><input v-model="acknowledgeNotes" type="checkbox" />{{
                $t('Import request with these differences')
              }}</label
            >
          </div>
        </VForm>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="shown = false"> {{ $t('Cancel') }} </VBtn>
        <VBtn
          variant="text"
          :disabled="
            !valid ||
            isParsing ||
            !hasParsed ||
            (importNotes.length > 0 && !acknowledgeNotes)
          "
          @click="apply"
        >
          {{ $t('OK') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script lang="ts">
import { mdiInformation } from '@mdi/js'
import {
  PropType,
  computed,
  defineComponent,
  inject,
  nextTick,
  ref,
  toRefs,
  watch,
} from 'vue'
import { VForm } from 'vuetify/components'
import { LoadFromKey } from '@/app/context'
import { importCurl } from '@/features/request/model/curl-import'

export default defineComponent({
  name: 'CurlImportDialog',
  props: {
    modelValue: {
      type: Object as PropType<{
        show: boolean
      }>,
      required: true,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const { modelValue } = toRefs(props)
    const shown = computed<boolean>({
      set: value => {
        emit('update:modelValue', {
          ...modelValue.value,
          show: value,
        })
      },
      get: () => {
        return modelValue.value.show
      },
    })

    const form = ref<InstanceType<typeof VForm>>()
    const valid = ref(false)
    const userInput = ref('')
    const parsingError = ref('')
    const isParsing = ref(false)
    const hasParsed = ref(false)
    let parseGeneration = 0
    let parsed: Awaited<ReturnType<typeof importCurl>> | undefined
    const importNotes = ref<string[]>([])
    const acknowledgeNotes = ref(false)

    watch(userInput, async value => {
      const generation = ++parseGeneration
      parsed = undefined
      hasParsed.value = false
      parsingError.value = ''
      importNotes.value = []
      acknowledgeNotes.value = false
      isParsing.value = !!value.trim()
      if (!value.trim()) return
      try {
        const candidate = await importCurl(value)
        if (generation !== parseGeneration) return
        parsed = candidate
        importNotes.value = candidate.warnings
        hasParsed.value = true
      } catch (error) {
        if (generation !== parseGeneration) return
        parsingError.value = (error as Error).message
      } finally {
        if (generation === parseGeneration) {
          isParsing.value = false
          await nextTick()
          form.value?.validate()
        }
      }
    })

    const loadFrom = inject(LoadFromKey)!
    const apply = async () => {
      if (isParsing.value || !hasParsed.value || !parsed) return
      if (importNotes.value.length && !acknowledgeNotes.value) return
      shown.value = false
      loadFrom(parsed.request, { rawMode: true, preserveOptions: true })
    }

    return {
      mdiInformation,

      shown,

      form,
      valid,
      isParsing,
      hasParsed,
      userInput,
      parsingError,
      importNotes,
      acknowledgeNotes,

      apply,
    }
  },
})
</script>

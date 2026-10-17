<template>
  <VDialog v-model="shown" max-width="100%" :width="580" persistent>
    <VCard>
      <VCardTitle> {{ $t('Test progress') }} </VCardTitle>
      <VCardText>
        <div class="ellipsis">
          <template v-if="!modelValue.status">
            {{ $t('Waiting response from test script...') }}
          </template>
          <template v-else
            >{{ $t('Status:') }} {{ $t(modelValue.status) }}</template
          >
        </div>
        <div v-if="modelValue.error" class="ellipsis">
          {{ $t('Error:') }} {{ $t(modelValue.error) }}
        </div>
        <VProgressLinear
          v-if="!modelValue.result"
          :model-value="modelValue.percentage"
          :indeterminate="!modelValue.percentage"
        />
        <VTable v-if="modelValue.result">
          <thead>
            <tr>
              <th
                v-for="(header, index) in modelValue.result.header"
                :key="`thead-${index}`"
                class="text-left"
              >
                {{ $t(header.text) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in modelValue.result.data"
              :key="`tbody-${index}`"
            >
              <td
                v-for="(header, hIndex) in modelValue.result.header"
                :key="`item-${index}-${hIndex}`"
              >
                {{ item[header.value] }}
              </td>
            </tr>
          </tbody>
        </VTable>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn
          v-if="!modelValue.result"
          variant="text"
          @click="controlTest('toggle')"
        >
          {{ $t('Pause / Resume') }}
        </VBtn>
        <VBtn
          v-if="!modelValue.result"
          variant="text"
          @click="controlTest('stop')"
        >
          {{ $t('Stop') }}
        </VBtn>
        <VBtn v-if="modelValue.result" variant="text" @click="shown = false">
          {{ $t('Close') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script lang="ts">
import { PropType, computed, defineComponent, inject, toRefs } from 'vue'
import { ControlTestKey } from '@/app/context'

export default defineComponent({
  name: 'ReloadTabDialog',
  props: {
    modelValue: {
      type: Object as PropType<{
        show: boolean
        percentage: number
        status: string
        error: string
        result: TestResult | null
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

    const controlTest = inject(ControlTestKey)!

    return {
      shown,

      controlTest,
    }
  },
})
</script>

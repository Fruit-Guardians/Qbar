<template>
  <VDialog v-model="shown" max-width="100%" :width="580" persistent>
    <VCard>
      <VCardTitle> {{ $t('SQL injection') }} </VCardTitle>
      <VCardText>
        <VForm ref="form" v-model="valid">
          <template v-if="modelValue.positionRequired">
            {{ $t('The number of columns must be') }}
            <span class="font-weight-medium">{{ $t('larger than') }}</span>
            {{ $t('or') }}
            <span class="font-weight-medium">{{ $t('equal to') }}</span>
            {{ $t('output position.') }}
          </template>
          <template v-else>
            {{
              $t('Enter the number of columns used in UNION SELECT statement.')
            }}
          </template>
          <div class="d-flex pt-3">
            <VTextField
              v-model="result.columns"
              v-disable-prevent-default.keydown
              :min="result.position"
              :label="$t('The number of columns')"
              :rules="[
                v =>
                  (/^[1-9][0-9]{0,}$/.test(v) &&
                    (!modelValue.positionRequired || v >= result.position)) ||
                  $t('Invalid value'),
              ]"
              style="flex: 1 0"
              type="number"
              variant="underlined"
              autofocus
            />
            <VTextField
              v-if="modelValue.positionRequired"
              v-model="result.position"
              v-disable-prevent-default.keydown
              class="pl-2"
              style="flex: 1 0"
              :label="$t('Output position')"
              :max="result.columns"
              :min="1"
              :rules="[
                v =>
                  (/^[1-9][0-9]{0,}$/.test(v) && v <= result.columns) ||
                  $t('Invalid value'),
              ]"
              type="number"
              variant="underlined"
            />
          </div>
        </VForm>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="shown = false"> {{ $t('Cancel') }} </VBtn>
        <VBtn variant="text" :disabled="!valid" @click="apply">
          {{ $t('OK') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script lang="ts">
import { PropType, computed, defineComponent, inject, ref, toRefs } from 'vue'
import { VForm } from 'vuetify/components'
import { ApplyFunctionKey } from '@/app/context'

export default defineComponent({
  name: 'SqlInjectionDialog',
  props: {
    modelValue: {
      type: Object as PropType<{
        show: boolean
        positionRequired: boolean
        func: string
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
    const result = ref({
      columns: 1,
      position: 1,
    })

    const applyFunction = inject(ApplyFunctionKey)!
    const apply = () => {
      shown.value = false
      applyFunction(modelValue.value.func, true, result.value)
    }

    return {
      shown,

      form,
      valid,
      result,

      apply,
    }
  },
})
</script>

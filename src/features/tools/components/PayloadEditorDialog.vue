<template>
  <VDialog v-model="shown" max-width="100%" :width="580" persistent>
    <VCard>
      <VCardTitle> {{ $t('Edit Custom Payload') }} </VCardTitle>
      <VCardText>
        <VForm ref="form" v-model="valid">
          <div class="d-flex flex-column">
            <VCombobox
              v-model="result.category"
              v-disable-prevent-default.keydown
              :items="availableCategories"
              class="monospaced"
              :label="$t('Category')"
              :rules="[v => !!v.length || $t('Invalid category')]"
              :menu-props="{ maxHeight: 200 }"
              variant="underlined"
            />
            <VTextField
              v-model="result.name"
              v-disable-prevent-default.keydown
              :label="$t('Name')"
              :rules="[v => !!v.length || $t('Invalid name')]"
              variant="underlined"
              autofocus
            />
            <VTextarea
              v-model="result.value"
              v-disable-prevent-default.keydown
              class="monospaced"
              :label="$t('Payload')"
              :rules="[v => !!v.length || $t('Invalid payload')]"
              :rows="1"
              variant="underlined"
              auto-grow
            />
          </div>
        </VForm>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="shown = false"> {{ $t('Cancel') }} </VBtn>
        <VBtn
          variant="text"
          :disabled="!valid"
          @click="
            () => {
              $emit('save', result)
              shown = false
            }
          "
        >
          {{ $t('OK') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script lang="ts">
import { cloneDeep } from 'lodash'
import { storeToRefs } from 'pinia'
import { PropType, computed, defineComponent, ref, toRefs } from 'vue'
import { VForm } from 'vuetify/components'
import { useCustomPayloadStore } from '@/features/tools/stores/index'

export default defineComponent({
  name: 'PayloadEditorDialog',
  props: {
    modelValue: {
      type: Object as PropType<{
        show: boolean
        payload: CustomPayload
      }>,
      required: true,
    },
  },
  emits: ['update:modelValue', 'save'],
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

    const { availableCategories } = storeToRefs(useCustomPayloadStore())

    const form = ref<InstanceType<typeof VForm>>()
    const valid = ref(false)
    const result = ref<CustomPayload>(cloneDeep(modelValue.value.payload))

    return {
      shown,

      availableCategories,

      form,
      valid,
      result,
    }
  },
})
</script>

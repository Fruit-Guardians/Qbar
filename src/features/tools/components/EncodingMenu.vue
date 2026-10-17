<template>
  <VMenu :submenu="submenu">
    <template #activator="{ props }">
      <VListItem
        v-if="submenu"
        role="menuitem"
        v-bind="props"
        :title="$t('Encoding')"
        :append-icon="mdiChevronRight"
        @click.stop
      />
      <VBtn v-else :append-icon="mdiMenuDown" variant="text" v-bind="props">
        {{ $t('Encoding') }}
      </VBtn>
    </template>
    <VList>
      <VListItem
        :title="$t('URL encode')"
        @click="applyFunction('Encode.URL.encode')"
      />
      <VListItem
        :title="$t('URL encode (all characters)')"
        @click="applyFunction('Encode.URL.encodeAllCharacters')"
      />
      <VListItem
        :title="$t('URL decode')"
        @click="applyFunction('Encode.URL.decode')"
      />
      <VListItem @click="applyFunction('Encode.URL.decodePlusAsSpace')">
        <VListItemTitle>{{ $t('URL decode (+ is space)') }}</VListItemTitle>
      </VListItem>
      <VDivider />
      <VListItem
        :title="$t('Base64 encode')"
        @click="applyFunction('Encode.Base64.encode')"
      />
      <VListItem
        :title="$t('Base64 decode')"
        @click="applyFunction('Encode.Base64.decode')"
      />
      <VDivider />
      <VListItem
        :title="$t('Hexadecimal encode')"
        @click="applyFunction('Encode.Hexadecimal.encode')"
      />
      <VListItem
        :title="$t('Hexadecimal decode')"
        @click="applyFunction('Encode.Hexadecimal.decode')"
      />
      <VDivider />
      <VListItem
        :title="$t('Unicode encode')"
        @click="applyFunction('Encode.Unicode.encode')"
      />
      <VListItem
        :title="$t('Unicode decode')"
        @click="applyFunction('Encode.Unicode.decode')"
      />
      <VDivider />
      <VListItem
        :title="$t('Escape ASCII with hex')"
        @click="applyFunction('Encode.Escape.hex')"
      />
      <VListItem
        :title="$t('Escape ASCII with oct')"
        @click="applyFunction('Encode.Escape.oct')"
      />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight, mdiMenuDown } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey } from '@/app/context'

export default defineComponent({
  name: 'EncodingMenu',
  props: { submenu: Boolean },
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!

    return {
      mdiChevronRight,
      mdiMenuDown,

      applyFunction,
    }
  },
})
</script>

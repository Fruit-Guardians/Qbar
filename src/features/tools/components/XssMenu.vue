<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        title="XSS"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="Vue.js"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Vue 2 - Interpolation')"
            @click="applyFunction('Payload.XSS.Vue.vue2Interpolation', true)"
          />
          <VListItem
            :title="$t('Vue 2 - Directive')"
            @click="applyFunction('Payload.XSS.Vue.vue2Directive', true)"
          />
          <VListItem
            :title="$t('Vue 3 - Interpolation')"
            @click="applyFunction('Payload.XSS.Vue.vue3Interpolation', true)"
          />
          <VListItem
            :title="$t('Vue 3 - Dynamic Component')"
            @click="applyFunction('Payload.XSS.Vue.vue3DynamicComponent', true)"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            :title="$t('Angular.js for strict CSP')"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('AngularJS >= 1.6 with Prototype Library')"
            @click="
              applyFunction(
                'Payload.XSS.AngularJS.angularJS1_6WithPrototype$on',
                true,
              )
            "
          />
          <VListItem
            :title="$t('AngularJS All Version (Chrome Only)')"
            @click="
              applyFunction('Payload.XSS.AngularJS.angularJSWith$event', true)
            "
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="HTML"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Encode with hex')"
            @click="applyFunction('Encode.Html.encode2Hex')"
          />
          <VListItem
            :title="$t('Encode with dec')"
            @click="applyFunction('Encode.Html.encode2Dec')"
          />
          <VListItem
            :title="$t('Encode with entity name')"
            @click="applyFunction('Encode.Html.encode2EntityName')"
          />
          <VListItem
            :title="$t('Decode with hex')"
            @click="applyFunction('Encode.Html.decodeFromHex')"
          />
          <VListItem
            :title="$t('Decode with dec')"
            @click="applyFunction('Encode.Html.decodeFromDec')"
          />
          <VListItem
            :title="$t('Decode with entity name')"
            @click="applyFunction('Encode.Html.decodeFromEntityName')"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="String.fromCharCode"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Encode')"
            @click="applyFunction('Encode.CharCode.encode')"
          />
          <VListItem
            :title="$t('Decode')"
            @click="applyFunction('Encode.CharCode.decode')"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            :title="$t('CTF Snippets')"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Get flag from \'/flag\'')"
            @click="applyFunction('Payload.XSS.snippets.getSamesiteFlag', true)"
          />
          <VListItem
            :title="$t('Get flag from document.cookie')"
            @click="applyFunction('Payload.XSS.snippets.getCookieFlag', true)"
          />
          <VListItem
            :title="$t('Get flag from localStorage.flag')"
            @click="applyFunction('Payload.XSS.snippets.getStorageFlag', true)"
          />
        </VList>
      </VMenu>
      <VListItem
        :title="$t('atob() helper')"
        @click="applyFunction('Encode.AtobHelper.encode')"
      />
      <VListItem
        :title="$t('Polyglot')"
        @click="applyFunction('Payload.XSS.polyglot', true)"
      />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey } from '@/app/context'

export default defineComponent({
  name: 'XssMenu',
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!

    return {
      mdiChevronRight,

      applyFunction,
    }
  },
})
</script>

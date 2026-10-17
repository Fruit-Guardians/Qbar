<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        :title="$t('Test')"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            :title="$t('Common paths')"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('From web root directory')"
            @click="testCommonPathsFromRoot"
          />
          <VListItem
            :title="$t('From current directory')"
            @click="testCommonPathsFromCurrent"
          />
        </VList>
      </VMenu>
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import browser from 'webextension-polyfill'
import { ControlTestKey } from '@/app/context'

export default defineComponent({
  name: 'TestMenu',
  setup() {
    const controlTest = inject(ControlTestKey)!

    const testCommonPathsFromRoot = () => {
      controlTest('start', 'tools/path-test.js', {
        payloadsPath: browser.runtime.getURL('payloads/paths.txt'),
        fromWebRoot: true,
      })
    }

    const testCommonPathsFromCurrent = () => {
      controlTest('start', 'tools/path-test.js', {
        payloadsPath: browser.runtime.getURL('payloads/paths.txt'),
        fromWebRoot: false,
      })
    }

    return {
      mdiChevronRight,

      testCommonPathsFromRoot,
      testCommonPathsFromCurrent,
    }
  },
})
</script>

<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        :title="$t('Shell')"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            :title="$t('Python Reverse Shell')"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            title="Python3"
            @click="openReverseShellPrompt('Payload.Shell.Python.py3')"
          />
          <VListItem
            title="Python"
            @click="openReverseShellPrompt('Payload.Shell.Python.py')"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="sh(bash) Reverse Shell"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            title="sh with -i"
            @click="openReverseShellPrompt('Payload.Shell.sh.withI')"
          />
          <VListItem
            title="sh without -i"
            @click="openReverseShellPrompt('Payload.Shell.sh.withoutI')"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="nc(ncat) Reverse Shell"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            title="nc with -e"
            @click="openReverseShellPrompt('Payload.Shell.nc.withE')"
          />
          <VListItem
            title="nc with -c"
            @click="openReverseShellPrompt('Payload.Shell.nc.withC')"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            :title="$t('PHP Webshell/Reverse Shell')"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Reverse Shell')"
            @click="openReverseShellPrompt('Payload.Shell.php.reverseShell')"
          />
          <VListItem
            :title="$t('with eval')"
            @click="applyFunction('Payload.Shell.php.webshellEval', true)"
          />
          <VListItem
            :title="$t('with exec')"
            @click="applyFunction('Payload.Shell.php.webshellExec', true)"
          />
          <VListItem
            :title="$t('with system')"
            @click="applyFunction('Payload.Shell.php.webshellSystem', true)"
          />
          <VListItem
            title="with `"
            @click="applyFunction('Payload.Shell.php.webshellBackquote', true)"
          />
          <VListItem
            :title="$t('with any function you want (except eval)')"
            @click="
              applyFunction('Payload.Shell.php.webshellAllFunction', true)
            "
          />
          <VListItem
            :title="
              $t(
                'with system && without alphabets and digits (urlencode already)',
              )
            "
            @click="
              applyFunction('Payload.Shell.php.webshellNoAlphabetsDigits', true)
            "
          />
        </VList>
      </VMenu>
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey, OpenReverseShellPromptKey } from '@/app/context'

export default defineComponent({
  name: 'ShellMenu',
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!
    const openReverseShellPrompt = inject(OpenReverseShellPromptKey)!

    return {
      mdiChevronRight,

      applyFunction,
      openReverseShellPrompt,
    }
  },
})
</script>

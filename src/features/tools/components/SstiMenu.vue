<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        title="SSTI"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="Jinja2 (Python)"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Show subclasses with tuple')"
            @click="
              applyFunction('Payload.SSTI.Jinja2.tuple2AllSubclasses', true)
            "
          />
          <VListItem
            :title="$t('From Tuple to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.tuple2RCE', true)"
          />
          <VListItem
            :title="$t('From Flask g to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.g2RCE', true)"
          />
          <VListItem
            :title="$t('From Flask url_for to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.urlFor2RCE', true)"
          />
          <VListItem
            :title="$t('From Flask application to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.application2RCE', true)"
          />
          <VListItem
            :title="$t('From Flask config to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.config2RCE', true)"
          />
          <VListItem
            :title="$t('From Flask get_flashed_messages to RCE')"
            @click="
              applyFunction('Payload.SSTI.Jinja2.getFlashedMessages2RCE', true)
            "
          />
          <VListItem
            :title="$t('From self to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.self2RCE', true)"
          />
          <VListItem
            :title="$t('From lipsum to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.lipsum2RCE', true)"
          />
          <VListItem
            :title="$t('From cycler to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.cycler2RCE', true)"
          />
          <VListItem
            :title="$t('From joiner to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.joiner2RCE', true)"
          />
          <VListItem
            :title="$t('From namespace to RCE')"
            @click="applyFunction('Payload.SSTI.Jinja2.namespace2RCE', true)"
          />
          <VListItem
            :title="$t('Add a new endpoint for RCE result')"
            @click="applyFunction('Payload.SSTI.Jinja2.addUrlRule', true)"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="Java"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Common Java Template RCE')"
            @click="applyFunction('Payload.SSTI.Java.commonRCE', true)"
          />
          <VListItem
            :title="$t('Thymeleaf RCE')"
            @click="openReverseShellPrompt('Payload.SSTI.Java.thymeleafRCE')"
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
  name: 'SstiMenu',
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

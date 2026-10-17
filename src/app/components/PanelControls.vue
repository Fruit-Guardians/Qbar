<template>
  <div
    v-show="!settingsOpen"
    class="mode-switch"
    role="group"
    :aria-label="$t('Request editing mode')"
  >
    <button
      :class="{ active: !rawMode }"
      :aria-pressed="!rawMode"
      :disabled="sending || !['GET', 'POST'].includes(method)"
      :title="
        $t(
          ['GET', 'POST'].includes(method)
            ? 'Basic supports GET and POST'
            : 'This HTTP method requires Raw mode.',
        )
      "
      @click="$emit('mode', false)"
    >
      {{ $t('Basic') }}
    </button>
    <button
      :class="{ active: rawMode }"
      :aria-pressed="rawMode"
      :disabled="sending"
      @click="$emit('mode', true)"
    >
      {{ $t('Raw') }}
    </button>
  </div>
  <ThemeMenu :mode="themeMode" @change="$emit('theme', $event)" />
  <VBtn
    id="qbar-settings-toggle"
    variant="text"
    :icon="mdiCogOutline"
    :aria-label="$t('Settings')"
    :title="$t('Settings and About QBar')"
    :aria-expanded="settingsOpen"
    aria-controls="qbar-settings"
    @click="$emit('settings')"
  />
</template>

<script setup lang="ts">
import { mdiCogOutline } from '@mdi/js'
import type { ThemeMode } from '../model/theme-preference'
import ThemeMenu from './ThemeMenu.vue'
defineProps<{
  rawMode: boolean
  method: string
  themeMode: ThemeMode
  sending: boolean
  settingsOpen: boolean
}>()
defineEmits<{
  mode: [enabled: boolean]
  theme: [mode: ThemeMode]
  settings: []
}>()
</script>

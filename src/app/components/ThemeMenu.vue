<template>
  <VMenu>
    <template #activator="{ props }"
      ><VBtn
        v-bind="props"
        class="theme-toggle"
        variant="text"
        :icon="
          mode === 'system'
            ? mdiThemeLightDark
            : mode === 'dark'
              ? mdiWeatherNight
              : mdiWhiteBalanceSunny
        "
        :aria-label="$t('Theme')"
        :title="$t('Theme') + ': ' + $t(labels[mode])"
    /></template>
    <VList role="menu" density="compact" :aria-label="$t('Theme')">
      <VListItem
        v-for="value in modes"
        :key="value"
        role="menuitemradio"
        :aria-checked="mode === value"
        :active="mode === value"
        :title="$t(labels[value])"
        :append-icon="mode === value ? mdiCheck : undefined"
        @click="$emit('change', value)"
      />
    </VList>
  </VMenu>
</template>

<script setup lang="ts">
import {
  mdiCheck,
  mdiThemeLightDark,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from '@mdi/js'
import type { ThemeMode } from '../model/theme-preference'
defineProps<{ mode: ThemeMode }>()
defineEmits<{ change: [mode: ThemeMode] }>()
const modes: ThemeMode[] = ['system', 'light', 'dark']
const labels = { system: 'Follow system', light: 'Light', dark: 'Dark' }
</script>

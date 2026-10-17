<template>
  <section
    id="qbar-settings"
    class="settings-page"
    :aria-label="$t('QBar settings')"
    @keydown.esc="$emit('close')"
  >
    <header class="settings-heading">
      <button
        class="settings-back"
        :aria-label="$t('Back to request')"
        :title="$t('Back to request · Esc')"
        @click="$emit('close')"
      >
        <VIcon :icon="mdiArrowLeft" size="18" />
      </button>
      <h1 ref="heading" tabindex="-1">{{ $t('Settings') }}</h1>
      <span class="settings-header-note">{{ $t('QBar preferences') }}</span>
    </header>
    <div class="settings-body">
      <nav class="settings-nav" :aria-label="$t('Settings sections')">
        <button
          v-for="name in sections"
          :key="name"
          :aria-current="section === name ? 'page' : undefined"
          :aria-controls="`settings-${name.toLowerCase()}`"
          @click="section = name"
        >
          <VIcon
            :icon="name === 'General' ? mdiTuneVariant : mdiInformationOutline"
            size="18"
          /><span>{{ $t(name) }}</span>
        </button>
      </nav>
      <div class="settings-content">
        <section
          v-if="section === 'General'"
          id="settings-general"
          class="settings-section"
          :aria-label="$t('General settings')"
        >
          <header class="settings-section-header">
            <h2>{{ $t('General') }}</h2>
            <p>{{ $t('Appearance and request preferences.') }}</p>
          </header>
          <section class="settings-group" aria-labelledby="appearance-title">
            <h3 id="appearance-title">{{ $t('Appearance') }}</h3>
            <label class="settings-row"
              ><span
                >{{ $t('Theme')
                }}<small>{{
                  $t('Follow system appearance, or choose a fixed theme.')
                }}</small></span
              ><select
                class="native-select"
                :aria-label="$t('Settings theme')"
                :value="themeMode || 'system'"
                @change="
                  $emit(
                    'theme',
                    ($event.target as HTMLSelectElement).value as ThemeMode,
                  )
                "
              >
                <option value="system">{{ $t('Follow system') }}</option>
                <option value="light">{{ $t('Light') }}</option>
                <option value="dark">{{ $t('Dark') }}</option>
              </select></label
            >
            <p v-if="themeNotice" class="settings-note" role="status">
              {{ $t(themeNotice) }}
            </p>
            <label class="settings-row"
              ><span
                >{{ $t('Language')
                }}<small>{{
                  $t(
                    'Changes immediately. Request and response bytes stay unchanged.',
                  )
                }}</small></span
              >
              <select
                class="native-select"
                :aria-label="$t('Interface language')"
                :value="languageMode"
                @change="setLocale(($event.target as HTMLSelectElement).value)"
              >
                <option value="system">
                  {{ $t('Follow browser language') }}
                </option>
                <option value="zh-CN" lang="zh-CN">简体中文</option>
                <option value="en" lang="en">English</option>
              </select>
            </label>
            <p v-if="localeNotice" class="settings-note" role="status">
              {{ $t(localeNotice) }}
            </p>
          </section>
          <section
            class="settings-group"
            aria-labelledby="request-defaults-title"
          >
            <h3 id="request-defaults-title">{{ $t('Requests') }}</h3>
            <label class="settings-row"
              ><span
                >{{ $t('Editor mode')
                }}<small>{{ $t('Basic supports GET and POST.') }}</small></span
              ><select
                class="native-select"
                :aria-label="$t('Settings editor mode')"
                :value="rawMode ? 'raw' : 'basic'"
                :disabled="sending"
                @change="
                  $emit(
                    'mode',
                    ($event.target as HTMLSelectElement).value === 'raw',
                  )
                "
              >
                <option
                  value="basic"
                  :disabled="!['GET', 'POST'].includes(request.method)"
                >
                  {{ $t('Basic') }}
                </option>
                <option value="raw">{{ $t('Raw') }}</option>
              </select></label
            >
            <label class="settings-row"
              ><span
                >{{ $t('Default timeout')
                }}<small>{{
                  $t('Used for this draft and new panels.')
                }}</small></span
              ><select
                class="native-select"
                :aria-label="$t('Default request timeout')"
                :value="request.timeoutMs || 30000"
                :disabled="sending"
                @change="
                  savePreference(
                    'timeoutMs',
                    Number(($event.target as HTMLSelectElement).value),
                  )
                "
              >
                <option
                  v-if="
                    request.timeoutMs &&
                    !TIMEOUT_OPTIONS.some(n => n === request.timeoutMs)
                  "
                  :value="request.timeoutMs"
                >
                  {{ request.timeoutMs / 1000 }} {{ $t('s (current)') }}
                </option>
                <option v-for="ms in TIMEOUT_OPTIONS" :key="ms" :value="ms">
                  {{ ms / 1000 }} {{ $t('seconds') }}
                </option>
              </select></label
            >
            <label class="settings-row"
              ><span
                >{{ $t('Follow redirects')
                }}<small>{{
                  $t('Applies to Raw and Fetch requests.')
                }}</small></span
              ><input
                :aria-label="$t('Settings follow redirects')"
                type="checkbox"
                :checked="request.followRedirect"
                :disabled="sending"
                @change="
                  savePreference(
                    'followRedirect',
                    ($event.target as HTMLInputElement).checked,
                  )
                "
            /></label>
            <p class="settings-group-note">
              {{
                $t(
                  'Imported and restored requests keep their own timeout. Settings never send requests.',
                )
              }}
            </p>
          </section>
          <section class="settings-group" aria-labelledby="history-title">
            <h3 id="history-title">
              {{ $t('History')
              }}<span class="settings-limit">{{
                $t('100 requests · 2 MB')
              }}</span>
            </h3>
            <label class="settings-row"
              ><span
                >{{ $t('Record requests')
                }}<small>{{
                  $t('Store request headers and bodies on this device.')
                }}</small></span
              ><input
                :aria-label="$t('Record request history')"
                type="checkbox"
                :checked="history?.enabled ?? true"
                :disabled="!connected || !history"
                @change="
                  $emit(
                    'recording',
                    ($event.target as HTMLInputElement).checked,
                  )
                "
            /></label>
            <div class="settings-group-footer">
              <p>
                {{
                  $t(
                    'Response bodies are not saved. Turning recording off keeps existing entries.',
                  )
                }}
              </p>
              <button class="native-button" @click="$emit('history')">
                {{ $t('Manage history') }}
              </button>
            </div>
          </section>
          <p v-if="historyError" class="settings-error" role="alert">
            {{ $t(historyError) }}
          </p>
          <p v-if="notice" class="settings-note" role="status">
            {{ $t(notice) }}
          </p>
        </section>
        <AboutQBar v-else />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { mdiArrowLeft, mdiInformationOutline, mdiTuneVariant } from '@mdi/js'
import { onMounted, onUnmounted, ref } from 'vue'
import browser from 'webextension-polyfill'
import { TIMEOUT_OPTIONS, preparePreference } from '../model/panel-preferences'
import type { ThemeMode } from '../model/theme-preference'
import AboutQBar from './AboutQBar.vue'
import type { HistorySnapshot } from '@/features/history/model/request-history'
import { usePanelLocale } from '@/shared/i18n'
const { mode: languageMode, setLocale, notice: localeNotice } = usePanelLocale()
const props = defineProps<{
  request: BrowseRequest
  rawMode: boolean
  themeMode?: ThemeMode
  themeNotice?: string
  sending: boolean
  connected: boolean
  history?: HistorySnapshot
  historyError: string
}>()
const emit = defineEmits<{
  close: []
  theme: [mode: ThemeMode]
  mode: [raw: boolean]
  requestPreference: [value: Partial<BrowseRequest>]
  recording: [enabled: boolean]
  history: []
}>()
const sections = ['General', 'About'] as const
const section = ref<(typeof sections)[number]>('General'),
  notice = ref(''),
  heading = ref<HTMLElement>()
let revision = 0
let writes = Promise.resolve()
onMounted(() => heading.value?.focus())
onUnmounted(() => {
  revision++
})
async function savePreference(
  key: 'followRedirect' | 'timeoutMs',
  value: unknown,
) {
  if (props.sending) return
  const id = ++revision
  try {
    const patch = preparePreference(key, value)
    emit('requestPreference', patch.request)
    const write = writes
      .catch(() => {})
      .then(() => browser.storage.local.set(patch.storage))
    writes = write
    await write
    if (id === revision) notice.value = 'Saved locally. No request sent.'
  } catch {
    if (id === revision)
      notice.value =
        'Saving failed. Draft changes apply only to this panel; retry to remember them.'
  }
}
</script>

<style lang="scss" scoped>
.settings-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--native-canvas);
  color: var(--native-text);
}
.settings-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  flex-shrink: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--native-border);
  background: var(--native-surface);
  h1 {
    font-size: 15px;
    line-height: 24px;
    font-weight: 500;
    outline: none;
  }
}
.settings-back {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--native-muted);
  &:hover {
    background: var(--native-hover);
    color: var(--native-text);
  }
}
.settings-header-note {
  margin-left: auto;
  color: var(--native-muted);
  font-size: 12px;
}
.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.settings-nav {
  width: 176px;
  flex-shrink: 0;
  padding: 16px 8px;
  border-right: 1px solid var(--native-border-subtle);
  button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 36px;
    padding: 0 12px;
    text-align: left;
    font: inherit;
    border-radius: 6px;
    color: var(--native-muted);
    margin-bottom: 4px;
  }
  button:hover {
    background: var(--native-hover);
  }
  button[aria-current='page'] {
    background: var(--native-selection);
    color: var(--native-on-selection);
    font-weight: 500;
  }
}
.settings-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 20px 28px 32px;
  scrollbar-gutter: stable;
}
.settings-section {
  max-width: 720px;
}
.settings-section-header {
  margin: 0 0 16px;
  h2 {
    font-size: 20px;
    line-height: 28px;
    font-weight: 500;
    margin: 0 0 4px;
  }
  p {
    color: var(--native-muted);
    font-size: 12px;
    line-height: 18px;
  }
}
.settings-group {
  background: var(--native-surface);
  border: 1px solid var(--native-border-subtle);
  border-radius: 8px;
  padding: 0 16px;
  margin-bottom: 12px;
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid var(--native-border-subtle);
  }
}
.settings-limit {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--native-muted);
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 56px;
  padding: 10px 0;
  border-bottom: 1px solid var(--native-border-subtle);
  &:last-child {
    border-bottom: 0;
  }
  > span {
    min-width: 0;
    font-weight: 500;
    line-height: 20px;
  }
  small {
    display: block;
    color: var(--native-muted);
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    margin-top: 2px;
  }
  select {
    width: 144px;
    flex-shrink: 0;
  }
  input {
    width: 16px;
    height: 16px;
    margin-right: 4px;
    accent-color: var(--native-primary);
    flex-shrink: 0;
  }
}
.settings-group-note,
.settings-note {
  color: var(--native-muted);
  font-size: 12px;
  line-height: 18px;
  padding: 10px 0 12px;
}
.settings-group-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 0 16px;
  p {
    flex: 1 1 230px;
    color: var(--native-muted);
    font-size: 12px;
    line-height: 18px;
  }
}
.settings-error {
  color: rgb(var(--v-theme-error));
  line-height: 20px;
}
@media (max-width: 640px) {
  .settings-body {
    flex-direction: column;
  }
  .settings-nav {
    width: 100%;
    display: flex;
    gap: 4px;
    border-right: 0;
    border-bottom: 1px solid var(--native-border);
    padding: 6px 12px;
    button {
      width: auto;
      margin: 0;
      min-height: 32px;
    }
  }
  .settings-content {
    padding: 18px 16px 28px;
  }
  .settings-header-note {
    display: none;
  }
  .settings-row {
    gap: 12px;
    select {
      width: 112px;
    }
  }
}
@media (max-width: 380px) {
  .settings-group {
    padding-inline: 12px;
  }
  .settings-limit {
    display: none;
  }
  .settings-row {
    gap: 8px;
  }
}
</style>

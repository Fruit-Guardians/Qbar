<template>
  <VApp class="qbar-app">
    <VAppBar ref="appBar" class="panel-toolbar" height="32" flat>
      <div class="native-toolbar">
        <div v-if="settingsOpen" class="settings-toolbar-brand">
          QBar <span>{{ $t('/ Settings') }}</span>
        </div>
        <div
          v-show="!settingsOpen"
          class="toolbar-scroll"
          role="toolbar"
          :aria-label="$t('QBar actions and tools')"
        >
          <VBtn
            variant="text"
            :prepend-icon="mdiTrayArrowDown"
            :title="$t('Load current tab · Alt+A')"
            :disabled="
              settingsOpen ||
              loading ||
              isSending ||
              connectionState !== 'connected'
            "
            @click="load()"
            >{{ $t(loading ? 'Loading…' : 'Load') }}</VBtn
          >
          <VMenu>
            <template #activator="{ props }"
              ><VBtn
                v-bind="props"
                class="load-options"
                variant="text"
                :icon="mdiMenuDown"
                :aria-label="$t('More load options')"
            /></template>
            <VList density="compact"
              ><VListItem
                :title="$t('Import cURL')"
                :prepend-icon="mdiConsoleLine"
                @click="curlCommandLoaderDialog.show = true"
            /></VList>
          </VMenu>
          <VBtn
            v-show="!isRawMode"
            variant="text"
            :disabled="settingsOpen"
            :title="$t('Split parameters · Alt+S')"
            @click="split"
            >{{ $t('Split') }}</VBtn
          >
          <VBtn
            variant="text"
            :disabled="settingsOpen || !request.url.trim()"
            :title="$t('Copy current request as cURL')"
            @click="copyCurl"
            >{{ $t('Copy cURL') }}</VBtn
          >
          <span class="tool-divider" />
          <VBtn
            id="request-tools-toggle"
            variant="text"
            aria-controls="request-tools"
            :aria-expanded="tools?.shown ?? false"
            :title="$t('Page requests, parameters, JSON, comparison and JWT')"
            @click="toggleTools"
            >{{ $t('Tools') }}</VBtn
          >
          <UtilitiesMenu />
        </div>
        <VBtn
          v-show="!settingsOpen"
          class="history-toggle"
          variant="text"
          :aria-label="$t('Request history')"
          :aria-expanded="historyOpen"
          aria-controls="request-history"
          :title="$t(historyError || 'Request history')"
          @click="toggleRecords"
          >{{ $t('History')
          }}<span v-if="historyError" :aria-label="$t('History error')">
            !</span
          ></VBtn
        >
        <VBtn
          v-show="!settingsOpen"
          id="evidence-toggle"
          class="history-toggle"
          variant="text"
          :aria-expanded="evidence.opened.value"
          aria-controls="evidence-shelf"
          @click="toggleEvidence"
          >{{ $t('Evidence') }}</VBtn
        >
        <PanelControls
          :raw-mode="isRawMode"
          :method="request.method"
          :theme-mode="themeMode"
          :sending="isSending"
          :settings-open="settingsOpen"
          @mode="enableRawMode"
          @theme="setThemeMode"
          @settings="toggleSettings"
        />
      </div>
    </VAppBar>
    <VMain>
      <SettingsPage
        v-if="settingsOpen"
        :request="request"
        :raw-mode="isRawMode"
        :theme-mode="themeMode"
        :sending="isSending"
        :connected="connectionState === 'connected'"
        :history="historySnapshot"
        :history-error="historyError"
        :theme-notice="themeNotice"
        @close="closeSettings"
        @theme="setThemeMode"
        @mode="enableRawMode"
        @request-preference="Object.assign(request, $event)"
        @recording="historyAction({ action: 'recording', enabled: $event })"
        @history="toggleRecords"
      />
      <div
        v-show="!settingsOpen"
        class="panel-layout"
        :class="{
          'history-open': historyOpen,
          'evidence-open': evidence.opened.value,
        }"
      >
        <div class="workspace devtools-workspace">
          <RepeaterTabs :controller="tabs" :busy="isSending" />
          <PreferenceNotice :message="themeNotice" @close="themeNotice = ''" />
          <WorkspaceNotice
            :state="connectionState"
            :notice="loadNotice"
            :reason="loadReason"
            :loading="loading"
            :sending="isSending"
            @reconnect="reconnect"
            @reload="refreshAndLoad"
            @permissions="openPermissions"
            @dismiss="dismissLoadNotice"
          />
          <component
            :is="isRawMode ? RawRequestEditor : BasicRequestEditor"
            :key="tabs.active.value"
            ref="requestPanel"
            v-model="request"
            v-bind="{
              response,
              durationMs: lastDurationMs,
              requestKey: tabs.active.value,
              sending: isSending,
            }"
            @focus="onFocus"
            @render="onRenderRequested"
            ><template #actions
              ><SendAction
                :disabled="connectionState !== 'connected'"
                :url="request.url"
                :sending="isSending"
                @send="execute" /></template
          ></component>
          <ExecutionStatus
            :status-code="response?.statusCode"
            :execution-status="executionStatus"
            :is-sending="isSending"
            :elapsed-ms="elapsedMs"
            :last-duration-ms="lastDurationMs"
            :copy-notice="copyNotice"
            :request-source="requestSource"
            :diagnostic="diagnostic"
            :timeout-ms="request.timeoutMs"
            @cancel="cancelRequest"
            @diagnostics="copyDiagnostics"
            @timeout="request.timeoutMs = $event"
          />
          <footer v-if="isPreview" class="preview-note">
            {{ $t('Development preview · no network requests sent') }}
          </footer>
        </div>
        <RequestTools
          ref="tools"
          :request="request"
          :response="response"
          :exchange="lastExchange"
          :sending="isSending"
          @load="loadFrom($event, { rawMode: true })"
          @save-comparison="
            ((evidence.opened.value = true),
            evidence.action({ action: 'save', ...$event }))
          "
          @apply="Object.assign(request, $event)"
        />
        <EvidenceShelf
          :controller="evidence"
          :attempt="lastAttempt"
          :sending="isSending"
          @restore="restoreEvidence"
        />
        <HistorySidebar
          v-if="historyOpen"
          id="request-history"
          :snapshot="historySnapshot"
          :error="historyError"
          :sending="isSending"
          @close="closeHistory"
          @action="historyAction"
          @restore="restoreHistory"
          @copy="copyHistoryCurl"
        />
      </div>
    </VMain>
    <CurlImportDialog
      v-if="curlCommandLoaderDialog.show"
      v-model="curlCommandLoaderDialog"
    />
    <SqlInjectionDialog v-model="sqlInjectionDialog" />
    <ReverseShellDialog v-model="reverseShellDialog" />
    <PayloadManagerDialog v-model="customPayloadDialog" />
    <TestProgressDialog v-model="testProgressDialog" />
    <VSnackbar v-model="snackbar.show" color="error" :timeout="3000" bottom>
      {{ $t(snackbar.text) }}
      <template #actions
        ><VBtn variant="text" @click="snackbar.show = false">{{
          $t('Close')
        }}</VBtn></template
      >
    </VSnackbar>
  </VApp>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ExecutionStatus from './components/ExecutionStatus.vue'
import PanelControls from './components/PanelControls.vue'
import PreferenceNotice from './components/PreferenceNotice.vue'
import SettingsPage from './components/SettingsPage.vue'
import WorkspaceNotice from './components/WorkspaceNotice.vue'
import { usePanelNavigation } from './composables/use-panel-navigation'
import { usePanelWorkspace } from './composables/use-panel-workspace'
import EvidenceShelf from '@/features/evidence/components/EvidenceShelf.vue'
import HistorySidebar from '@/features/history/components/HistorySidebar.vue'
import BasicRequestEditor from '@/features/request/components/BasicRequestEditor.vue'
import CurlImportDialog from '@/features/request/components/CurlImportDialog.vue'
import RawRequestEditor from '@/features/request/components/RawRequestEditor.vue'
import SendAction from '@/features/request/components/SendAction.vue'
import PayloadManagerDialog from '@/features/tools/components/PayloadManagerDialog.vue'
import ReverseShellDialog from '@/features/tools/components/ReverseShellDialog.vue'
import SqlInjectionDialog from '@/features/tools/components/SqlInjectionDialog.vue'
import TestProgressDialog from '@/features/tools/components/TestProgressDialog.vue'
import UtilitiesMenu from '@/features/tools/components/UtilitiesMenu.vue'
import RepeaterTabs from '@/features/workbench/components/RepeaterTabs.vue'
import RequestTools from '@/features/workbench/components/RequestTools.vue'
import type { Exchange } from '@/features/workbench/model/exchange-diff'
const tools = ref<InstanceType<typeof RequestTools>>()
const {
  mdiConsoleLine,
  mdiMenuDown,
  mdiTrayArrowDown,
  isPreview,
  appBar,
  requestPanel,
  connectionState,
  reconnect,
  loading,
  loadNotice,
  dismissLoadNotice,
  loadReason,
  requestSource,
  refreshAndLoad,
  openPermissions,
  diagnostic,
  copyDiagnostics,
  curlCommandLoaderDialog,
  sqlInjectionDialog,
  reverseShellDialog,
  customPayloadDialog,
  testProgressDialog,
  snackbar,
  request,
  response,
  lastExchange,
  lastAttempt,
  tabs,
  evidence,
  loadFrom,
  isRawMode,
  load,
  split,
  execute,
  isSending,
  executionStatus,
  elapsedMs,
  lastDurationMs,
  copyNotice,
  cancelRequest,
  copyCurl,
  historyOpen,
  historySnapshot,
  historyError,
  toggleHistory,
  closeHistory,
  historyAction,
  restoreHistory,
  copyHistoryCurl,
  enableRawMode,
  setThemeMode,
  themeMode,
  themeNotice,
  onFocus,
  onRenderRequested,
} = usePanelWorkspace()
const {
  settingsOpen,
  closeSettings,
  toggleSettings,
  toggleTools,
  toggleRecords,
} = usePanelNavigation(
  tools,
  historyOpen,
  toggleHistory,
  closeHistory,
  evidence.close,
)
function toggleEvidence() {
  tools.value?.hide()
  historyOpen.value = false
  settingsOpen.value = false
  evidence.toggle()
}
function restoreEvidence(exchange: Exchange) {
  if (isSending.value || tabs.tabs.value.length >= 20) return
  tabs.add()
  loadFrom(exchange.request, {
    rawMode: exchange.rawMode ?? true,
    preserveOptions: true,
  })
}
</script>

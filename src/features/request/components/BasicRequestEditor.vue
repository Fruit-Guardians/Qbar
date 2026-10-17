<template>
  <div class="basic-panel">
    <div class="address-row">
      <select
        v-model="request.method"
        class="native-select method-select"
        :data-method="request.method"
        :aria-label="$t('HTTP method')"
      >
        <option>GET</option>
        <option>POST</option>
      </select>
      <textarea
        id="target-url"
        ref="urlInput"
        v-model="request.url"
        class="native-url code-input"
        :aria-label="$t('Target URL')"
        placeholder="https://example.com/path?key=value"
        rows="1"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        @focus="onFocus"
      />
      <slot name="actions" />
    </div>
    <WorkspaceSplit pane="basic"
      ><template #request>
        <div
          class="request-config-tabs"
          role="tablist"
          :aria-label="$t('Request')"
        >
          <button
            v-for="tab in ['Params', 'Headers', 'Body', 'Auth']"
            :id="`config-${tab}`"
            :key="tab"
            role="tab"
            :aria-selected="activeTab === tab"
            :aria-controls="`config-panel-${tab}`"
            :tabindex="activeTab === tab ? 0 : -1"
            @click="activeTab = tab"
            @keydown="navigateTabs($event, tab)"
          >
            {{ $t(tab)
            }}<span v-if="tab === 'Headers'" class="config-count">{{
              request.headers.filter(h => h.enabled).length
            }}</span
            ><span
              v-if="tab === 'Body' && request.body.content"
              class="config-dot"
            />
          </button>
        </div>
        <div class="basic-config">
          <section
            v-show="activeTab === 'Auth'"
            id="config-panel-Auth"
            role="tabpanel"
            aria-labelledby="config-Auth"
          >
            <SessionEditor
              :key="requestKey"
              :request="request"
              :sending="sending"
              @apply="Object.assign(request, $event)"
            />
          </section>
          <section
            v-show="activeTab === 'Params'"
            id="config-panel-Params"
            role="tabpanel"
            aria-labelledby="config-Params"
            class="query-config"
          >
            <QueryEditor
              :url="request.url"
              :sending="sending"
              @update="request.url = $event"
            />
          </section>
          <section
            v-show="activeTab === 'Body'"
            id="config-panel-Body"
            role="tabpanel"
            aria-labelledby="config-Body"
            class="body-pane"
          >
            <div class="pane-heading">
              <h2>{{ $t('Body') }}</h2>
              <label class="native-checkbox"
                ><input
                  v-model="isBodyEnabled"
                  type="checkbox"
                  :aria-label="$t('Use POST method')"
                />{{ $t('Use POST') }}</label
              >
              <select
                v-show="isBodyEnabled"
                v-model="request.body.enctype"
                class="native-select content-type"
                :aria-label="$t('Content type')"
              >
                <option
                  v-for="enctype in supportedEnctype"
                  :key="enctype"
                  :value="enctype"
                >
                  {{ enctype }}
                </option>
              </select>
            </div>
            <p
              v-if="
                isBodyEnabled &&
                request.body.enctype !== 'application/x-www-form-urlencoded'
              "
              class="body-transport-note"
            >
              {{
                $t('This body uses Raw mode on Send to preserve its content.')
              }}
            </p>
            <textarea
              v-show="isBodyEnabled"
              v-model="request.body.content"
              class="native-editor code-input"
              :aria-label="$t('Request body')"
              :placeholder="$t('Enter request body')"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              @focus="onFocus"
            />
            <div v-if="!isBodyEnabled" class="empty-note">
              {{
                $t('This GET request has no body. Enable Use POST to edit it.')
              }}
            </div>
          </section>
          <section
            v-show="activeTab === 'Headers'"
            id="config-panel-Headers"
            role="tabpanel"
            aria-labelledby="config-Headers"
            class="headers-pane"
          >
            <div class="pane-heading">
              <h2>
                {{ $t('Headers') }}
                <span class="header-count">{{
                  request.headers.filter(h => h.enabled).length
                }}</span>
              </h2>
              <button class="text-action add-header" @click="addHeader">
                <VIcon :icon="mdiPlus" size="14" />{{ $t('Add header') }}
              </button>
            </div>
            <div class="header-table">
              <div class="header-table-heading">
                <span /><span>{{ $t('Name') }}</span
                ><span>{{ $t('Value') }}</span
                ><span />
              </div>
              <div
                v-for="(header, index) in request.headers"
                :key="header._createdAt"
                class="header-table-row"
                :class="{ 'header-disabled': !header.enabled }"
              >
                <input
                  v-model="header.enabled"
                  type="checkbox"
                  :aria-label="
                    $t('Enable header {index}', { index: index + 1 })
                  "
                />
                <input
                  v-model="header.name"
                  class="table-input code-input"
                  list="common-header-names"
                  :aria-label="$t('Header name {index}', { index: index + 1 })"
                  :placeholder="$t('Header name')"
                  spellcheck="false"
                  autocomplete="off"
                  autocapitalize="off"
                  autocorrect="off"
                  @focus="onFocus"
                />
                <div class="header-value-cell">
                  <input
                    v-model="header.value"
                    class="table-input code-input"
                    :aria-label="
                      $t('Header value {index}', { index: index + 1 })
                    "
                    :placeholder="$t('Empty value')"
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                    autocorrect="off"
                    @focus="onFocus"
                  /><button
                    v-if="!header.value.length"
                    class="header-empty-action"
                    @click="
                      header.removeIfEmptyValue = !header.removeIfEmptyValue
                    "
                  >
                    {{
                      $t(
                        header.removeIfEmptyValue
                          ? 'Remove when empty'
                          : 'Send empty value',
                      )
                    }}
                  </button>
                </div>
                <button
                  class="delete-header"
                  :aria-label="
                    $t('Delete header {index}', { index: index + 1 })
                  "
                  @click="deleteHeader(index)"
                >
                  <VIcon :icon="mdiClose" size="14" />
                </button>
              </div>
              <div v-if="!request.headers.length" class="empty-note">
                {{ $t('No custom headers.') }}
              </div>
              <datalist id="common-header-names">
                <option
                  v-for="name in commonRequestHeaders"
                  :key="name"
                  :value="name"
                />
              </datalist>
            </div>
          </section>
        </div> </template
      ><template #response>
        <section class="basic-response">
          <div class="pane-heading">
            <h2>{{ $t('Response') }}</h2>
            <span
              v-if="response"
              class="response-status"
              :class="{ 'status-error': response.statusCode >= 400 }"
              >{{ response.statusCode }} {{ response.statusMessage }}</span
            >
            <span
              v-if="response && durationMs !== null"
              class="response-duration"
              >{{ durationMs }} ms</span
            >
            <span v-if="response" class="pane-note">{{
              response.bodyUnavailable
                ? $t('Body hidden')
                : response.bodyBytes === undefined
                  ? ''
                  : formatBytes(response.bodyBytes)
            }}</span>
          </div>
          <div v-if="response" class="response-content">
            <ResponseContent :response="response" @render="$emit('render')" />
          </div>
          <div v-else class="response-empty">
            <span>{{ $t('Send a request to inspect the response.') }}</span>
          </div>
        </section>
      </template></WorkspaceSplit
    >
  </div>
</template>

<script lang="ts">
import { mdiClose, mdiPlus } from '@mdi/js'
import {
  PropType,
  computed,
  defineComponent,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import ResponseContent from './ResponseContent.vue'
import SessionEditor from './SessionEditor.vue'
import WorkspaceSplit from './WorkspaceSplit.vue'
import { formatBytes } from '@/features/request/model/request'
import bodyProcessors from '@/features/request/processors/index'
import QueryEditor from '@/features/workbench/components/QueryEditor.vue'
import { CommonRequestHeaders } from '@/shared/http-headers'

export default defineComponent({
  name: 'BasicRequestEditor',
  components: { QueryEditor, ResponseContent, WorkspaceSplit, SessionEditor },
  props: {
    requestKey: { type: String, default: '' },
    durationMs: { type: Number as PropType<number | null>, default: null },
    sending: Boolean,
    response: { type: Object as PropType<BrowseResponse>, default: undefined },
    modelValue: {
      type: Object as PropType<BrowseRequest>,
      required: true,
    },
  },
  emits: ['update:modelValue', 'focus', 'render'],
  setup(props, { emit }) {
    const request = reactive(props.modelValue)
    watch(
      request,
      value => {
        emit('update:modelValue', value)
      },
      { deep: true },
    )

    const activeTab = ref('Params')
    function navigateTabs(event: KeyboardEvent, tab: string) {
      const tabs = ['Params', 'Headers', 'Body', 'Auth']
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return
      event.preventDefault()
      activeTab.value =
        tabs[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 3
              : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 3)) % 4
        ]
      void nextTick(() =>
        document.getElementById(`config-${activeTab.value}`)?.focus(),
      )
    }
    /* Constants */
    const supportedEnctype = bodyProcessors.getNames()

    /* DOM element and refs */
    const urlInput = ref<HTMLTextAreaElement>()

    watch(
      () => request.url,
      async () => {
        await nextTick()
        const input = urlInput.value
        if (!input) {
          return
        }
        input.style.height = 'auto'
        input.style.height = `${Math.min(96, Math.max(26, input.scrollHeight))}px`
      },
      { immediate: true },
    )

    /* Computed */
    const isBodyEnabled = computed({
      get: () => {
        return request.method === 'POST'
      },
      set: value => {
        request.method = value ? 'POST' : 'GET'
      },
    })

    /* Headers */
    const addHeader = () => {
      request.headers.unshift({
        enabled: true,
        name: '',
        value: '',
        removeIfEmptyValue: true,
        _createdAt: Date.now(),
      })
    }

    const deleteHeader = (index: number) => {
      request.headers.splice(index, 1)
    }

    /* Events */
    const onFocus = (event: FocusEvent) => {
      emit('focus', event)
    }

    /* Misc */
    const focus = () => {
      urlInput.value?.focus()
    }

    return {
      formatBytes,
      activeTab,
      navigateTabs,
      mdiClose,
      mdiPlus,

      supportedEnctype,
      commonRequestHeaders: CommonRequestHeaders,

      urlInput,

      request,
      isBodyEnabled,

      addHeader,
      deleteHeader,

      onFocus,

      focus,
      validate: () => true,
    }
  },
})
</script>

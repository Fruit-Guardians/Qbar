<template>
  <div class="raw-panel">
    <div class="address-row">
      <select
        v-model="request.method"
        class="native-select method-select"
        :data-method="request.method"
        :aria-label="$t('HTTP method')"
      >
        <option
          v-for="method in [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'HEAD',
            'OPTIONS',
          ]"
          :key="method"
          :value="method"
        >
          {{ method }}
        </option>
      </select>
      <label for="target-host">{{ $t('Host') }}</label>
      <select
        v-model="rawRequest.scheme"
        class="native-select scheme-select"
        :aria-label="$t('URL scheme')"
      >
        <option v-for="scheme in supportedScheme" :key="scheme" :value="scheme">
          {{ scheme }}
        </option></select
      ><span class="scheme-divider">://</span>
      <input
        id="target-host"
        v-model="rawRequest.host"
        class="native-host code-input"
        :aria-label="$t('Target host')"
        placeholder="example.com or example.com:8443"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        @blur="onBlur"
        @focus="onFocus"
      />
      <slot name="actions" />
    </div>
    <div class="raw-request-options">
      <label class="native-checkbox"
        ><input
          v-model="request.followRedirect"
          type="checkbox"
          @change="saveRedirects(request.followRedirect)"
        />{{ $t('Follow redirects') }}</label
      >
    </div>
    <details class="raw-session-controls">
      <summary>{{ $t('Auth & Cookie') }}</summary>
      <SessionEditor
        :key="requestKey"
        :request="request"
        :sending="sending"
        @apply="Object.assign(request, $event)"
      />
    </details>
    <WorkspaceSplit pane="raw"
      ><template #request>
        <section class="request-pane">
          <div class="pane-heading">
            <h2>{{ $t('Request') }}</h2>
            <span
              class="pane-note"
              :title="
                $t(
                  'Protocol, Content-Length and Transfer-Encoding are managed by the browser on Send',
                )
              "
              >{{ $t('HTTP · browser-managed framing') }}</span
            >
          </div>
          <div
            class="request-source-editor"
            :class="{ 'is-composing': composing, 'has-gutter': !!lineNumbers }"
          >
            <pre
              v-if="lineNumbers"
              ref="gutter"
              class="request-line-numbers"
              aria-hidden="true"
              >{{ lineNumbers }}</pre
            >
            <pre
              ref="preview"
              class="request-highlight-layer"
              aria-hidden="true"
              v-html="syntax.html"
            />
            <textarea
              ref="rawRequestInput"
              v-model="rawRequest.content"
              class="native-editor code-input request-highlight-input"
              :aria-label="$t('Raw HTTP request')"
              :aria-describedby="
                syntax.limited ? 'request-highlight-limit' : undefined
              "
              placeholder="GET / HTTP/1.1&#10;Host: example.com&#10;"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              wrap="off"
              @scroll="syncScroll"
              @compositionstart="composing = true"
              @compositionend="composing = false"
              @blur="onBlur"
              @focus="onFocus"
            />
          </div>
          <p
            v-if="syntax.limited"
            id="request-highlight-limit"
            class="pane-note"
          >
            {{
              $t(
                'Large request · plain-text editing (highlight limit: 256 KiB / 10,000 lines)',
              )
            }}
          </p>
          <p v-if="rawRequestError" class="request-error" role="alert">
            {{ $t(rawRequestError) }}
          </p>
        </section> </template
      ><template #response>
        <section class="response-pane">
          <div class="pane-heading">
            <h2>{{ $t('Response') }}</h2>
            <span
              v-if="response"
              class="response-status"
              :class="{ 'status-error': response.statusCode >= 400 }"
              >{{ response.statusCode }} {{ response.statusMessage }}</span
            ><span
              v-if="response && durationMs !== null"
              class="response-duration"
              >{{ durationMs }} ms</span
            ><span v-if="response" class="pane-note">{{
              response.bodyUnavailable
                ? $t('Body hidden')
                : response.bodyBytes === undefined
                  ? ''
                  : formatBytes(response.bodyBytes)
            }}</span
            ><label class="native-checkbox render-option"
              ><input
                :checked="isAutoRenderEnabled"
                type="checkbox"
                :aria-label="$t('Auto-render in page')"
                :title="
                  $t(
                    'When enabled, each completed response replaces the inspected page. Off by default.',
                  )
                "
                @change="
                  setAutoRender(($event.target as HTMLInputElement).checked)
                "
              />{{ $t('Auto-render in page') }}</label
            >
          </div>
          <p v-if="renderNotice" class="request-error" role="status">
            {{ $t(renderNotice) }}
          </p>
          <div v-if="!response" class="empty-note response-empty">
            {{ $t('Send a request to inspect the response.') }}
          </div>
          <div v-else class="response-content">
            <ResponseContent
              :aria-label="$t('HTTP response')"
              :response="response"
              @render="renderResponse"
            />
          </div>
        </section> </template
    ></WorkspaceSplit>
  </div>
</template>

<script lang="ts">
import httpZ from 'http-z'
import { PropType, defineComponent, nextTick, reactive, ref, watch } from 'vue'
import SessionEditor from './SessionEditor.vue'
import WorkspaceSplit from './WorkspaceSplit.vue'
import ResponseContent from '@/features/request/components/ResponseContent.vue'
import { useRequestHighlight } from '@/features/request/composables/use-request-highlight'
import { useResponseRendering } from '@/features/request/composables/use-response-rendering'
import { formatBytes, methodAllowsBody } from '@/features/request/model/request'
import bodyProcessors from '@/features/request/processors/index'

export default defineComponent({
  name: 'RawRequestEditor',
  components: {
    ResponseContent,
    WorkspaceSplit,
    SessionEditor,
  },
  props: {
    sending: Boolean,
    requestKey: { type: String, default: '' },
    durationMs: { type: Number as PropType<number | null>, default: null },
    modelValue: {
      type: Object as PropType<BrowseRequest>,
      required: true,
    },
    response: {
      type: undefined as unknown as PropType<BrowseResponse | undefined>,
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

    /* Constants */
    const supportedScheme = ['HTTPS', 'HTTP']
    const defaultScheme = supportedScheme[0]

    /* DOM element and refs */
    const rawRequestInput = ref<HTMLTextAreaElement>()

    /* Request */
    const rawRequest = reactive({
      scheme: defaultScheme,
      host: '',
      content: '',
    })
    const rawRequestError = ref('')
    const { preview, gutter, lineNumbers, syntax, composing, syncScroll } =
      useRequestHighlight(() => rawRequest.content, rawRequestInput)

    /* Converter */
    let isEditing = false

    const requestWatcher = (request: BrowseRequest) => {
      if (!request.url.trim()) {
        return
      }

      try {
        const parsedUrl = new URL(request.url)
        const headers = request.headers
          .filter(({ enabled }) => enabled)
          .map(({ name, value }) => ({ name, value }))
        const isBodyEnabled = methodAllowsBody(request.method)
        const scheme = parsedUrl.protocol.slice(0, -1).toUpperCase()

        const builtRawRequest = httpZ.build({
          method: request.method,
          protocolVersion: 'HTTP/1.1',
          target: `${parsedUrl.pathname}${parsedUrl.search}`,
          host: parsedUrl.host,
          headers,
          body: {
            text: isBodyEnabled ? request.body.content : '',
          },
        } as any)

        if (!isEditing) {
          rawRequest.scheme = supportedScheme.includes(scheme)
            ? scheme
            : defaultScheme
          rawRequest.host = parsedUrl.host
          rawRequest.content = builtRawRequest
        }

        rawRequestError.value = ''
      } catch (error) {
        rawRequestError.value = (error as Error).message
      }
    }
    watch(
      () => [
        props.modelValue.method,
        props.modelValue.url,
        props.modelValue.headers,
        props.modelValue.body,
      ],
      () => requestWatcher(props.modelValue),
      { deep: true, immediate: true },
    )

    watch(
      rawRequest,
      newRawRequest => {
        try {
          const source = newRawRequest.content
          const separator = /\r?\n\r?\n/.exec(source)
          const headerText = separator
            ? source.slice(0, separator.index)
            : source
          const bodyText = separator
            ? source.slice(separator.index + separator[0].length)
            : ''
          const model = httpZ.parse(
            headerText.replace(/\r?\n/g, '\r\n') + '\r\n\r\n',
          ) as httpZ.HttpZRequestModel
          const contentType =
            model.headers?.find(
              ({ name }) => name.toLowerCase() === 'content-type',
            )?.value ?? ''

          const method = model.method.toUpperCase()
          const url = new URL(
            model.target,
            `${newRawRequest.scheme}://${newRawRequest.host}`,
          ).toString()
          request.method = method
          request.url = url
          request.body.content = bodyText ?? ''
          request.body.enctype =
            bodyProcessors.findByContentType(contentType)?.getName() ??
            bodyProcessors.getDefaultProcessorName()

          const previous = request.headers
          const used = new Set<number>()
          const headers = (model.headers ?? []).map((header, idx) => {
            const oldIndex = previous.findIndex(
              (old, index) =>
                !used.has(index) &&
                old.name.toLowerCase() === header.name.toLowerCase(),
            )
            if (oldIndex >= 0) used.add(oldIndex)
            const old = previous[oldIndex]
            return {
              enabled: true,
              name: header.name,
              value: header.value ?? '',
              removeIfEmptyValue:
                old?.value === (header.value ?? '')
                  ? old.removeIfEmptyValue
                  : false,
              _createdAt: old?._createdAt ?? Date.now() * 1000 + idx,
            }
          })
          request.headers = [
            ...headers,
            ...previous
              .filter((_, index) => !used.has(index))
              .map(header => ({ ...header, enabled: false })),
          ]
        } catch (error) {
          rawRequestError.value = (error as Error).message
        }
      },
      { deep: true },
    )

    /* Functionality */
    const renderResponse = () => {
      emit('render')
    }
    const {
      enabled: isAutoRenderEnabled,
      setEnabled: setAutoRender,
      saveRedirects,
      notice: renderNotice,
    } = useResponseRendering(() => props.response, renderResponse)

    /* Events */
    const onBlur = () => {
      isEditing = false
      if (rawRequestInput.value?.offsetHeight && !rawRequestError.value) {
        requestWatcher(props.modelValue)
      }
    }

    const onFocus = (event: FocusEvent) => {
      isEditing = true
      emit('focus', event)
    }

    /* Misc */
    const focus = () => {
      nextTick(() => {
        const dom = rawRequestInput.value!
        dom.setSelectionRange(0, 0)
        dom.focus()
      })
    }

    return {
      formatBytes,
      supportedScheme,

      rawRequestInput,
      preview,
      gutter,
      lineNumbers,
      syntax,
      composing,
      syncScroll,

      request,
      rawRequest,
      rawRequestError,

      isAutoRenderEnabled,
      setAutoRender,
      saveRedirects,
      renderNotice,

      renderResponse,

      onFocus,
      onBlur,

      focus,
      validate: () => {
        if (rawRequestError.value) throw new Error(rawRequestError.value)
        return true
      },
    }
  },
})
</script>

<style src="./request-highlight.scss" lang="scss" />

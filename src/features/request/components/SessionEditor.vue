<template>
  <section class="session-editor" :aria-label="$t('Auth & Cookie')">
    <p class="session-note">
      {{
        $t(
          'Applies only to this request draft. Applying never sends a request or changes browser cookies.',
        )
      }}
    </p>
    <fieldset :disabled="sending">
      <legend>{{ $t('Authentication') }}</legend>
      <label
        >{{ $t('Auth type')
        }}<select v-model="mode" class="native-select">
          <option value="bearer">Bearer</option>
          <option value="basic">Basic</option>
          <option value="custom">{{ $t('Custom header') }}</option>
          <option value="none">{{ $t('Remove Authorization') }}</option>
        </select></label
      >
      <label v-if="mode === 'bearer'"
        >{{ $t('Bearer token')
        }}<input
          v-model="token"
          class="session-input"
          type="password"
          autocomplete="off"
          spellcheck="false"
      /></label>
      <template v-if="mode === 'basic'"
        ><label
          >{{ $t('Username')
          }}<input
            v-model="username"
            class="session-input"
            autocomplete="off" /></label
        ><label
          >{{ $t('Password')
          }}<input
            v-model="password"
            class="session-input"
            type="password"
            autocomplete="off" /></label
      ></template>
      <template v-if="mode === 'custom'"
        ><label
          >{{ $t('Header name')
          }}<input
            v-model="name"
            class="session-input"
            spellcheck="false" /></label
        ><label
          >{{ $t('Header value')
          }}<input
            v-model="value"
            class="session-input"
            type="password"
            autocomplete="off" /></label
      ></template>
      <div class="session-actions">
        <button class="native-button" @click="auth">
          {{ $t('Apply authentication') }}</button
        ><button class="text-action" @click="jwt = !jwt">
          {{ $t('Inspect request JWT') }}
        </button>
      </div>
    </fieldset>
    <JwtInspector
      v-if="jwt"
      :request="request"
      :sending="sending"
      @apply="$emit('apply', $event)"
      @close="jwt = false"
    />
    <fieldset :disabled="sending">
      <legend>Cookie</legend>
      <label
        >{{ $t('Cookie policy')
        }}<select v-model="policy" class="native-select">
          <option value="default">
            {{ $t('Existing transport behavior') }}
          </option>
          <option value="omit">{{ $t('Do not send cookies') }}</option>
          <option value="override">
            {{ $t('Explicit Cookie header only') }}
          </option>
        </select></label
      >
      <label v-if="policy === 'override'"
        >{{ $t('Cookie value')
        }}<textarea
          v-model="cookie"
          class="session-input"
          rows="2"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <p class="session-note">
        {{
          $t(
            'Explicit Cookie policies use isolated Fetch replay. Default keeps current headers and existing Basic/Raw behavior; it does not restore earlier Cookie values.',
          )
        }}
      </p>
      <p class="session-note">
        {{ $t('Applied cookie policy') }}:
        {{
          $t(
            request.cookiePolicy === 'omit'
              ? 'Do not send cookies'
              : request.cookiePolicy === 'override'
                ? 'Explicit Cookie header only'
                : 'Existing transport behavior',
          )
        }}
      </p>
      <button class="native-button" @click="cookies">
        {{ $t('Apply Cookie policy') }}
      </button>
    </fieldset>
    <p v-if="error" role="alert" class="session-error">{{ $t(error) }}</p>
    <p v-if="notice" role="status" class="session-note">{{ $t(notice) }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  type AuthMode,
  type CookiePolicy,
  applyAuth,
  applyCookiePolicy,
} from '../model/session-controls'
import JwtInspector from '@/features/tools/components/JwtInspector.vue'
const props = defineProps<{ request: BrowseRequest; sending: boolean }>()
const emit = defineEmits<{ apply: [request: BrowseRequest] }>()
const mode = ref<AuthMode>('bearer'),
  token = ref(''),
  username = ref(''),
  password = ref(''),
  name = ref('X-API-Key'),
  value = ref(''),
  cookie = ref(''),
  policy = ref<CookiePolicy>('default'),
  jwt = ref(false),
  error = ref(''),
  notice = ref('')
watch(
  () => [props.request, props.request.url],
  () => {
    token.value = ''
    username.value = ''
    password.value = ''
    value.value = ''
    error.value = ''
    notice.value = ''
    policy.value = props.request.cookiePolicy || 'default'
    cookie.value =
      props.request.headers.find(
        h => h.enabled && h.name.toLowerCase() === 'cookie',
      )?.value || ''
  },
  { immediate: true },
)
function auth() {
  if (props.sending) return
  try {
    emit(
      'apply',
      applyAuth(props.request, mode.value, {
        token: token.value,
        username: username.value,
        password: password.value,
        name: name.value,
        value: value.value,
      }),
    )
    token.value = ''
    password.value = ''
    value.value = ''
    error.value = ''
    notice.value = 'Authentication applied to this draft.'
  } catch (e) {
    error.value = (e as Error).message
  }
}
function cookies() {
  if (props.sending) return
  try {
    emit('apply', applyCookiePolicy(props.request, policy.value, cookie.value))
    error.value = ''
    notice.value = 'Cookie policy applied to this draft.'
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<style lang="scss">
.qbar-app .session-editor {
  padding: 12px;
  overflow: auto;
  font-size: 12px;
}
.qbar-app .session-editor fieldset {
  border: 1px solid var(--native-border-subtle);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0 16px;
  min-width: 0;
}
.qbar-app .session-editor legend {
  color: var(--native-muted);
  padding: 0 5px;
}
.qbar-app .session-editor label {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin-bottom: 12px;
}
.qbar-app .session-input {
  background: var(--native-surface);
  color: var(--native-text);
  border: 1px solid var(--native-border);
  border-radius: 4px;
  padding: 6px 8px;
  font:
    12px/18px Menlo,
    monospace;
  width: 100%;
  min-width: 0;
}
.qbar-app .session-note {
  color: var(--native-muted);
  line-height: 1.6;
  margin-block: 8px;
}
.qbar-app .session-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.qbar-app .session-error {
  color: rgb(var(--v-theme-error));
}
.qbar-app .raw-session-controls {
  flex-shrink: 0;
  max-height: 45%;
  overflow: auto;
  padding-inline: 12px;
  border-bottom: 1px solid var(--native-border-subtle);
  font-size: 12px;
}
.qbar-app .raw-session-controls summary {
  cursor: pointer;
  padding-block: 6px;
  color: var(--native-muted);
}
</style>

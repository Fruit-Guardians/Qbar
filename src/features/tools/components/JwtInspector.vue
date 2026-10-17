<template>
  <VCard class="jwt-inspector" rounded="0">
    <header class="jwt-heading">
      <h2 id="jwt-title">{{ $t('JWT inspector') }}</h2>
      <span>{{ $t('Local only') }}</span>
      <button
        class="jwt-button"
        :aria-label="$t('Close JWT inspector')"
        @click="$emit('close')"
      >
        {{ $t('Close') }}
      </button>
    </header>
    <div class="jwt-content">
      <div class="jwt-actions">
        <label for="jwt-token">{{ $t('Encoded token') }}</label>
        <button class="jwt-button" @click="loadBearer">
          {{ $t('Read Authorization') }}
        </button>
        <button
          class="jwt-button"
          :disabled="!decoded.value"
          @click="copyToken"
        >
          {{ $t('Copy token') }}
        </button>
      </div>
      <textarea
        id="jwt-token"
        v-model="token"
        class="jwt-input jwt-token"
        :placeholder="$t('Paste a JWT or Bearer token')"
        rows="3"
        spellcheck="false"
        autocomplete="off"
        autofocus
      />
      <p v-if="decoded.error" class="jwt-error" role="alert">
        {{ $t(decoded.error) }}
      </p>
      <div v-if="decoded.value" class="jwt-json-grid">
        <section>
          <h3>{{ $t('Header') }}</h3>
          <pre>{{ JSON.stringify(decoded.value.header, null, 2) }}</pre>
        </section>
        <section>
          <h3>{{ $t('Payload') }}</h3>
          <pre>{{ JSON.stringify(decoded.value.payload, null, 2) }}</pre>
        </section>
      </div>
      <dl v-if="dates.length" class="jwt-dates">
        <template v-for="date in dates" :key="date.name"
          ><dt>{{ date.name }}</dt>
          <dd>{{ $t(date.date) }} · {{ $t(date.state) }}</dd></template
        >
      </dl>
      <details class="jwt-claims-editor">
        <summary @click="editClaims">{{ $t('Edit JWT claims') }}</summary>
        <p>
          {{
            $t(
              'Editing invalidates the existing signature. This does not sign the token.',
            )
          }}
        </p>
        <label
          >{{ $t('Header')
          }}<textarea
            v-model="editedHeader"
            class="jwt-input"
            rows="4"
            spellcheck="false"
          />
        </label>
        <label
          >{{ $t('Payload')
          }}<textarea
            v-model="editedPayload"
            class="jwt-input"
            rows="6"
            spellcheck="false"
          />
        </label>
        <button
          class="jwt-button"
          :disabled="sending || !decoded.value"
          @click="rebuildClaims"
        >
          {{ $t('Rebuild token locally') }}
        </button>
      </details>
      <section class="jwt-verification">
        <h3>{{ $t('Signature verification') }}</h3>
        <p>
          {{
            $t(
              'Decoded content is untrusted. A valid signature does not check issuer, audience or claim validity. Keys stay in this dialog and are cleared when it closes.',
            )
          }}
        </p>
        <div class="jwt-actions">
          <label for="jwt-algorithm">{{ $t('Expected algorithm') }}</label>
          <select id="jwt-algorithm" v-model="algorithm" class="jwt-input">
            <option>HS256</option>
            <option>RS256</option>
            <option>ES256</option>
          </select>
          <span>{{
            $t(
              algorithm === 'HS256'
                ? 'UTF-8 shared secret (exact text)'
                : 'SPKI PEM public key',
            )
          }}</span>
        </div>
        <input
          v-if="algorithm === 'HS256'"
          id="jwt-key"
          v-model="material"
          class="jwt-input"
          type="password"
          :aria-label="$t('JWT shared secret')"
          :placeholder="$t('Enter shared secret')"
          autocomplete="off"
          spellcheck="false"
        />
        <textarea
          v-else
          id="jwt-key"
          v-model="material"
          class="jwt-input"
          :aria-label="$t('JWT public key')"
          placeholder="-----BEGIN PUBLIC KEY-----"
          rows="3"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="jwt-actions">
          <button
            class="jwt-button"
            :disabled="!decoded.value || !material.trim() || busy"
            @click="verify"
          >
            {{ $t(busy ? 'Checking…' : 'Verify signature') }}
          </button>
          <span
            role="status"
            :class="{ 'jwt-error': status === 'Signature invalid' }"
            >{{ $t(status) }}</span
          >
        </div>
      </section>
      <p v-if="notice" role="status">{{ $t(notice) }}</p>
    </div>
    <footer class="jwt-footer">
      <span>{{ $t('Read-only inspection · token bytes are preserved') }}</span>
      <button
        class="jwt-button jwt-primary"
        :disabled="!decoded.value || sending"
        @click="applyBearer"
      >
        {{ $t('Use as Bearer header') }}
      </button>
    </footer>
  </VCard>
</template>

<script setup lang="ts">
import { useJwtInspector } from '../composables/use-jwt-inspector'
const props = defineProps<{ request: BrowseRequest; sending: boolean }>()
const emit = defineEmits<{ apply: [request: BrowseRequest]; close: [] }>()
const {
  token,
  editedHeader,
  editedPayload,
  editClaims,
  rebuildClaims,
  material,
  algorithm,
  status,
  busy,
  notice,
  decoded,
  dates,
  verify,
  loadBearer,
  applyBearer,
  copyToken,
} = useJwtInspector(
  () => props.request,
  () => props.sending,
  value => emit('apply', value),
)
</script>

<style scoped>
.jwt-inspector {
  font:
    12px -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Arial,
    sans-serif;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.jwt-heading,
.jwt-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  flex-shrink: 0;
}
.jwt-heading {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.18);
}
.jwt-heading h2 {
  font-size: 13px;
  font-weight: 600;
  margin-right: auto;
}
.jwt-content {
  padding: 12px;
  overflow: auto;
}
.jwt-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}
.jwt-actions label {
  margin-right: auto;
}
.jwt-input {
  display: block;
  width: 100%;
  padding: 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 2px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  font:
    12px ui-monospace,
    monospace;
}
.jwt-input:focus-visible,
.jwt-button:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -1px;
}
textarea {
  resize: vertical;
}
.jwt-token {
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
select.jwt-input {
  width: auto;
}
.jwt-button {
  color: rgb(var(--v-theme-primary));
  padding: 3px 7px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.22);
  border-radius: 2px;
  font: inherit;
  cursor: pointer;
}
.jwt-button:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.08);
}
.jwt-button:disabled {
  opacity: 0.45;
  cursor: default;
}
.jwt-json-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.jwt-json-grid section {
  min-width: 0;
}
h3 {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}
pre {
  font:
    12px/1.6 ui-monospace,
    monospace;
  padding: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  overflow: auto;
  max-height: 220px;
  min-height: 90px;
  margin: 0;
}
.jwt-dates {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin-bottom: 12px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.jwt-verification {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  padding-top: 10px;
}
p {
  margin: 6px 0 12px;
  line-height: 1.6;
}
.jwt-verification > .jwt-input {
  margin-bottom: 8px;
}
.jwt-error {
  color: rgb(var(--v-theme-error));
}
.jwt-footer {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  flex-wrap: wrap;
}
.jwt-footer > span {
  margin-right: auto;
}
.jwt-primary {
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
}
.jwt-primary:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.85);
}
@media (max-width: 580px) {
  .jwt-json-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <div class="wb-json-node">
    <div v-if="node.kind === 'value'" class="wb-json-leaf">
      <code
        ><span class="wb-json-key">{{ label }}</span
        >: <span :class="`wb-json-${valueKind}`">{{ node.raw }}</span></code
      ><button
        class="text-action"
        :aria-label="$t('Copy path {path}', { path })"
        @click="$emit('copy', path)"
      >
        {{ $t('Path') }}</button
      ><button
        class="text-action"
        :aria-label="$t('Copy value {path}', { path })"
        @click="$emit('copy', printJson(node, true))"
      >
        {{ $t('Value') }}
      </button>
    </div>
    <details
      v-else
      :open="expanded"
      @toggle="expanded = ($event.target as HTMLDetailsElement).open"
    >
      <summary>
        <code
          >{{ label }} {{ node.kind === 'object' ? '{…}' : '[…]' }}
          {{ node.children.length }}</code
        ><button
          class="text-action"
          :aria-label="$t('Copy path {path}', { path })"
          @click.stop.prevent="$emit('copy', path)"
        >
          {{ $t('Path') }}</button
        ><button
          class="text-action"
          :aria-label="$t('Copy value {path}', { path })"
          @click.stop.prevent="$emit('copy', printJson(node, true))"
        >
          {{ $t('Value') }}
        </button>
      </summary>
      <template v-if="expanded">
        <JsonTree
          v-for="(child, index) in node.children.slice(0, 200)"
          :key="index"
          :node="child.node"
          :label="
            node.kind === 'object' ? JSON.stringify(child.key) : child.key
          "
          :path="jsonPath(path, child.key, node.kind === 'array')"
          :depth="depth + 1"
          @copy="$emit('copy', $event)"
        />
        <p v-if="node.children.length > 200" class="wb-note">
          {{
            $t('Showing first 200 children. Copy Value preserves all members.')
          }}
        </p>
      </template>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { type JsonNode, jsonPath, printJson } from '../model/json-document'
const props = defineProps<{
  node: JsonNode
  label: string
  path: string
  depth: number
}>()
const expanded = ref(props.depth < 1)
const valueKind = computed(() =>
  props.node.raw?.startsWith('"')
    ? 'string'
    : /^(true|false|null)$/.test(props.node.raw || '')
      ? 'literal'
      : 'number',
)
defineEmits<{ copy: [value: string] }>()
</script>

import { computed, onUnmounted, ref, watch } from 'vue'
import {
  type JwtAlgorithm,
  decodeBase64Url,
  decodeJwt,
  jwtDates,
  requestBearer,
  rewriteJwt,
  verifyJwt,
  withBearer,
} from '../model/jwt'

export function useJwtInspector(
  request: () => BrowseRequest,
  sending: () => boolean,
  apply: (value: BrowseRequest) => void,
) {
  const token = ref('')
  const editedHeader = ref(''),
    editedPayload = ref('')
  const material = ref('')
  const algorithm = ref<JwtAlgorithm>('HS256')
  const status = ref('Not verified')
  const busy = ref(false)
  const notice = ref('')
  const now = ref(Date.now())
  let revision = 0
  const decoded = computed(() => {
    if (!token.value.trim()) return { error: '', value: null }
    try {
      return { error: '', value: decodeJwt(token.value) }
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'Invalid JWT.',
        value: null,
      }
    }
  })
  const dates = computed(() =>
    decoded.value.value ? jwtDates(decoded.value.value.payload, now.value) : [],
  )
  const timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  watch(
    [token, material, algorithm],
    () => {
      revision++
      status.value = 'Not verified'
      busy.value = false
      notice.value = ''
    },
    { flush: 'sync' },
  )
  // Never expose an existing password through the public-key textarea.
  watch(
    algorithm,
    () => {
      material.value = ''
    },
    { flush: 'sync' },
  )
  async function verify() {
    const attempt = ++revision
    busy.value = true
    status.value = 'Checking signature…'
    try {
      const valid = await verifyJwt(
        token.value,
        algorithm.value,
        material.value,
      )
      if (attempt === revision)
        status.value = valid ? 'Signature valid' : 'Signature invalid'
    } catch (e) {
      if (attempt === revision)
        status.value =
          e instanceof Error ? e.message : 'Signature check failed.'
    } finally {
      if (attempt === revision) busy.value = false
    }
  }
  function editClaims() {
    if (!decoded.value.value) return
    editedHeader.value = new TextDecoder().decode(
      decodeBase64Url(decoded.value.value.token.split('.')[0]),
    )
    editedPayload.value = new TextDecoder().decode(
      decodeBase64Url(decoded.value.value.token.split('.')[1]),
    )
  }
  function rebuildClaims() {
    if (sending()) return
    try {
      token.value = rewriteJwt(
        token.value,
        editedHeader.value,
        editedPayload.value,
      )
      notice.value =
        'Claims rebuilt locally. Existing signature is now invalid; no request sent.'
    } catch (e) {
      notice.value = (e as Error).message
    }
  }
  function loadBearer() {
    token.value = requestBearer(request())
    notice.value = token.value
      ? 'Loaded current Authorization header.'
      : 'No enabled Bearer Authorization header in this request.'
  }
  function applyBearer() {
    if (sending() || !decoded.value.value) return
    apply(withBearer(request(), token.value))
    notice.value = 'Authorization updated. No request sent.'
  }
  async function copyToken() {
    const value = decoded.value.value?.token
    if (!value) return
    const attempt = revision
    try {
      await navigator.clipboard.writeText(value)
      if (attempt === revision) notice.value = 'Token copied.'
    } catch {
      if (attempt === revision)
        notice.value = 'Copy failed. Select and copy the token manually.'
    }
  }
  onUnmounted(() => {
    clearInterval(timer)
    revision++
    token.value = ''
    material.value = ''
  })
  return {
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
  }
}

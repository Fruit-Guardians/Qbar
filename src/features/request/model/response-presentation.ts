import {
  type JsonNode,
  parseJson,
  printJson,
} from '@/features/workbench/model/json-document'

export type ResponsePresentation = {
  node?: JsonNode
  prettyBody?: string
  notice: string
}
/** Display-only JSON projection. Never replace the captured response or its raw tokens. */
export function presentResponse(
  response: BrowseResponse,
): ResponsePresentation {
  if (response.bodyUnavailable)
    return {
      notice: 'Response body is unavailable. Showing captured metadata only.',
    }
  if (!response.body.trim()) return { notice: '' }
  const contentType =
    response.headers.find(h => h.name.toLowerCase() === 'content-type')
      ?.value || ''
  const jsonHint =
    /(?:^|\/)json(?:\s*;|\s*$)|\+json(?:\s*;|\s*$)/i.test(contentType) ||
    /^\s*[{[]/.test(response.body)
  try {
    const node = parseJson(response.body)
    return { node, prettyBody: printJson(node, false), notice: '' }
  } catch (error) {
    return {
      notice: jsonHint
        ? `JSON view unavailable: ${error instanceof Error ? error.message : 'Invalid JSON.'} Raw response preserved.`
        : '',
    }
  }
}

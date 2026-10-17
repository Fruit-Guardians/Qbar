import { BodyProcessor } from '@/features/request/processors/body-processor'

export default class JsonProcessor extends BodyProcessor {
  getName() {
    return 'application/json'
  }

  getFormEnctype() {
    return 'text/plain'
  }

  getHttpContentType() {
    return 'application/json'
  }

  parse(_body: string): PostInfo {
    throw new Error(
      'JSON requests use exact-body Raw transport, not HTML form encoding.',
    )
  }

  format(body: string) {
    try {
      const parsed = JSON.parse(body)
      return JSON.stringify(parsed, undefined, 2)
    } catch (_) {
      return body
    }
  }
}

import { BodyProcessor } from '@/features/request/processors/body-processor'

export default class UrlencodedFormDataProcessor extends BodyProcessor {
  getName() {
    return 'application/x-www-form-urlencoded'
  }

  getFormEnctype() {
    return 'application/x-www-form-urlencoded'
  }

  getHttpContentType() {
    return 'application/x-www-form-urlencoded'
  }

  parse(body: string) {
    const fields = [] as Array<PostField>

    body.split('&').forEach(field => {
      field = field.replace(/[\r\n]/g, '')

      const delimiterIndex = field.indexOf('=')
      if (!field) return
      const name = (
        delimiterIndex < 0 ? field : field.substring(0, delimiterIndex)
      ).replace(/\+/g, ' ')
      const value = (
        delimiterIndex < 0 ? '' : field.substring(delimiterIndex + 1)
      ).replace(/\+/g, ' ')

      fields.push({
        type: 'input',
        name: decodeURIComponent(name),
        value: decodeURIComponent(value),
      })
    })

    return {
      contentTypeArguments: {},
      fields,
    }
  }

  format(body: string) {
    return body.replace(/[^\n][?&#]/g, str => {
      return str[0] + '\n' + str[1]
    })
  }
}

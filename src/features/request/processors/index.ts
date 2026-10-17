import FormProcessor from './form-processor'
import JsonProcessor from './json-processor'
import MultipartProcessor from './multipart-processor'
import RawFormProcessor from './raw-form-processor'
import { BodyProcessor } from '@/features/request/processors/body-processor'
const constructors = [
  FormProcessor,
  RawFormProcessor,
  JsonProcessor,
  MultipartProcessor,
]

class BodyProcessors {
  #registeredProcessors: Array<BodyProcessor> = []

  constructor() {
    this.#registeredProcessors.push(...constructors.map(c => new c()))
  }

  find(name: string) {
    return this.#registeredProcessors.find(
      processor => processor.getName() === name,
    )
  }

  findByContentType(contentType: string) {
    const pureContentType = contentType.split(';', 1)[0].trim()

    return this.#registeredProcessors.find(
      processor => processor.getHttpContentType() === pureContentType,
    )
  }

  getProcessors() {
    return this.#registeredProcessors
  }

  getNames() {
    return this.#registeredProcessors.map(processor => processor.getName())
  }

  getDefaultProcessor() {
    return this.#registeredProcessors.at(0)!
  }

  getDefaultProcessorName() {
    return this.getDefaultProcessor().getName()
  }

  getDefaultProcessorFormEnctype() {
    return this.getDefaultProcessor().getFormEnctype()
  }

  getDefaultProcessorHttpContentType() {
    return this.getDefaultProcessor().getHttpContentType()
  }
}

const bodyProcessors = new BodyProcessors()

export default bodyProcessors

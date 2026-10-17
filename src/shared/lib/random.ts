import CryptoJS from 'crypto-js'

export function createRandomToken(numBytes: number) {
  return CryptoJS.lib.WordArray.random(numBytes).toString(
    CryptoJS.enc.Base64url,
  )
}

import { CompactEncrypt, compactDecrypt } from 'jose'
import { generateUUID } from '@/lib/utils'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string for encryption key')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }

  if (bytes.length !== 32) {
    throw new Error('Encryption key must decode to 32 bytes (64 hex characters)')
  }

  return bytes
}

function formatIssuedAt(now = new Date()): string {
  const korOffsetMinutes = 9 * 60
  const local = new Date(now.getTime() + korOffsetMinutes * 60 * 1000)

  const year = local.getUTCFullYear()
  const month = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  const hours = String(local.getUTCHours()).padStart(2, '0')
  const minutes = String(local.getUTCMinutes()).padStart(2, '0')
  const seconds = String(local.getUTCSeconds()).padStart(2, '0')
  const millis = String(local.getUTCMilliseconds()).padStart(3, '0')

  const offsetHours = String(Math.trunc(korOffsetMinutes / 60)).padStart(2, '0')
  const offsetMinutes = String(Math.abs(korOffsetMinutes % 60)).padStart(2, '0')
  const sign = korOffsetMinutes >= 0 ? '+' : '-'

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetMinutes}`
}

export async function encryptPayload(payload: Record<string, unknown>, encryptionKeyHex: string) {
  const issuedAt = formatIssuedAt()
  const nonce = generateUUID()
  const encryptionKey = hexToBytes(encryptionKeyHex)

  // Edge Function과 동일한 형태로 payload만 암호화
  const body = payload

  const token = await new CompactEncrypt(encoder.encode(JSON.stringify(body)))
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
      iat: issuedAt,
      nonce,
    })
    .encrypt(encryptionKey)

  return { token, issuedAt, nonce }
}

export async function decryptResponse(ciphertext: string, encryptionKeyHex: string) {
  const encryptionKey = hexToBytes(encryptionKeyHex)
  const { plaintext } = await compactDecrypt(ciphertext, encryptionKey)
  const decoded = decoder.decode(plaintext)
  return decoded ? JSON.parse(decoded) : null
}
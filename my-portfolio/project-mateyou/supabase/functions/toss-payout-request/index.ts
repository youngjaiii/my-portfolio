/**
 * Supabase Edge Function: toss-payout-request
 * - Payout API proxy (Toss Payments)
 * - ENCRYPTION security mode (JWE, dir + A256GCM)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  CompactEncrypt,
  compactDecrypt,
} from 'https://deno.land/x/jose@v4.15.5/index.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, Idempotency-Key, X-Toss-Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })

type EnvError =
  | string
  | {
      success: false
      status: number
      error: string
    }

function requireEnv(name: string): string | EnvError {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    return {
      success: false,
      status: 500,
      error: `Missing required environment variable: ${name}`,
    }
  }
  return value
}

function hexToBytesAes256(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string for encryption key')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }

  if (bytes.length !== 32) {
    throw new Error(
      'Encryption key must decode to 32 bytes (64 hex characters)',
    )
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

async function encryptPayload(
  payload: unknown,
  key: Uint8Array,
): Promise<{ token: string; issuedAt: string; nonce: string }> {
  const issuedAt = formatIssuedAt()
  const nonce = crypto.randomUUID()


  const body = {
    iat: issuedAt,
    nonce,
    payload,
  }

  const token = await new CompactEncrypt(encoder.encode(JSON.stringify(body)))
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
      typ: 'JWE',
      cty: 'application/json',
      iat: issuedAt,
      nonce,
    })
    .encrypt(key)

  return { token, issuedAt, nonce }
}

async function decryptPayload(ciphertext: string, key: Uint8Array) {
  const { plaintext } = await compactDecrypt(ciphertext, key)
  const decoded = decoder.decode(plaintext)
  return decoded ? JSON.parse(decoded) : null
}

type ValidatedRequest = {
  payouts: Array<Record<string, unknown>>
  idempotencyKey?: string
  tossAuthToken?: string
}

type ValidationError = {
  success: false
  status: number
  error: string
}

function validateRequestBody(
  body: unknown,
): ValidatedRequest | ValidationError {
  if (!body || typeof body !== 'object') {
    return {
      success: false,
      status: 400,
      error: 'Request body must be a JSON object',
    }
  }

  const { payouts, idempotencyKey, tossAuthToken } = body as ValidatedRequest

  if (!Array.isArray(payouts) || payouts.length === 0) {
    return {
      success: false,
      status: 400,
      error: "Field 'payouts' must be a non-empty array",
    }
  }

  for (const payout of payouts) {
    if (!payout || typeof payout !== 'object' || Array.isArray(payout)) {
      return {
        success: false,
        status: 400,
        error: 'Each payout entry must be an object',
      }
    }
  }

  if (idempotencyKey && typeof idempotencyKey !== 'string') {
    return {
      success: false,
      status: 400,
      error: "Field 'idempotencyKey' must be a string when provided",
    }
  }

  if (tossAuthToken && typeof tossAuthToken !== 'string') {
    return {
      success: false,
      status: 400,
      error: "Field 'tossAuthToken' must be a string when provided",
    }
  }

  return {
    payouts,
    idempotencyKey,
    tossAuthToken,
  }
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: corsHeaders,
      })
    }

    // API Key 검증 (임시로 주석 처리하여 테스트)
    /*
    const apiKey = req.headers.get('apikey')
    const validApiKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!apiKey || apiKey !== validApiKey) {
      return jsonResponse(
        {
          success: false,
          status: 401,
          error: 'Invalid API key',
        },
        401,
      )
    }
    */

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          ...corsHeaders,
          Allow: 'POST, OPTIONS',
        },
      })
    }

    let bodyUnknown: unknown
    try {
      bodyUnknown = await req.json()
    } catch {
      return jsonResponse(
        {
          success: false,
          status: 400,
          error: 'Invalid JSON payload',
        },
        400,
      )
    }

    const validated = validateRequestBody(bodyUnknown)
    if ('success' in validated && validated.success === false) {
      return jsonResponse(validated, validated.status)
    }

    const { payouts, idempotencyKey, tossAuthToken } = validated

    const secretKey = requireEnv('TOSS_PAYMENTS_SECRET_KEY')
    if (typeof secretKey !== 'string') {
      return jsonResponse(secretKey, secretKey.status)
    }

    const encryptionHex = requireEnv('TOSS_PAYMENTS_ENCRYPTION_KEY')
    if (typeof encryptionHex !== 'string') {
      return jsonResponse(encryptionHex, encryptionHex.status)
    }

    let encryptionKey: Uint8Array
    try {
      encryptionKey = hexToBytesAes256(encryptionHex)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to parse encryption key'
      return jsonResponse(
        {
          success: false,
          status: 500,
          error: message,
        },
        500,
      )
    }

    const apiBase = 'https://api.tosspayments.com'
    const endpoint = `${apiBase}/v2/payouts`

    const {
      token: encryptedPayload,
      issuedAt,
      nonce,
    } = await encryptPayload(payouts, encryptionKey)

    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${secretKey}:`)}`,
      'Content-Type': 'text/plain',
      'TossPayments-api-security-mode': 'ENCRYPTION',
    }

    // tossAuthToken이 제공되면 사용, 없으면 환경변수 사용
    if (tossAuthToken) {
      headers.Authorization = tossAuthToken
    }

    // 요청 헤더에서 추가 Authorization이 있으면 사용 (하위 호환성)
    const customAuth = req.headers.get('X-Toss-Authorization')
    if (customAuth) {
      headers.Authorization = customAuth
    }

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey
    }

    console.info('[TOSS-PAYOUT] upstream request', {
      endpoint,
      method: 'POST',
      count: payouts.length,
    })

    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: encryptedPayload,
    })

    const status = upstreamResponse.status
    const rawText = await upstreamResponse.text()

    let encryptedResponse: string | null = null
    let decrypted: unknown = null

    try {
      const parsed = JSON.parse(rawText)
      if (parsed?.data && typeof parsed.data === 'string') {
        encryptedResponse = parsed.data
      } else {
        decrypted = parsed
      }
    } catch {
      const trimmed = rawText.trim()
      if (trimmed.startsWith('eyJ') || trimmed.includes('.')) {
        encryptedResponse = trimmed
      }
    }


    let decryptError: string | undefined
    if (encryptedResponse) {
      try {
        decrypted = await decryptPayload(encryptedResponse, encryptionKey)
      } catch (e) {
        decryptError =
          e instanceof Error ? e.message : 'Failed to decrypt upstream response'
        console.warn('[TOSS-PAYOUT] decrypt failed', decryptError, {
          encryptedResponse: encryptedResponse.slice(0, 60),
        })
      }
    }

    if (!upstreamResponse.ok) {
      console.warn('[TOSS-PAYOUT] upstream error', {
        status,
        decryptError,
        details: typeof decrypted === 'object' ? decrypted : rawText,
        requestHeader: {
          issuedAt,
          nonce,
        },
      })
      return jsonResponse(
        {
          success: false,
          status,
          error: decryptError ?? 'Upstream request failed',
          details: decrypted ?? rawText,
        },
        status,
      )
    }

    return jsonResponse(
      {
        success: true,
        status,
        data: decrypted,
        raw: encryptedResponse ?? undefined,
      },
      status,
    )
  } catch (error) {
    console.error('[TOSS-PAYOUT] unexpected error', error)
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'
    return jsonResponse(
      {
        success: false,
        status: 500,
        error: message,
      },
      500,
    )
  }
})

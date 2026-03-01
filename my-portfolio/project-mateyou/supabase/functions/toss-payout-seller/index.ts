/**
 * Supabase Edge Function: toss-payout-seller (v2)
 * - Seller API create/update (Toss Payments)
 * - ENCRYPTION security mode (JWE, dir + A256GCM)
 * - Idempotency-Key 지원
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
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
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

async function encryptPayload(
  payload: Record<string, unknown>,
  key: Uint8Array,
): Promise<{ token: string; issuedAt: string; nonce: string }> {
  const issuedAt = formatIssuedAt()
  const nonce = crypto.randomUUID()


  // 토스 API는 payload만 직접 암호화할 수 있음
  const body = payload

  const token = await new CompactEncrypt(encoder.encode(JSON.stringify(body)))
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
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
  mode: 'create' | 'update'
  sellerId?: string
  payload: Record<string, unknown>
  idempotencyKey?: string
  tossAuthToken?: string
}

type ValidationError = {
  success: false
  status: number
  error: string
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

  const { mode, sellerId, payload, idempotencyKey, tossAuthToken } = body as ValidatedRequest

  if (mode !== 'create' && mode !== 'update') {
    return {
      success: false,
      status: 400,
      error: "Field 'mode' must be either 'create' or 'update'",
    }
  }

  if (mode === 'update' && (!sellerId || typeof sellerId !== 'string')) {
    return {
      success: false,
      status: 400,
      error: "Field 'sellerId' is required for update mode",
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      success: false,
      status: 400,
      error: "Field 'payload' must be an object",
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
    mode,
    sellerId,
    payload,
    idempotencyKey,
    tossAuthToken,
  }
}

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: corsHeaders,
      })
    }

    // API Key 검증 (임시로 주석 처리하여 테스트)
    /*
    const apiKey = req.headers.get('apikey')
    const validApiKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_KEY')

    console.log('API Key validation:', {
      provided: apiKey?.slice(0, 20) + '...',
      expected: validApiKey?.slice(0, 20) + '...',
      match: apiKey === validApiKey,
      allEnvKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes('SUPABASE'))
    })

    if (!apiKey || apiKey !== validApiKey) {
      return jsonResponse(
        {
          success: false,
          status: 401,
          error: 'Invalid API key',
          debug: {
            hasApiKey: !!apiKey,
            hasValidKey: !!validApiKey,
            keysMatch: apiKey === validApiKey,
            envKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes('SUPABASE'))
          }
        },
        401,
      )
    }
    */

    if (req.method !== 'POST' && req.method !== 'PUT') {
      // 외부에서 실수로 직접 PUT 호출할 수도 있으므로 허용, 하지만 일반 진입점은 POST로 받고 내부에서 PUT proxy
      // 여기서는 유연하게 처리: POST/PUT만 허용
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          ...corsHeaders,
          Allow: 'POST, PUT, OPTIONS',
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

    const { mode, sellerId, payload, idempotencyKey, tossAuthToken } = validated

    // 환경 변수
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
    // Toss Payments 올바른 API 엔드포인트
    const endpoint =
      mode === 'create'
        ? `${apiBase}/v2/sellers`
        : `${apiBase}/v2/sellers/${sellerId}`
    const method = 'POST'

    // 요청 암호화
    const {
      token: encryptedPayload,
      issuedAt,
      nonce,
    } = await encryptPayload(payload, encryptionKey)

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
      mode,
      endpoint,
      method,
      secretKeyPrefix: secretKey.substring(0, 10) + '...',
      hasCustomAuth: !!customAuth,
      hasTossAuthToken: !!tossAuthToken,
      finalAuthHeader: headers.Authorization.substring(0, 20) + '...',
      payload: JSON.stringify(payload).substring(0, 200) + '...'
    })

    const upstreamResponse = await fetch(endpoint, {
      method,
      headers,
      body: encryptedPayload,
    })

    const status = upstreamResponse.status
    const rawText = await upstreamResponse.text()

    // 응답 파싱: (1) JSON + data(string) -> decrypt (2) JSON (암호화 안됨) -> 그대로 (3) Plain JWE string -> decrypt
    let encryptedResponse: string | null = null
    let decrypted: unknown = null

    try {
      const parsed = JSON.parse(rawText)
      if (parsed?.data && typeof parsed.data === 'string') {
        encryptedResponse = parsed.data
      } else {
        // 암호화 안 된 정상 JSON
        decrypted = parsed
      }
    } catch {
      // JSON 아님 → Plain JWE 가능성
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
        rawResponse: rawText,
        requestHeader: {
          issuedAt,
          nonce,
        },
        requestUrl: endpoint,
        requestMethod: method,
        authHeader: headers.Authorization.substring(0, 20) + '...'
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

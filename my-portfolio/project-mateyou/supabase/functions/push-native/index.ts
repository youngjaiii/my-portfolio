// @ts-ignore - Deno runtime import (not resolved by tsc in web app)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  createSupabaseClient,
  errorResponse,
  successResponse,
  getAuthUser,
} from '../_shared/utils.ts'

// Declare Deno global for TypeScript tooling outside Deno runtime
declare const Deno: typeof globalThis.Deno

const DEFAULT_MAX_RETRIES = 3
const FCM_LEGACY_ENDPOINT = 'https://fcm.googleapis.com/fcm/send'
const FCM_V1_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const FCM_V1_DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const FCM_V1_BASE_URL = 'https://fcm.googleapis.com/v1'

type FcmServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

const legacyFcmServerKey = Deno.env.get('FCM_SERVER_KEY') || null
const fcmServiceAccount = loadServiceAccount()
const textEncoder = new TextEncoder()

let cachedAccessToken: { token: string; expiresAt: number } | null = null
let serviceAccountCryptoKeyPromise: Promise<CryptoKey> | null = null

// Base64URL encoding function (URL-safe base64)
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// 멤버십 알림 전용 조회 GET 엔드포인트
async function getMembershipNotifications(supabase: ReturnType<typeof createSupabaseClient>, req: Request) {
  try {
    // 인증된 유저 정보 가져오기
    let user: any = null
    try {
      user = await getAuthUser(req)
    } catch {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401)
    }

    const url = new URL(req.url)
    const limitParam = parseInt(url.searchParams.get('limit') || '20')
    const limit = Math.min(Math.max(1, limitParam), 100)
    const offsetParam = parseInt(url.searchParams.get('offset') || '0')
    const offset = Math.max(0, offsetParam)
    const status = url.searchParams.get('status')

    // 최근 30일 계산
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    console.log(`[getMembershipNotifications] 조회 시작 - user_id: ${user.id}`)
    console.log(`[getMembershipNotifications] 조회 기간: ${thirtyDaysAgo.toISOString()} 이후`)

    // 해당 유저의 멤버십 관련 알림만 조회 (notification_type에 'membership'이 포함된 모든 알림)
    let query = supabase
      .from('push_notifications_queue')
      .select('*', { count: 'exact' })
      .or(`target_member_id.eq.${user.id},user_id.eq.${user.id}`)
      .ilike('notification_type', '%membership%')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // status 필터 적용
    if (status) {
      query = query.eq('status', status)
    }

    const { data: notifications, error, count } = await query
    
    console.log(`[getMembershipNotifications] 쿼리 결과 - count: ${count}, error: ${error?.message || 'none'}, data length: ${notifications?.length || 0}`)
    if (notifications && notifications.length > 0) {
      console.log(`[getMembershipNotifications] 첫번째 알림: ${JSON.stringify(notifications[0])}`)
    }

    if (error) {
      console.error('getMembershipNotifications error:', error)
      return errorResponse('QUERY_FAILED', 'Failed to fetch membership notifications', error.message, 500)
    }

    // data 필드가 문자열인 경우 JSON 파싱
    const parsedNotifications = (notifications || []).map((notification: any) => {
      if (notification.data && typeof notification.data === 'string') {
        try {
          notification.data = JSON.parse(notification.data)
        } catch {
          // 파싱 실패 시 그대로 유지
        }
      }
      return notification
    })

    // 읽지 않은 멤버십 알림 수 계산
    const { count: unreadCountResult } = await supabase
      .from('push_notifications_queue')
      .select('*', { count: 'exact', head: true })
      .or(`target_member_id.eq.${user.id},user_id.eq.${user.id}`)
      .ilike('notification_type', '%membership%')
      .eq('status', 'sent')
      .gte('created_at', thirtyDaysAgo.toISOString())

    const unreadCount = unreadCountResult || 0

    console.log(`[getMembershipNotifications] 조회 완료 - ${count || 0}개, 읽지않음: ${unreadCount}개`)

    return successResponse({
      notifications: parsedNotifications,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
      unread_count: unreadCount,
    })
  } catch (error) {
    console.error('getMembershipNotifications error:', error)
    return errorResponse('INTERNAL_ERROR', 'Failed to get membership notifications', error.message, 500)
  }
}

// 알림 조회 GET 엔드포인트
async function getNotifications(supabase: ReturnType<typeof createSupabaseClient>, req: Request) {
  try {
    // 인증된 유저 정보 가져오기
    let user: any = null
    try {
      user = await getAuthUser(req)
    } catch {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401)
    }

    const url = new URL(req.url)
    const limitParam = parseInt(url.searchParams.get('limit') || '20')
    const limit = Math.min(Math.max(1, limitParam), 100) // 1~100 사이로 제한
    const offsetParam = parseInt(url.searchParams.get('offset') || '0')
    const offset = Math.max(0, offsetParam)
    
    // 필터 파라미터
    const status = url.searchParams.get('status') // pending, sent, failed, retry
    const notificationType = url.searchParams.get('notification_type')
    const unreadOnly = url.searchParams.get('unread_only') === 'true'
    
    // 최근 30일 계산
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    console.log(`[getNotifications] 조회 시작 - user_id: ${user.id}, 제외 타입: chat, membership 관련`)
    
    // target_member_id 또는 user_id로 조회 (둘 다 확인)
    // 최근 30일 내 알림만 조회
    // notification_type이 'chat' 및 멤버십 관련 알림은 제외
    let query = supabase
      .from('push_notifications_queue')
      .select('*', { count: 'exact' })
      .or(`target_member_id.eq.${user.id},user_id.eq.${user.id}`)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .not('notification_type', 'eq', 'chat')
      .not('notification_type', 'ilike', '%membership%')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // 필터 적용
    if (status) {
      query = query.eq('status', status)
    }
    if (notificationType) {
      query = query.eq('notification_type', notificationType)
    }

    const { data: notifications, error, count } = await query
    
    // 제외된 알림 개수 로깅
    if (!error) {
      const { count: chatCount } = await supabase
        .from('push_notifications_queue')
        .select('*', { count: 'exact', head: true })
        .or(`target_member_id.eq.${user.id},user_id.eq.${user.id}`)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('notification_type', 'chat')
      
      const { count: membershipCount } = await supabase
        .from('push_notifications_queue')
        .select('*', { count: 'exact', head: true })
        .or(`target_member_id.eq.${user.id},user_id.eq.${user.id}`)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .ilike('notification_type', '%membership%')
      
      console.log(`[getNotifications] 조회 완료 - 조회된 알림: ${count || 0}개, 제외된 chat: ${chatCount || 0}개, 제외된 멤버십: ${membershipCount || 0}개`)
    }

    if (error) {
      console.error('getNotifications error:', error)
      return errorResponse('QUERY_FAILED', 'Failed to fetch notifications', error.message, 500)
    }

    // 읽지 않은 알림 수 계산 (status가 'sent'이고 최근 30일 이내, chat 및 멤버십 관련 제외)
    let unreadCount = 0
    if (unreadOnly || url.searchParams.get('count_only') === 'true') {
      const { count: unreadCountResult } = await supabase
        .from('push_notifications_queue')
        .select('*', { count: 'exact', head: true })
        .or(`target_member_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('status', 'sent')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .not('notification_type', 'eq', 'chat')
        .not('notification_type', 'ilike', '%membership%')

      unreadCount = unreadCountResult || 0
    }

    // count_only 파라미터가 있으면 카운트만 반환
    if (url.searchParams.get('count_only') === 'true') {
      return successResponse({ 
        unread_count: unreadCount,
        total_count: count || 0 
      })
    }

    return successResponse({
      notifications: notifications || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
      unread_count: unreadCount,
    })
  } catch (error) {
    console.error('getNotifications error:', error)
    return errorResponse('INTERNAL_ERROR', 'Failed to get notifications', error.message, 500)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createSupabaseClient()

    // GET 요청 처리
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const pathname = url.pathname

      // 멤버십 알림 전용 조회
      if (pathname.endsWith('/membership') || pathname.includes('/push-native/membership')) {
        return await getMembershipNotifications(supabase, req)
      }

      // 일반 알림 조회
      return await getNotifications(supabase, req)
    }

    // POST 요청 처리
    const body = await req.json()
    const action = body?.action

    if (!action) {
      return errorResponse('INVALID_ACTION', 'Action is required')
    }

    switch (action) {
      case 'save_token':
        return await saveNativeToken(supabase, body)
      case 'deactivate_token':
        return await deactivateNativeToken(supabase, body)
      case 'enqueue_notification':
        return await enqueueNotification(supabase, body)
      case 'process_queue':
        return await processQueue(supabase, body)
      default:
        return errorResponse('UNKNOWN_ACTION', `Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('push-native error:', error)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500)
  }
})

async function saveNativeToken(supabase: ReturnType<typeof createSupabaseClient>, payload: any) {
  const { user_id, device_id, platform, token, voip_token, apns_env } = payload

  if (!user_id || !device_id || !platform || !token) {
    return errorResponse('INVALID_BODY', 'user_id, device_id, platform, token are required')
  }

  const now = new Date().toISOString()

  const basePayload: any = {
    user_id,
    device_id,
    platform,
    token,
    is_active: true,
    last_seen_at: now,
    updated_at: now,
  }

  const { data: existingRecord, error: lookupError } = await supabase
    .from('push_native_tokens')
    .select('id, voip_token, apns_env')
    .eq('device_id', device_id)
    .eq('platform', platform)
    .maybeSingle()

  if (lookupError) {
    console.error('saveNativeToken lookup error:', lookupError)
    return errorResponse('LOOKUP_FAILED', 'Failed to lookup token', lookupError.message)
  }

  // iOS 플랫폼일 때 voip_token과 apns_env 처리
  if (platform === 'ios') {
    // 로그인 시 push-native 토큰 저장 시 voip_token과 apns_env도 함께 저장
    // 전달된 값이 있으면 저장, 없으면 기존 값 유지
    if (voip_token) {
      basePayload.voip_token = voip_token
    } else if (existingRecord?.voip_token) {
      // 전달된 값이 없으면 기존 값 유지
      basePayload.voip_token = existingRecord.voip_token
    }
    
    if (apns_env) {
      basePayload.apns_env = apns_env
    } else if (existingRecord?.apns_env) {
      // 전달된 값이 없으면 기존 값 유지
      basePayload.apns_env = existingRecord.apns_env
    }
  }

  const mutation = existingRecord
    ? supabase
        .from('push_native_tokens')
        .update(basePayload)
        .eq('id', existingRecord.id)
    : supabase.from('push_native_tokens').insert(basePayload)

  const { data, error } = await mutation.select().single()

  if (error) {
    console.error('saveNativeToken error:', error)
    return errorResponse('SAVE_FAILED', 'Failed to save token', error.message)
  }

  return successResponse({ token: data })
}

async function deactivateNativeToken(supabase: ReturnType<typeof createSupabaseClient>, payload: any) {
  const { device_id } = payload

  if (!device_id) {
    return errorResponse('INVALID_BODY', 'device_id is required')
  }

  const { error } = await supabase
    .from('push_native_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('device_id', device_id)

  if (error) {
    console.error('deactivateNativeToken error:', error)
    return errorResponse('DEACTIVATE_FAILED', 'Failed to deactivate token', error.message)
  }

  return successResponse({ success: true })
}

// 특수 메시지 형식을 읽기 쉬운 텍스트로 변환
function convertSpecialMessage(message: string): string {
  if (!message) return message
  
  // 하트 선물 [HEART_GIFT:이미지:개수:포인트]
  if (message.startsWith('[HEART_GIFT:')) {
    const match = message.match(/\[HEART_GIFT:[^:]+:(\d+):(\d+)\]/)
    if (match) return `❤️ 하트 ${match[1]}개를 선물했습니다`
  }
  // 퀘스트 요청 [QUEST_REQUEST:퀘스트이름:횟수:총금액]
  else if (message.startsWith('[QUEST_REQUEST:')) {
    const match = message.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+)\]/)
    if (match) return `📋 퀘스트 요청: ${match[1]} ${match[2]}회`
  }
  // // 통화 시작 [CALL_START:voice] 또는 [CALL_START:video]
  // else if (message.startsWith('[CALL_START:')) {
  //   const isVideo = message.includes(':video]')
  //   return isVideo ? '📹 영상통화가 시작됩니다' : '📞 음성통화가 시작됩니다'
  // }
  // // 통화 수락 [CALL_ACCEPT:voice] 또는 [CALL_ACCEPT:video]
  // else if (message.startsWith('[CALL_ACCEPT:')) {
  //   const isVideo = message.includes(':video]')
  //   return isVideo ? '📹 영상통화를 수락했습니다' : '📞 음성통화를 수락했습니다'
  // }
  // 통화 종료 [CALL_END:voice:초] 또는 [CALL_END:video:초]
  else if (message.startsWith('[CALL_END:')) {
    const match = message.match(/\[CALL_END:(voice|video):(\d+)\]/)
    if (match) {
      const isVideo = match[1] === 'video'
      const seconds = Number(match[2])
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      const duration = seconds > 0 
        ? mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`
        : ''
      return isVideo 
        ? `📹 영상통화가 종료되었습니다${duration ? ` (${duration})` : ''}`
        : `📞 음성통화가 종료되었습니다${duration ? ` (${duration})` : ''}`
    }
  }
  
  return message
}

async function enqueueNotification(supabase: ReturnType<typeof createSupabaseClient>, body: any) {
  const {
    user_id,
    target_member_id,
    target_partner_id,
    title,
    body: messageBody,
    icon,
    url,
    tag,
    notification_type,
    data,
    scheduled_at,
    process_immediately = false,
    max_retries = DEFAULT_MAX_RETRIES,
  } = body

  if (!title || !messageBody) {
    return errorResponse('INVALID_BODY', 'title and body are required')
  }
  
  // 특수 메시지 형식 변환
  const convertedBody = convertSpecialMessage(messageBody)

  const resolvedTargetMember = user_id || target_member_id
  if (!resolvedTargetMember && !target_partner_id) {
    return errorResponse('INVALID_TARGET', 'At least one target identifier is required')
  }

  // 특정 타입(팔로우, 좋아요 등)에 대해 같은 유저/리소스 기준으로 중복 알림 방지
  // tag 를 키로 사용 (예: partner_follow_{partnerId}_{followerId}, post_like_{postId}_{likerId})
  if (tag && notification_type && resolvedTargetMember) {
    try {
      const { data: existing, error: existingError } = await supabase
        .from('push_notifications_queue')
        .select('id, status')
        .eq('target_member_id', resolvedTargetMember)
        .eq('notification_type', notification_type)
        .eq('tag', tag)
        .maybeSingle()

      if (!existingError && existing) {
        // 이미 동일한 알림이 큐에 존재하면 새로 추가하지 않고 기존 job 정보만 반환
        return successResponse({ job: existing, deduped: true })
      }
    } catch (e) {
      console.error('enqueueNotification dedup check error:', e)
      // dedup 실패 시에도 알림 자체는 계속 진행
    }
  }

  const queuePayload = {
    user_id,
    target_member_id: resolvedTargetMember,
    target_partner_id,
    title,
    body: convertedBody,
    icon,
    url,
    tag,
    notification_type,
    data,
    status: 'pending',
    retry_count: 0,
    max_retries,
    scheduled_at: scheduled_at || new Date().toISOString(),
  }

  const { data: job, error } = await supabase
    .from('push_notifications_queue')
    .insert(queuePayload)
    .select()
    .single()

  if (error) {
    console.error('enqueueNotification error:', error)
    return errorResponse('ENQUEUE_FAILED', 'Failed to enqueue notification', error.message)
  }

  // 즉시 응답 반환 (큐에는 정상적으로 들어갔음)
  const response = successResponse({ job })

  if (process_immediately) {
    // 응답 반환 후 백그라운드에서 처리 (await 하지 않음)
    processQueueInternal(supabase, { jobIds: [job.id] }).catch((processError) => {
      console.error('processQueueInternal error (non-fatal, background):', processError)
      // 백그라운드에서 실패해도 큐에는 정상적으로 들어갔으므로 나중에 재시도됨
    })
  }

  return response
}

async function processQueue(supabase: ReturnType<typeof createSupabaseClient>, body: any) {
  const { job_ids } = body || {}
  const result = await processQueueInternal(supabase, { jobIds: job_ids })
  return successResponse(result)
}

async function processQueueInternal(
  supabase: ReturnType<typeof createSupabaseClient>,
  options: { jobIds?: string[] } = {},
) {
  const now = new Date().toISOString()
  let query = supabase
    .from('push_notifications_queue')
    .select('*')
    .order('created_at', { ascending: true })

  if (options.jobIds?.length) {
    query = query.in('id', options.jobIds)
  } else {
    query = query
      .in('status', ['pending', 'retry'])
      .lte('scheduled_at', now)
      .limit(25)
  }

  const { data: jobs, error } = await query

  if (error) {
    console.error('processQueue query error:', error)
    throw error
  }

  const jobsToProcess = (jobs || []).filter((job) => job.retry_count < job.max_retries)
  const results: Record<string, any> = {}

  for (const job of jobsToProcess) {
    results[job.id] = await processSingleJob(supabase, job)
  }

  return { processed: Object.keys(results).length, results }
}

async function processSingleJob(supabase: ReturnType<typeof createSupabaseClient>, job: any) {
  const targetUserId = job.user_id || job.target_member_id

  if (!targetUserId) {
    await updateJobStatus(supabase, job.id, 'failed', 'Missing target user_id')
    return { status: 'failed', reason: 'missing_target' }
  }

  console.log(`Looking for tokens for user_id: ${targetUserId} (job.user_id: ${job.user_id}, job.target_member_id: ${job.target_member_id})`)
  
  // user_id로 조회 (push_native_tokens 테이블의 user_id 필드 사용)
  const { data: tokens, error } = await supabase
    .from('push_native_tokens')
    .select('id, token, device_id, user_id, is_active, platform')
    .eq('user_id', targetUserId)
    .eq('is_active', true)

  if (error) {
    console.error('processSingleJob tokens error:', error)
    await updateJobStatus(supabase, job.id, 'retry', error.message)
    return { status: 'retry', reason: 'token_lookup_failed' }
  }

  console.log(`Found ${tokens?.length || 0} active tokens for user_id: ${targetUserId}`)
  
  // 디버깅: 모든 활성 토큰 조회 (user_id 무관, 샘플만)
  if (!tokens || tokens.length === 0) {
    const { data: allActiveTokens } = await supabase
      .from('push_native_tokens')
      .select('id, user_id, device_id, is_active, platform')
      .eq('is_active', true)
      .limit(5)
    
    if (allActiveTokens && allActiveTokens.length > 0) {
      console.log(`Sample active tokens in DB:`, allActiveTokens.map(t => ({ user_id: t.user_id, platform: t.platform })))
    }
  }
  
  if (!tokens || tokens.length === 0) {
    const errorMsg = `No active native push tokens found for user_id: ${targetUserId}. Check if token was saved with this user_id.`
    // 웹 사용자는 네이티브 푸시 토큰이 없을 수 있으므로 에러 대신 경고로 처리
    console.warn(errorMsg, '- This is normal for web users without native push tokens')
    // 상태를 'no_tokens'로 업데이트하되, 에러로 처리하지 않음
    await updateJobStatus(supabase, job.id, 'no_tokens', errorMsg)
    return { status: 'no_tokens', reason: 'web_user_no_native_token' }
  }
  
  console.log(`Token details:`, tokens.map(t => ({ id: t.id, platform: t.platform, device_id: t.device_id?.substring(0, 20) + '...' })))

  if (!fcmServiceAccount && !legacyFcmServerKey) {
    await updateJobStatus(supabase, job.id, 'failed', 'Missing FCM credentials')
    return { status: 'failed', reason: 'missing_fcm_credentials' }
  }

  // 읽지 않은 메시지 수 계산 (뱃지용)
  let unreadCount = 1
  try {
    const { count, error: countError } = await supabase
      .from('member_chats')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', targetUserId)
      .eq('is_read', false)
    
    if (!countError && count !== null) {
      unreadCount = count
      console.log(`Unread message count for user ${targetUserId}: ${unreadCount}`)
    }
  } catch (e) {
    console.error('Failed to get unread count:', e)
  }

  // job에 뱃지 카운트 추가
  const jobWithBadge = { ...job, badgeCount: unreadCount }

  let successCount = 0
  let failureCount = 0
  const errors: string[] = []

  for (const tokenRecord of tokens) {
    // iOS + 통화 알림인 경우 FCM 발송 건너뛰기 (VoIP 푸시로 처리됨)
    const isCallNotification = job.notification_type === 'call' || job.notification_type === 'livekit-call'
    if (tokenRecord.platform === 'ios' && isCallNotification) {
      console.log(`⏭️ Skipping FCM for iOS call notification (VoIP push handles this)`)
      continue
    }
    
    try {
      console.log(`Sending FCM notification to token: ${tokenRecord.token.substring(0, 20)}... (platform: ${tokenRecord.platform})`)
      const result = await sendFcmNotification({
        legacyKey: legacyFcmServerKey,
        serviceAccount: fcmServiceAccount,
        token: tokenRecord.token,
        job: jobWithBadge,
      })
      if (!result.success) {
        console.error(`FCM notification failed for token ${tokenRecord.id}:`, result.error)
        failureCount++
        errors.push(result.error || 'Unknown FCM error')
        if (result.deactivateToken) {
          console.log(`Deactivating invalid token: ${tokenRecord.id}`)
          await supabase
            .from('push_native_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', tokenRecord.id)
        }
      } else {
        console.log(`✅ FCM notification sent successfully to token ${tokenRecord.id}`)
        successCount++
      }
    } catch (error) {
      console.error(`FCM notification exception for token ${tokenRecord.id}:`, error)
      failureCount++
      errors.push(error.message)
    }
  }
  
  console.log(`FCM send result: ${successCount} success, ${failureCount} failures`)

  if (successCount > 0) {
    await supabase
      .from('push_notifications_queue')
      .update({
        status: 'sent',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', job.id)
    return { status: 'sent', successCount, failureCount }
  }

  const nextRetry = job.retry_count + 1
  const canRetry = nextRetry < job.max_retries
  const nextStatus = canRetry ? 'retry' : 'failed'
  const backoffMinutes = Math.min(30, Math.pow(2, job.retry_count))
  const nextSchedule = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

  await supabase
    .from('push_notifications_queue')
    .update({
      status: nextStatus,
      retry_count: nextRetry,
      scheduled_at: canRetry ? nextSchedule : job.scheduled_at,
      updated_at: new Date().toISOString(),
      error_message: errors.slice(0, 3).join('; '),
    })
    .eq('id', job.id)

  return { status: nextStatus, successCount, failureCount, errors }
}

async function updateJobStatus(
  supabase: ReturnType<typeof createSupabaseClient>,
  jobId: string,
  status: string,
  errorMessage?: string,
) {
  await supabase
    .from('push_notifications_queue')
    .update({
      status,
      error_message: errorMessage || null,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

type FcmSendResult = { success: boolean; error?: string; deactivateToken?: boolean }

async function sendFcmNotification({
  legacyKey,
  serviceAccount,
  token,
  job,
}: {
  legacyKey: string | null
  serviceAccount: FcmServiceAccount | null
  token: string
  job: any
}): Promise<FcmSendResult> {
  if (serviceAccount) {
    try {
      return await sendFcmNotificationHttpV1(serviceAccount, token, job)
    } catch (error) {
      console.error('FCM v1 send error:', error)
      return { success: false, error: error.message }
    }
  }

  if (legacyKey) {
    return await sendFcmNotificationLegacy(legacyKey, token, job)
  }

  return { success: false, error: 'missing_fcm_credentials' }
}

const APP_LOGO = 'https://mateyou.me/app-icon.png' // 기본 앱 아이콘

async function sendFcmNotificationLegacy(serverKey: string, token: string, job: any): Promise<FcmSendResult> {
  // icon이 유효한 URL인지 확인
  const iconUrl = (job.icon && typeof job.icon === 'string' && job.icon.startsWith('http')) 
    ? job.icon 
    : APP_LOGO

  // FCM Legacy API도 data 필드의 값은 문자열이어야 함
  const stringifyValue = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  // job.data의 모든 값을 문자열로 변환
  const dataFields: Record<string, string> = {
    type: job.notification_type || 'system',
    url: job.url || '/',
  }
  if (job.data && typeof job.data === 'object') {
    for (const [key, value] of Object.entries(job.data)) {
      dataFields[key] = stringifyValue(value)
    }
  }
    
  const payload = {
    to: token,
    notification: {
      title: job.title,
      body: job.body,
      icon: iconUrl,
      click_action: job.url || '/',
      tag: job.tag || job.notification_type || 'mateyou-native',
    },
    data: dataFields,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10초 타임아웃

  try {
    const response = await fetch(FCM_LEGACY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: text }
    }

    const result = await response.json()

    if (result.failure && Array.isArray(result.results) && result.results.length > 0) {
      const error = result.results[0].error
      const deactivate = error === 'NotRegistered' || error === 'InvalidRegistration'
      return { success: false, error, deactivateToken: deactivate }
    }

    return { success: true }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      return { success: false, error: 'FCM request timeout' }
    }
    return { success: false, error: error.message }
  }
}

async function sendFcmNotificationHttpV1(
  serviceAccount: FcmServiceAccount,
  token: string,
  job: any,
): Promise<FcmSendResult> {
  const accessToken = await getAccessToken(serviceAccount)
  const url = `${FCM_V1_BASE_URL}/projects/${serviceAccount.project_id}/messages:send`
  console.log(`FCM v1 API URL: ${url}, project_id: ${serviceAccount.project_id}`)

  // icon이 유효한 URL인지 확인
  const iconUrl = (job.icon && typeof job.icon === 'string' && job.icon.startsWith('http')) 
    ? job.icon 
    : APP_LOGO

  const notificationPayload: Record<string, string> = {
    title: job.title,
    body: job.body,
  }
  if (iconUrl) {
    notificationPayload.image = iconUrl
  }

  // FCM HTTP v1 API는 data 필드의 모든 값이 문자열이어야 함
  const stringifyDataValue = (value: any): string => {
    if (value === null || value === undefined) {
      return ''
    }
    // 객체나 배열은 JSON 문자열로 변환
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return String(value)
  }
  
  const dataFields: Record<string, string> = {
    type: stringifyDataValue(job.notification_type || 'system'),
    url: stringifyDataValue(job.url || '/'),
  }
  
  // job.data 처리 (JSON 문자열이거나 객체일 수 있음)
  let parsedData: any = null
  if (job.data) {
    if (typeof job.data === 'string') {
      try {
        parsedData = JSON.parse(job.data)
      } catch {
        // JSON 파싱 실패 시 문자열 그대로 사용
        parsedData = { raw: job.data }
      }
    } else if (typeof job.data === 'object') {
      parsedData = job.data
    }
  }
  
  // 파싱된 data의 모든 값을 문자열로 변환
  if (parsedData) {
    for (const [key, value] of Object.entries(parsedData)) {
      dataFields[key] = stringifyDataValue(value)
    }
  }

  const message: Record<string, any> = {
    token,
    notification: notificationPayload,
    data: dataFields,
  }

  // Android 설정
  message.android = {
    notification: {
      ...(job.tag ? { tag: job.tag } : {}),
      // 프로필 이미지가 있으면 알림 이미지로 설정
      image: iconUrl,
      notification_count: job.badgeCount || 1, // 뱃지 카운트
    },
  }

  // iOS (APNs) 설정
  message.apns = {
    payload: {
      aps: {
        'mutable-content': 1, // Notification Service Extension 활성화 (이미지 처리용)
        badge: job.badgeCount || 1, // 읽지 않은 메시지 수
        sound: 'default',
      },
    },
    fcm_options: {
      // 프로필 이미지 또는 앱 로고 이미지 URL 전달 (Notification Service Extension에서 처리)
      image: iconUrl,
    },
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10초 타임아웃

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorPayload = await response.json().catch(async () => {
        const text = await response.text()
        return { error: { message: text } }
      })
      const errorMessage = errorPayload?.error?.message || 'Unknown FCM v1 error'
      const errorCode = errorPayload?.error?.code || response.status
      console.error(`FCM v1 API error (${errorCode}):`, errorPayload)
      const deactivate =
        typeof errorMessage === 'string' &&
        (errorMessage.includes('UNREGISTERED') || 
         errorMessage.includes('NOT_FOUND') ||
         errorMessage.includes('Requested entity was not found'))
      return { success: false, error: errorMessage, deactivateToken: deactivate }
    }

    return { success: true }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      return { success: false, error: 'FCM v1 request timeout' }
    }
    return { success: false, error: error.message }
  }
}

function loadServiceAccount(): FcmServiceAccount | null {
  // base64로 인코딩된 값 먼저 시도
  const base64Raw = Deno.env.get('FCM_SERVICE_ACCOUNT_BASE64')
  if (base64Raw) {
    try {
      const decoded = atob(base64Raw)
      const parsed = JSON.parse(decoded)
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: normalizePrivateKey(parsed.private_key),
          token_uri: parsed.token_uri || FCM_V1_DEFAULT_TOKEN_URI,
        }
      }
    } catch (error) {
      console.error('Failed to decode base64 FCM service account:', error)
    }
  }

  // 일반 JSON 형식도 시도
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) {
    return null
  }

  try {
    // 환경 변수에서 JSON 문자열 정리 (앞뒤 공백, 따옴표 제거)
    let cleaned = raw.trim()
    // 따옴표로 감싸져 있으면 제거
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1)
    }
    // 이스케이프된 따옴표 처리
    cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'")
    
    const parsed = JSON.parse(cleaned)
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.error('Invalid FCM service account configuration: missing required fields')
      return null
    }

    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: normalizePrivateKey(parsed.private_key),
      token_uri: parsed.token_uri || FCM_V1_DEFAULT_TOKEN_URI,
    }
  } catch (error) {
    console.error('Failed to parse FCM service account JSON:', error)
    console.error('Raw value (first 100 chars):', raw.substring(0, 100))
    return null
  }
}

function normalizePrivateKey(key: string): string {
  if (key.includes('\\n')) {
    return key.replace(/\\n/g, '\n')
  }
  return key
}

async function getAccessToken(serviceAccount: FcmServiceAccount): Promise<string> {
  const now = Date.now()
  if (cachedAccessToken && now < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token
  }

  const assertion = await createSignedJwt(serviceAccount)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10초 타임아웃

  try {
    const response = await fetch(serviceAccount.token_uri || FCM_V1_DEFAULT_TOKEN_URI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to obtain FCM access token: ${text}`)
    }

    const data = await response.json()
    const expiresInMs = ((data.expires_in ?? 3600) - 60) * 1000
    cachedAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(expiresInMs, 60_000),
    }

    return cachedAccessToken.token
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error('FCM access token request timeout')
    }
    throw error
  }
}

async function createSignedJwt(serviceAccount: FcmServiceAccount): Promise<string> {
  const header = base64UrlEncode(textEncoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(
    textEncoder.encode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: FCM_V1_SCOPE,
        aud: serviceAccount.token_uri || FCM_V1_DEFAULT_TOKEN_URI,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  )
  const unsignedToken = `${header}.${payload}`

  const key = await getServiceAccountCryptoKey(serviceAccount)
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, textEncoder.encode(unsignedToken))
  const signature = base64UrlEncode(new Uint8Array(signatureBuffer))

  return `${unsignedToken}.${signature}`
}

async function getServiceAccountCryptoKey(serviceAccount: FcmServiceAccount): Promise<CryptoKey> {
  if (!serviceAccountCryptoKeyPromise) {
    const keyData = pemToArrayBuffer(serviceAccount.private_key)
    serviceAccountCryptoKeyPromise = crypto.subtle.importKey(
      'pkcs8',
      keyData,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign'],
    )
  }

  return serviceAccountCryptoKeyPromise
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '')
  const binaryString = atob(cleaned)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}


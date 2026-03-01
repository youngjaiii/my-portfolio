import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, parseRequestBody } from '../_shared/utils.ts'

/**
 * 🐾 2️⃣ 채팅 흐름 – 앱이 켜져 있을 때 / 꺼져 있을 때
 * 
 * A가 B에게 채팅을 보냄
 * 
 * 흐름:
 * 1. A의 화면: 메시지 전송 → DB에 저장 → 이 Edge Function 호출
 * 2. Edge Function: 대상 유저의 구독 목록 조회 → 메시지 요약 정보 조회 → 푸시 payload 구성 → Web Push 발송
 * 3. B의 기기: 서비스워커가 push 이벤트 수신 → OS가 잠금 화면 알림 표시
 * 4. B가 알림 탭: 서비스워커 notificationclick → 앱 실행 + 라우팅
 */

interface NotifyChatBody {
  roomId?: string
  messageId?: string
  targetMemberId: string
  senderId?: string
  message?: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: NotifyChatBody = await parseRequestBody(req)

    if (!body || !body.targetMemberId) {
      return errorResponse('INVALID_BODY', 'targetMemberId is required')
    }

    const supabase = createSupabaseClient()
    const { targetMemberId, senderId, messageId, message } = body

    // 2-3-1. 요청 Body 파싱 (이미 위에서 완료)
    // 2-3-2. 메시지 정보 가져오기 (messageId가 있는 경우)
    let messageContent = message || '새 메시지가 도착했어요'
    let senderName = '알 수 없는 사용자'
    let senderImage: string | null = null
    
    const APP_LOGO = 'https://mateyou.me/app-icon.png' // 기본 앱 아이콘

    if (messageId) {
      const { data: messageData, error: messageError } = await supabase
        .from('member_chats')
        .select(`
          message,
          sender:members!sender_id(id, name, profile_image)
        `)
        .eq('id', messageId)
        .single()

      if (!messageError && messageData) {
        messageContent = messageData.message || messageContent
        if (messageData.sender) {
          senderName = (messageData.sender as any).name || senderName
          // profile_image가 실제로 존재하고 유효한 URL인지 확인
          const profileImg = (messageData.sender as any).profile_image
          if (profileImg && typeof profileImg === 'string' && profileImg.startsWith('http')) {
            senderImage = profileImg
          }
        }
      }
    }
    
    // messageId로 못 찾았거나 senderImage가 없으면 senderId로 다시 조회
    if (senderId && !senderImage) {
      const { data: senderData, error: senderError } = await supabase
        .from('members')
        .select('name, profile_image')
        .eq('id', senderId)
        .single()

      if (!senderError && senderData) {
        senderName = senderData.name || senderName
        // profile_image가 실제로 존재하고 유효한 URL인지 확인
        const profileImg = senderData.profile_image
        if (profileImg && typeof profileImg === 'string' && profileImg.startsWith('http')) {
          senderImage = profileImg
        }
      }
    }
    
    // 최종적으로 프로필 이미지가 없으면 앱 로고 사용
    const finalIcon = senderImage || APP_LOGO
    console.log('📷 Push notification icon:', { senderName, senderImage, finalIcon })

    // 특수 메시지 형식을 읽기 쉬운 텍스트로 변환
    let messagePreview = messageContent
    
    // 하트 선물 [HEART_GIFT:이미지:개수:포인트]
    if (messagePreview.startsWith('[HEART_GIFT:')) {
      const match = messagePreview.match(/\[HEART_GIFT:[^:]+:(\d+):(\d+)\]/)
      if (match) {
        messagePreview = `❤️ 하트 ${match[1]}개를 선물했습니다`
      }
    }
    // 퀘스트 요청 [QUEST_REQUEST:퀘스트이름:횟수:총금액]
    else if (messagePreview.startsWith('[QUEST_REQUEST:')) {
      const match = messagePreview.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+)\]/)
      if (match) {
        messagePreview = `📋 퀘스트 요청: ${match[1]} ${match[2]}회`
      }
    }
    // 통화 시작/수락 메시지는 푸시 알림으로 보내지 않음 (VoIP 푸시로 처리)
    const isCallMessage = messagePreview.startsWith('[CALL_START:') || messagePreview.startsWith('[CALL_ACCEPT:')
    
    if (isCallMessage) {
      console.log('📞 통화 메시지 감지, 푸시 알림 건너뜀:', messagePreview)
      return successResponse({
        success: true,
        sent: 0,
        total: 0,
        message: 'Call message - push notification skipped'
      })
    }
    
    // 통화 종료 [CALL_END:voice:초] 또는 [CALL_END:video:초]
    else if (messagePreview.startsWith('[CALL_END:')) {
      const match = messagePreview.match(/\[CALL_END:(voice|video):(\d+)\]/)
      if (match) {
        const isVideo = match[1] === 'video'
        const seconds = Number(match[2])
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        const duration = seconds > 0 
          ? mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`
          : ''
        messagePreview = isVideo 
          ? `📹 영상통화가 종료되었습니다${duration ? ` (${duration})` : ''}`
          : `📞 음성통화가 종료되었습니다${duration ? ` (${duration})` : ''}`
      }
    }
    // 일반 메시지는 50자로 잘라서 미리보기
    else if (messagePreview.length > 50) {
      messagePreview = messagePreview.substring(0, 50) + '...'
    }

    // 2-3-2. 대상 유저의 구독 목록 조회
    // web_push_subscriptions 테이블에서 targetMemberId로 조회
    // member_id 또는 partner_id로 조회 시도
    let subscriptions = []
    let subError = null

    const { data: memberSubs, error: memberError } = await supabase
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('member_id', targetMemberId)

    if (!memberError && memberSubs) {
      subscriptions = memberSubs
    } else {
      // partner_id로 조회 시도
      const { data: partnerSubs, error: partnerError } = await supabase
        .from('web_push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('partner_id', targetMemberId)

      if (!partnerError && partnerSubs) {
        subscriptions = partnerSubs
      } else {
        subError = partnerError || memberError
      }
    }

    if (subError) {
      console.error('구독 정보 조회 실패:', subError)
      return errorResponse('SUBSCRIPTION_FETCH_ERROR', 'Failed to fetch subscriptions', subError.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('❌ 구독 정보 없음:', targetMemberId)
      return successResponse({
        success: true,
        sent: 0,
        total: 0,
        message: 'No active subscriptions found'
      })
    }

    // 2-3-4. 푸시 payload 구성
    const chatUrl = body.roomId
      ? `/chat?partnerId=${senderId || ''}`
      : senderId
        ? `/chat?partnerId=${senderId}`
        : '/chat'

    const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://mateyou.me'

    // 2-3-5. 각 구독 endpoint에 Web Push 발송
    // Web Push 프로토콜을 통해 Chrome Push 서버 → B의 디바이스로 메시지 전달
    const results = []

    for (const sub of subscriptions) {
      try {
        // push-notification Edge Function 호출
        const pushResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/push-notification`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'send_notification',
              target_member_id: targetMemberId, // member_id로 먼저 시도
              target_partner_id: null,
              payload: {
                title: `💬 ${senderName}`,
                body: messagePreview,
                icon: finalIcon, // sender의 프로필 이미지 또는 앱 로고
                url: `${APP_BASE_URL}${chatUrl}`,
                tag: 'chat',
                type: 'chat',
                data: {
                  roomId: body.roomId,
                  senderId: senderId,
                  type: 'chat',
                },
              },
            }),
          }
        )

        if (pushResponse.ok) {
          results.push({ success: true })
          console.log('✅ 채팅 푸시 알림 전송 성공:', targetMemberId)
        } else {
          const errorText = await pushResponse.text()
          console.error('❌ 푸시 알림 전송 실패:', errorText)
          results.push({ success: false, error: errorText })
        }
      } catch (pushError) {
        console.error('❌ 푸시 알림 전송 중 오류:', pushError)
        results.push({ success: false, error: pushError.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    return successResponse({
      success: successCount > 0,
      sent: successCount,
      total: results.length,
      message: `Sent ${successCount}/${results.length} notifications`
    })

  } catch (error) {
    console.error('❌ notify-chat 오류:', error)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500)
  }
})


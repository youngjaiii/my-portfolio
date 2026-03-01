import { useCallback, useEffect, useRef, useState } from 'react'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'
import { edgeApi } from '@/lib/edgeApi'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'

type Message = Database['public']['Tables']['member_chats']['Row'] & {
  sender?: { id: string; name: string; profile_image?: string | null }
  receiver?: { id: string; name: string; profile_image?: string | null }
  media?: Array<{
    id: string
    media_url: string
    media_type: string
    file_name?: string
    thumbnail_url?: string
  }>
}
type ChatRoom = {
  partnerId: string
  partnerName: string
  partnerAvatar?: string | null
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  roomId?: string // 채팅방 ID 추가
}

const PAGE_SIZE = 20

// 1. 메시지 조회 훅 (api-chat 사용)
export function useChatMessages(currentUserId: string, partnerId: string, chatRoomId?: string) {
  const [messages, setMessages] = useState<Array<Message>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const fetchMessagesRef = useRef<(() => Promise<void>) | null>(null)
  const roomIdRef = useRef<string | null>(null)

  const { chatRooms } = useGlobalRealtime()

  // 메시지를 즉시 추가하는 함수 (optimistic update용)
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
  }, [])

  // 메시지를 제거하는 함수 (에러 발생 시 롤백용)
  const removeMessage = useCallback((messageId: string | number) => {
    setMessages((prev) => prev.filter((m) => String(m.id) !== String(messageId)))
  }, [])

  // 메시지를 읽음으로 표시하는 함수
  const markMessagesAsRead = useCallback(async () => {
    if (!roomId) return

    try {
      await edgeApi.chat.markAsRead(roomId)
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }, [roomId])

  // 이전 메시지 더 불러오기
  const loadMoreMessages = useCallback(async () => {
    if (!roomId || isLoadingMore || !hasMore) return

    try {
      setIsLoadingMore(true)
      const nextPage = currentPage + 1
      const messagesResponse = await mateYouApi.chat.getMessages(roomId, nextPage, PAGE_SIZE)
      
      if (!messagesResponse.data?.success) return

      let olderMessages = messagesResponse.data.data || []
      
      if (olderMessages.length === 0) {
        setHasMore(false)
        return
      }

      // 미디어 데이터 조회
      const messageIds = olderMessages.map((m: any) => m.id).filter(Boolean)
      if (messageIds.length > 0) {
        const { data: mediaData } = await supabase
          .from('chat_media')
          .select('id, chat_id, media_url, media_type, file_name, thumbnail_url')
          .in('chat_id', messageIds)

        if (mediaData && mediaData.length > 0) {
          const mediaByMessageId = mediaData.reduce((acc: any, media: any) => {
            if (!acc[media.chat_id]) acc[media.chat_id] = []
            acc[media.chat_id].push(media)
            return acc
          }, {})

          olderMessages = olderMessages.map((m: any) => ({
            ...m,
            chat_media: mediaByMessageId[m.id] || m.chat_media || []
          }))
        }
      }

      // 이전 메시지를 앞에 추가 (오래된 메시지가 위로) - 중복 제거
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m: any) => m.id))
        const uniqueOlderMessages = olderMessages.filter((m: any) => !existingIds.has(m.id))
        return [...uniqueOlderMessages, ...prev]
      })
      setCurrentPage(nextPage)
      
      // 가져온 메시지가 PAGE_SIZE보다 적으면 더 이상 없음
      if (olderMessages.length < PAGE_SIZE) {
        setHasMore(false)
      }
    } catch (err) {
      console.error('Error loading more messages:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [roomId, isLoadingMore, hasMore, currentPage])

  const refreshMessages = useCallback(async () => {
    if (!currentUserId || (!partnerId && !chatRoomId)) return
    if (fetchMessagesRef.current) {
      await fetchMessagesRef.current()
    }
  }, [currentUserId, partnerId, chatRoomId])

  useEffect(() => {
    if (!currentUserId || (!partnerId && !chatRoomId)) {
      setMessages([])
      setRoomId(null)
      roomIdRef.current = null
      setIsLoading(false)
      setHasMore(true)
      setCurrentPage(1)
      return
    }

    let isMounted = true
    let subscription: any = null

    const fetchMessages = async () => {
      console.log('🚀 [fetchMessages] 시작:', { currentUserId, partnerId, chatRoomId: chatRoomId || 'none' })
      try {
        setIsLoading(true)
        setError(null)

        let resolvedRoomId: string | null = null

        if (chatRoomId) {
          resolvedRoomId = chatRoomId
          console.log('✅ [fetchMessages] CS 방 chatRoomId 사용:', resolvedRoomId)
        } else {
          const existingRoom = chatRooms.find(room => room.partnerId === partnerId || room.roomId === partnerId)
          if (existingRoom?.roomId) {
            resolvedRoomId = existingRoom.roomId
            console.log('✅ [fetchMessages] 기존 채팅방 발견:', resolvedRoomId)
          }
        }

        if (!resolvedRoomId && !chatRoomId) {
          try {
            const roomResponse = await edgeApi.chat.createRoom(partnerId) as {
              success: boolean
              data?: { id: string }
            }
            if (roomResponse.success && roomResponse.data?.id) {
              resolvedRoomId = roomResponse.data.id
            }
          } catch {
            // ignore
          }
          if (!resolvedRoomId) {
            const mateYouResponse = await mateYouApi.chat.createRoom({ partner_id: partnerId })
            if (mateYouResponse.data?.success && mateYouResponse.data?.data?.id) {
              resolvedRoomId = mateYouResponse.data.data.id
            }
          }
        }

        if (!resolvedRoomId) {
          throw new Error('채팅방을 찾을 수 없습니다. 상대방이 존재하지 않을 수 있습니다.')
        }
        
        console.log('📌 채팅방 ID:', resolvedRoomId)

        if (isMounted) {
          setRoomId(resolvedRoomId)
          roomIdRef.current = resolvedRoomId
        }

        const messagesResponse = await mateYouApi.chat.getMessages(resolvedRoomId, 1, PAGE_SIZE)
        console.log('📥 메시지 조회 응답:', messagesResponse.data)
        if (!messagesResponse.data?.success) {
          throw new Error('메시지 조회 실패')
        }

        let fetchedMessages = messagesResponse.data.data || []
        
        // 페이지네이션 상태 초기화
        if (isMounted) {
          setCurrentPage(1)
          setHasMore(fetchedMessages.length >= PAGE_SIZE)
        }

        // chat_media가 없는 메시지들에 대해 추가 조회
        const messageIds = fetchedMessages.map((m: any) => m.id).filter(Boolean)
        if (messageIds.length > 0) {
          const { data: mediaData } = await supabase
            .from('chat_media')
            .select('id, chat_id, media_url, media_type, file_name, thumbnail_url')
            .in('chat_id', messageIds)

          if (mediaData && mediaData.length > 0) {
            console.log('🖼️ 조회된 미디어:', mediaData)
            // 메시지에 chat_media 매핑 (chat_id = message.id)
            const mediaByMessageId = mediaData.reduce((acc: any, media: any) => {
              if (!acc[media.chat_id]) acc[media.chat_id] = []
              acc[media.chat_id].push(media)
              return acc
            }, {})

            fetchedMessages = fetchedMessages.map((m: any) => ({
              ...m,
              chat_media: mediaByMessageId[m.id] || m.chat_media || []
            }))
          }
        }

        if (isMounted) {
          setMessages(fetchedMessages)
        }

        await edgeApi.chat.markAsRead(resolvedRoomId)
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching messages:', err)
          setError('메시지를 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchMessagesRef.current = fetchMessages

    // 재연결 관련 변수
    let reconnectAttempts = 0
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    const MAX_RECONNECT_ATTEMPTS = 5

    // 재연결 스케줄링
    const scheduleReconnect = () => {
      if (!isMounted || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
      
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      console.log(`[Chat] ${delay}ms 후 재연결 시도 (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`)
      
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = setTimeout(() => {
        reconnectAttempts++
        setupSubscription()
      }, delay)
    }

    const setupSubscription = () => {
      const roomIdForSub = roomIdRef.current
      if (!roomIdForSub) return
      if (subscription) {
        subscription.unsubscribe()
      }

      subscription = supabase
        .channel(`chat-${currentUserId}-${roomIdForSub}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'member_chats',
          },
          (payload) => {
            if (isMounted) {
              const newMessage = payload.new as Message & { chat_room_id?: string }
              const isRelevantMessage =
                (roomIdForSub && newMessage.chat_room_id === roomIdForSub) ||
                (newMessage.sender_id === currentUserId &&
                  newMessage.receiver_id === partnerId) ||
                (newMessage.sender_id === partnerId &&
                  newMessage.receiver_id === currentUserId)

              if (isRelevantMessage) {
                // 중복 체크
                setMessages((prev) => {
                  const isDuplicate = prev.some(
                    (msg) =>
                      msg.id === newMessage.id ||
                      (msg.message === newMessage.message &&
                        msg.sender_id === newMessage.sender_id &&
                        Math.abs(
                          new Date(msg.created_at).getTime() -
                            new Date(newMessage.created_at).getTime(),
                        ) < 5000),
                  )

                  if (isDuplicate) return prev

                  // optimistic 메시지 제거 후 실제 메시지 추가
                  const filteredMessages = prev.filter(
                    (msg) =>
                      !(
                        typeof msg.id === 'number' &&
                        msg.message === newMessage.message &&
                        msg.sender_id === newMessage.sender_id &&
                        Math.abs(
                          new Date(msg.created_at).getTime() -
                            new Date(newMessage.created_at).getTime(),
                        ) < 10000
                      ),
                  )
                  return [...filteredMessages, newMessage]
                })

                // 상대방 메시지 읽음 처리는 SimpleChatRoom에서 GlobalRealtimeProvider의 markChatAsRead로 처리

                // 발신자 정보 및 미디어 비동기 조회 (항상 실행)
                const enrichMessageAsync = async () => {
                  try {
                    // 미디어 조회는 약간의 딜레이 후 실행 (DB 동기화 대기)
                    await new Promise(resolve => setTimeout(resolve, 500))
                    
                    const [senderResult, mediaResult] = await Promise.all([
                      supabase
                        .from('members')
                        .select('id, name, profile_image')
                        .eq('id', newMessage.sender_id)
                        .single(),
                      supabase
                        .from('chat_media')
                        .select('id, chat_id, media_url, media_type, file_name, thumbnail_url')
                        .eq('chat_id', newMessage.id)
                    ])

                    const enrichedData: any = {}
                    if (senderResult.data) {
                      enrichedData.sender = senderResult.data
                    }
                    if (mediaResult.data && mediaResult.data.length > 0) {
                      enrichedData.chat_media = mediaResult.data
                    }

                    if (Object.keys(enrichedData).length > 0) {
                      setMessages((currentMessages) =>
                        currentMessages.map((msg) =>
                          msg.id === newMessage.id
                            ? { ...msg, ...enrichedData }
                            : msg,
                        ),
                      )
                    }
                  } catch (error) {
                    console.error('Error enriching message:', error)
                  }
                }

                enrichMessageAsync()
              }
            }
          },
        )
        .subscribe((status, err) => {
          console.log(`[Chat] 채널 상태: ${status}`, err ? err.message : '')
          if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout)
              reconnectTimeout = null
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error(`[Chat] 채널 오류: ${status}`, err)
            scheduleReconnect()
          }
        })
    }

    // 앱 포그라운드 복귀 시 재연결
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        console.log('[Chat] 포그라운드 복귀 - 메시지 새로고침')
        fetchMessages()
        // 구독 상태 확인 후 재연결
        if (!subscription || (subscription as any).state !== 'joined') {
          setupSubscription()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    fetchMessages().then(() => {
      if (isMounted) {
        setupSubscription()
      }
    })

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [currentUserId, partnerId, chatRoomId])

  return { messages, isLoading, isLoadingMore, error, addMessage, removeMessage, markMessagesAsRead, refreshMessages, roomId, loadMoreMessages, hasMore }
}

// 2. 메시지 전송 훅 (api-chat 사용)
export function useSendMessage() {
  const [isSending, setIsSending] = useState(false)

  // 텍스트 메시지 전송
  const sendMessage = useCallback(
    async (senderId: string, receiverId: string, message: string, roomId?: string) => {
      const trimmedMessage = message.trim()

      if (!senderId || !receiverId || !trimmedMessage) {
        throw new Error('필수 정보가 누락되었습니다.')
      }

      try {
        setIsSending(true)
        console.log('📤 메시지 전송 시도:', { senderId, receiverId, message: trimmedMessage.substring(0, 20), roomId })

        // roomId가 없으면 채팅방 생성/조회
        let chatRoomId = roomId
        if (!chatRoomId) {
          const roomResponse = await mateYouApi.chat.createRoom({ partner_id: receiverId })
          if (!roomResponse.data?.success || !roomResponse.data?.data?.id) {
            throw new Error('채팅방 생성 실패')
          }
          chatRoomId = roomResponse.data.data.id
        }

        // api-chat으로 메시지 전송
        const response = await mateYouApi.chat.sendMessage({
          room_id: chatRoomId!,
          message: trimmedMessage,
          message_type: 'text',
        })
        console.log('📤 메시지 전송 응답:', response.data)

        if (!response.data?.success) {
          const error = new Error(response.data?.error?.message || 'Failed to send message') as Error & { code?: string }
          error.code = response.data?.error?.code
          throw error
        }

        // 푸시 알림 전송
        const messageId = response.data.data?.id
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

        // 푸시 알림용 메시지 변환 (특수 형식을 읽기 쉬운 텍스트로)
        let pushMessage = trimmedMessage
        if (trimmedMessage.startsWith('[QUEST_REQUEST:')) {
          const match = trimmedMessage.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+)(?::[a-f0-9-]*)?\]/)
          if (match) pushMessage = `📋 퀘스트 요청: ${match[1]} ${match[2]}회`
        } else if (trimmedMessage.startsWith('[HEART_GIFT:')) {
          const match = trimmedMessage.match(/\[HEART_GIFT:[^:]+:(\d+):(\d+)\]/)
          if (match) pushMessage = `❤️ 하트 ${match[1]}개를 선물했습니다`
        } 
        else if (trimmedMessage.startsWith('[CALL_START:')) {
          // 통화 시작 메시지는 별도 VoIP 푸시로 처리되므로 채팅 푸시 안 보냄
          console.log('📞 [Chat] CALL_START message, skipping chat push')
        }

        // CALL_START는 채팅 푸시 안 보냄
        const skipPush = trimmedMessage.startsWith('[CALL_START:')

        // 1. 네이티브 푸시 (push-native)
        if (!skipPush) {
          console.log('📲 push-native 호출 시작:', { receiverId, senderId, messageId })
          fetch(`${supabaseUrl}/functions/v1/push-native`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'enqueue_notification',
              user_id: receiverId,
              target_member_id: receiverId,
              title: '새 메시지',
              body: pushMessage,
              url: `/chat?partnerId=${senderId}`,
              notification_type: 'chat',
              data: {
                messageId,
                senderId,
                partnerId: senderId,
                url: `/chat?partnerId=${senderId}`,
                type: 'chat',
              },
              process_immediately: true,
            }),
          })
          .then(res => {
            console.log('📲 push-native 응답:', res.status)
            return res.json()
          })
          .then(json => console.log('✅ push-native 응답 데이터:', json))
          .catch((err: any) => console.error('❌ Native push failed:', err))

          // 2. 웹 푸시 (notify-chat)
          fetch(`${supabaseUrl}/functions/v1/notify-chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messageId,
              targetMemberId: receiverId,
              senderId,
              message: pushMessage,
            }),
          })
          .then(res => console.log('📲 notify-chat 응답:', res.status))
          .catch((err: any) => console.error('❌ Web push failed:', err))
        }

        console.log('✅ 메시지 전송 완료')

        return response.data.data
      } catch (err: any) {
        console.error('Error sending message:', err)

        // axios 에러에서 API 에러 메시지 추출
        let errorMessage = 'Failed to send message'
        let errorCode: string | undefined = undefined

        if (err?.response?.data?.error) {
          // API가 에러 응답을 반환한 경우
          errorMessage = err.response.data.error.message || errorMessage
          errorCode = err.response.data.error.code
        } else if (err instanceof Error) {
          errorMessage = err.message
          errorCode = (err as any).code
        }

        const error = new Error(errorMessage) as Error & { code?: string }
        error.code = errorCode
        throw error
      } finally {
        setIsSending(false)
      }
    },
    [],
  )

  // 미디어 메시지 전송
  const sendMessageWithMedia = useCallback(
    async (
      roomId: string,
      message: string,
      mediaFiles: Array<{
        media_url: string
        media_type: 'image' | 'video' | 'file'
        file_name?: string
        thumbnail_url?: string
      }>,
      senderId?: string,
      receiverId?: string
    ) => {
      try {
        setIsSending(true)
        console.log('📤 미디어 메시지 전송:', { roomId, message, mediaCount: mediaFiles.length })

        const response = await mateYouApi.chat.sendMessageWithMedia({
          room_id: roomId,
          message,
          message_type: 'media',
          media_files: mediaFiles,
        })

        if (!response.data?.success) {
          throw new Error(response.data?.error?.message || '미디어 전송 실패')
        }

        // 푸시 알림 전송
        if (receiverId && senderId) {
          const messageId = response.data.data?.id
          const previewMessage = mediaFiles.length > 0 
            ? (message || '미디어를 보냈습니다.')
            : message
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

          // 1. 네이티브 푸시 (push-native)
          fetch(`${supabaseUrl}/functions/v1/push-native`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'enqueue_notification',
              user_id: receiverId,
              target_member_id: receiverId,
              title: '새 메시지',
              body: previewMessage,
              url: `/chat?partnerId=${senderId}`,
              notification_type: 'chat',
              data: {
                messageId,
                senderId,
                partnerId: senderId,
                url: `/chat?partnerId=${senderId}`,
                type: 'chat',
              },
              process_immediately: true,
            }),
          })
          .then(res => console.log('📲 push-native 응답:', res.status))
          .catch((err: any) => console.error('❌ Native push failed:', err))

          // 2. 웹 푸시 (notify-chat)
          fetch(`${supabaseUrl}/functions/v1/notify-chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messageId,
              targetMemberId: receiverId,
              senderId,
              message: previewMessage,
            }),
          })
          .then(res => console.log('📲 notify-chat 응답:', res.status))
          .catch((err: any) => console.error('❌ Web push failed:', err))

          console.log('✅ 미디어 메시지 전송 및 푸시 알림 완료')
        }

        return response.data.data
      } catch (err) {
        console.error('Error sending media message:', err)
        throw err
      } finally {
        setIsSending(false)
      }
    },
    [],
  )

  // 파일 업로드
  const uploadFiles = useCallback(
    async (roomId: string, files: File[], thumbnails?: File[]) => {
      try {
        console.log('📤 파일 업로드:', { roomId, fileCount: files.length })

        const response = await mateYouApi.chat.uploadFiles(roomId, files, thumbnails)
        console.log('📤 업로드 응답:', response.data)

        if (!response.data?.success) {
          throw new Error(response.data?.error?.message || '파일 업로드 실패')
        }

        // API 응답은 배열 형태
        const uploadedFiles = response.data.data
        console.log('📤 업로드된 파일:', uploadedFiles)
        
        return uploadedFiles
      } catch (err) {
        console.error('Error uploading files:', err)
        throw err
      }
    },
    [],
  )

  return { sendMessage, sendMessageWithMedia, uploadFiles, isSending }
}

// 3. 채팅방 목록 훅 (api-chat 사용)
export function useChatRooms(currentUserId: string) {
  const [rooms, setRooms] = useState<Array<ChatRoom>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockedUsers, setBlockedUsers] = useState<Array<string>>([])
  const [isCurrentUserPartner, setIsCurrentUserPartner] = useState(false)

  // 차단된 사용자 목록 가져오기
  const fetchBlockedUsers = useCallback(async () => {
    if (!currentUserId) return

    try {
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('role')
        .eq('id', currentUserId)
        .single()

      if (memberError) {
        console.error('사용자 정보 조회 실패:', memberError)
        return
      }

      setIsCurrentUserPartner(memberData.role === 'partner')

      if (memberData.role !== 'partner') {
        setBlockedUsers([])
        return
      }

      const response = await mateYouApi.partners.getPartnerIdByMemberId(currentUserId)

      if (!response.data.success || !response.data.data || typeof response.data.data !== 'object' || !('id' in response.data.data)) {
        setBlockedUsers([])
        return
      }

      const partnerIdData = response.data.data as { id: string }

      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('ben_lists')
        .eq('id', partnerIdData.id)
        .single()

      if (partnerError) {
        console.error('차단 목록 조회 실패:', partnerError)
        return
      }

      const banLists = Array.isArray(partnerData?.ben_lists)
        ? partnerData.ben_lists
        : []
      const blockedUserIds = banLists.map((banned: any) => banned.user_id)
      setBlockedUsers(blockedUserIds)
    } catch (error) {
      console.error('차단 목록 조회 중 오류:', error)
    }
  }, [currentUserId])

  // 새 메시지로 채팅방 업데이트하는 함수
  const updateRoomWithNewMessage = useCallback(
    (message: Message) => {
      setRooms((prevRooms) => {
        return prevRooms.map((room) => {
          const partnerId =
            message.sender_id === currentUserId
              ? message.receiver_id
              : message.sender_id

          if (room.partnerId === partnerId) {
            return {
              ...room,
              lastMessage: message.message || '',
              lastMessageTime: message.created_at,
              unreadCount:
                message.sender_id !== currentUserId
                  ? room.unreadCount + 1
                  : room.unreadCount,
            }
          }
          return room
        })
      })
    },
    [currentUserId],
  )

  useEffect(() => {
    if (currentUserId) {
      fetchBlockedUsers()
    }
  }, [currentUserId, fetchBlockedUsers])

  useEffect(() => {
    if (!currentUserId) {
      setRooms([])
      setIsLoading(false)
      return
    }

    let isMounted = true

    const fetchChatRooms = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // api-chat/rooms로 채팅방 목록 조회 (Edge Function)
        const response = await edgeApi.chat.getRooms()

        if (!response?.success) {
          throw new Error('채팅방 목록 조회 실패')
        }

        if (isMounted) {
          const apiRooms = response.data || []
          
          // API 응답을 ChatRoom 형식으로 변환
          // 현재 사용자가 creator인지에 따라 상대방(partner) 정보 결정
          let chatRooms: ChatRoom[] = apiRooms.map((room: any) => {
            const isCreator = room.created_by === currentUserId
            // creator면 partner가 상대방, 아니면 creator가 상대방
            const partnerInfo = isCreator ? room.partner : room.creator
            
            return {
              partnerId: partnerInfo?.id || room.partner_id,
              partnerName: room.is_admin_room 
                ? (room.display_name || 'CS 문의') 
                : (partnerInfo?.name || 'Unknown'),
              partnerAvatar: partnerInfo?.profile_image || null,
              lastMessage: room.latest_message?.message || '',
              lastMessageTime: room.latest_message?.created_at || room.updated_at,
              unreadCount: room.unread_count ?? 0,
              roomId: room.id,
            }
          })

          // 파트너인 경우 차단된 사용자를 채팅 리스트에서 필터링
          if (isCurrentUserPartner) {
            chatRooms = chatRooms.filter(
              (room) => !blockedUsers.includes(room.partnerId),
            )
          }

          setRooms(chatRooms)
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching chat rooms:', err)
          setError('채팅방을 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchChatRooms()

    return () => {
      isMounted = false
    }
  }, [currentUserId, isCurrentUserPartner, blockedUsers])

  // 채팅방 목록 새로고침
  const refreshRooms = useCallback(async () => {
    if (!currentUserId) return

    try {
      const response = await edgeApi.chat.getRooms()

      if (!response?.success) {
        throw new Error('채팅방 목록 조회 실패')
      }

      const apiRooms = response.data || []
      
      // API 응답을 ChatRoom 형식으로 변환
      let chatRooms: ChatRoom[] = apiRooms.map((room: any) => {
        const isCreator = room.created_by === currentUserId
        const partnerInfo = isCreator ? room.partner : room.creator
        
        return {
          partnerId: partnerInfo?.id || room.partner_id,
          partnerName: room.is_admin_room 
            ? (room.display_name || '관리자') 
            : (partnerInfo?.name || 'Unknown'),
          partnerAvatar: partnerInfo?.profile_image || null,
          lastMessage: room.latest_message?.message || '',
          lastMessageTime: room.latest_message?.created_at || room.updated_at,
          unreadCount: room.unread_count ?? 0,
          roomId: room.id,
        }
      })

      if (isCurrentUserPartner) {
        chatRooms = chatRooms.filter(
          (room) => !blockedUsers.includes(room.partnerId),
        )
      }

      setRooms(chatRooms)
    } catch (err) {
      console.error('Error refreshing chat rooms:', err)
    }
  }, [currentUserId, isCurrentUserPartner, blockedUsers])

  return {
    rooms,
    isLoading,
    error,
    refreshUnreadCounts: refreshRooms,
    updateRoomWithNewMessage,
    refreshBlockedUsers: fetchBlockedUsers,
  }
}

// 4. 실시간 구독 훅 (선택적 사용)
export function useChatSubscription(
  currentUserId: string,
  onNewMessage?: (message: Message) => void,
) {
  const subscriptionRef = useRef<any>(null)

  useEffect(() => {
    if (!currentUserId) return

    // 실시간 메시지 구독
    subscriptionRef.current = supabase
      .channel('member_chats')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'member_chats',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (onNewMessage) {
            onNewMessage(payload.new as Message)
          }
        },
      )
      .subscribe()

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
    }
  }, [currentUserId, onNewMessage])

  return subscriptionRef.current
}

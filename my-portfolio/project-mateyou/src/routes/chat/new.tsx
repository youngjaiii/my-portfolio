import { useEffect, useState, useCallback, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, Search, X, Send, Users, Check, Plus, Image, Camera } from 'lucide-react'
import { Avatar, Typography } from '@/components'
import type { ApiResponse, PartnerWithMember } from '@/types/database'
import { edgeApi } from '@/lib/edgeApi'
import { mateYouApi } from '@/lib/apiClient'
import { hydrateProfileData, resolveProfileImageUrl } from '@/utils/partnerProfile'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { useSendMessage } from '@/hooks/useSimpleChat'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export const Route = createFileRoute('/chat/new' as const)({
  component: NewChatPage,
})

interface DisplayPartner {
  id: string
  name: string
  member_code?: string | null
  profile_image?: string | null
  subtitle?: string | null
}

type FilterTab = 'follower' | 'membership'

function NewChatPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isNative } = useDevice()
  const { uploadFiles, sendMessageWithMedia } = useSendMessage()
  const [partners, setPartners] = useState<DisplayPartner[]>([])
  const [filteredPartners, setFilteredPartners] = useState<DisplayPartner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // 선택된 사용자 (단일 또는 다중)
  const [selectedPartner, setSelectedPartner] = useState<DisplayPartner | null>(null)
  const [selectedPartners, setSelectedPartners] = useState<DisplayPartner[]>([])
  
  // 일괄 전송 모드
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('follower')
  
  // 메시지 입력
  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  
  // 미디어 메뉴
  const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  
  // 팔로워/멤버십 구독자 목록 (일괄 전송용)
  const [followers, setFollowers] = useState<DisplayPartner[]>([])
  const [subscribers, setSubscribers] = useState<DisplayPartner[]>([])

  const isPartnerOrAdmin = user?.role === 'partner' || user?.role === 'admin'

  // 추천 파트너 목록 로드 (기본 화면용)
  useEffect(() => {
    let mounted = true

    const fetchPartners = async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        let followingList: DisplayPartner[] = []
        
        // 1. 팔로잉한 파트너 목록 조회
        try {
          const followingResponse = (await edgeApi.members.getFollowingPartners()) as ApiResponse<Array<{
            id: string
            partner_name?: string
            profile_image?: string | null
            member_code?: string | null
          }>>
          if (!mounted) return
          
          if (followingResponse?.data && Array.isArray(followingResponse.data) && followingResponse.data.length > 0) {
            followingList = followingResponse.data.map<DisplayPartner>((partner) => ({
              id: partner.id,
              name: partner.partner_name || partner.member_code || '팔로우한 파트너',
              member_code: partner.member_code,
              profile_image: resolveProfileImageUrl(partner.profile_image),
            }))
          }
        } catch {
          console.log('팔로잉 파트너 조회 실패')
        }

        if (!mounted) return

        // 2. 전체 목록: 팔로잉 + 추천 파트너
        let allPartners = [...followingList]
        
        if (followingList.length < 24) {
          const response = (await edgeApi.partners.getList({
            limit: 24 - followingList.length,
          })) as ApiResponse<PartnerWithMember[] | { partners?: PartnerWithMember[] }>
          if (!mounted) return
          
          const responseData =
            Array.isArray(response?.data) && response.data.length > 0
              ? response.data
              : Array.isArray((response?.data as { partners?: PartnerWithMember[] })?.partners)
                ? ((response?.data as { partners?: PartnerWithMember[] }).partners ?? [])
                : []

          // API 원본 응답 확인 (hydrateProfileData 전)
          console.log('🔴 [chat/new] API 원본 응답 (첫 3개):', responseData.slice(0, 3).map((p: any) => ({
            'p.id (partners 테이블)': p.id,
            'p.member_id (members 외래키)': p.member_id,
            'p.members?.id': p.members?.id,
          })))

          const enrichedPartners = await hydrateProfileData(responseData)
          console.log('📋 [chat/new] hydrateProfileData 후:', enrichedPartners.slice(0, 3).map((p: any) => ({
            'p.id': p.id,
            'p.member_id': p.member_id,
            'p.member?.id': p.member?.id,
          })))
          
          const recommendedPartners = enrichedPartners.map<DisplayPartner>((partner) => {
            // partner.member_id가 members 테이블의 실제 ID (가장 신뢰할 수 있음)
            // API 응답: partner.member_id (외래키), partner.members (join된 데이터)
            const memberData = partner.member || (partner as any).members
            
            // member_id를 최우선으로 사용! (API가 직접 반환하는 값)
            const memberId = partner.member_id || memberData?.id
            
            console.log('🔍 [chat/new] 파트너 ID 매핑:', {
              'partner.id (partners 테이블 - 사용금지!)': partner.id,
              'partner.member_id (members 테이블 - 정답!)': partner.member_id,
              'memberData?.id': memberData?.id,
              '최종 memberId': memberId,
            })
            
            if (!memberId) {
              console.error('❌ [chat/new] member_id 없음! API 응답 확인 필요:', partner)
            }
            
            if (memberId === partner.id) {
              console.error('❌ [chat/new] member_id가 partner.id와 같음! 잘못된 매핑:', partner)
            }
            
            return {
              id: memberId || '', // member_id가 없으면 빈 문자열 (절대 partner.id 사용 금지)
              name:
                partner.partner_name ||
                memberData?.name ||
                memberData?.member_code ||
                '추천 파트너',
              member_code: memberData?.member_code || partner.member_id,
              profile_image: resolveProfileImageUrl(memberData?.profile_image),
            }
          })
          
          // 중복 제거
          const existingIds = new Set(allPartners.map(p => p.id))
          allPartners = [...allPartners, ...recommendedPartners.filter(p => !existingIds.has(p.id))]
        }
        
        setPartners(allPartners)
        setFilteredPartners(allPartners)
      } catch {
        if (!mounted) return
        setErrorMessage('추천 파트너 목록을 불러오지 못했습니다.')
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchPartners()
    return () => {
      mounted = false
    }
  }, [])

  // 팔로워/구독자 목록 로드 (파트너/관리자, 일괄 전송용)
  useEffect(() => {
    if (!isPartnerOrAdmin || !user?.id) return

    let mounted = true

    const fetchBulkData = async () => {
      try {
        let followerList: DisplayPartner[] = []
        let subscriberList: DisplayPartner[] = []

        // 1. 내 파트너 정보 조회
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .maybeSingle()
        
        if (!mounted) return

        const myPartnerId = (partnerData as { id: string } | null)?.id

        // 2. 팔로워 목록 조회 (나를 팔로우한 사람들)
        if (myPartnerId) {
          try {
            const followersResponse = (await edgeApi.follow.getMyFollowers(myPartnerId)) as ApiResponse<Array<{
              id: string
              name?: string
              profile_image?: string | null
            }>>
            
            if (!mounted) return
            
            if (followersResponse?.data && Array.isArray(followersResponse.data)) {
              followerList = followersResponse.data.map<DisplayPartner>((follower) => ({
                id: follower.id,
                name: follower.name || '팔로워',
                profile_image: resolveProfileImageUrl(follower.profile_image),
              }))
            }
          } catch {
            console.log('팔로워 조회 실패')
          }
        }

        // 3. 멤버십 구독자 목록 조회 (api-membership-subscriptions/my-subscribers)
        try {
          const subscribersResponse = await edgeApi.membershipSubscriptions.getMySubscribers()
          
          if (!mounted) return
          
          const responseData = (subscribersResponse as any)?.data
          if (responseData && Array.isArray(responseData) && responseData.length > 0) {
            const seenIds = new Set<string>()
            subscriberList = responseData.reduce<DisplayPartner[]>((acc, item: any) => {
              const member = item.members || item
              if (member && member.id && !seenIds.has(member.id)) {
                seenIds.add(member.id)
                acc.push({
                  id: member.id,
                  name: member.name || member.member_code || '구독자',
                  member_code: member.member_code,
                  profile_image: resolveProfileImageUrl(member.profile_image),
                })
              }
              return acc
            }, [])
          }
        } catch (err) {
          console.log('멤버십 구독자 조회 실패', err)
        }

        if (!mounted) return

        setFollowers(followerList)
        setSubscribers(subscriberList)
      } catch {
        console.log('일괄 전송 데이터 조회 실패')
      }
    }

    fetchBulkData()
    return () => {
      mounted = false
    }
  }, [isPartnerOrAdmin, user?.id])

  // API 검색 상태
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 검색 필터링
  useEffect(() => {
    // 일괄 전송 모드: 로컬 필터링
    if (isBulkMode) {
      let list = filterTab === 'follower' ? followers : subscribers
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        list = list.filter(p => 
          p.name.toLowerCase().includes(query) ||
          p.member_code?.toLowerCase().includes(query)
        )
      }
      
      setFilteredPartners(list)
      return
    }
    
    // 일반 모드: 검색어 없으면 추천 목록 표시
    if (!searchQuery.trim()) {
      setFilteredPartners(partners)
      return
    }
    
    // 일반 모드: API 검색 (디바운스)
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await edgeApi.partners.getList({ 
          limit: 40, 
          search: searchQuery.trim() 
        }) as ApiResponse<PartnerWithMember[]>
        
        if (response?.data && Array.isArray(response.data)) {
          const searchResults = response.data.map<DisplayPartner>((item: any) => {
            const member = item.member || item.members
            // member_id를 최우선으로 사용 (절대 item.id 사용 금지)
            const memberId = item.member_id || member?.id
            if (!memberId) {
              console.error('❌ [search] member_id 없음:', item)
            }
            return {
              id: memberId || '', // member_id가 없으면 빈 문자열
              name: item.partner_name || member?.name || item.member_code || '파트너',
              member_code: item.member_code || member?.member_code,
              profile_image: resolveProfileImageUrl(member?.profile_image || item.profile_image),
            }
          })
          setFilteredPartners(searchResults)
        }
      } catch (error) {
        console.error('검색 실패:', error)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, partners, isBulkMode, filterTab, followers, subscribers])

  // 사용자 선택
  const handleSelectPartner = useCallback(async (partner: DisplayPartner) => {
    console.log('🎯 [handleSelectPartner] 선택된 파트너:', {
      id: partner.id,
      name: partner.name,
      member_code: partner.member_code,
    })
    
    if (isBulkMode) {
      // 일괄 모드: 다중 선택
      setSelectedPartners(prev => {
        const isSelected = prev.some(p => p.id === partner.id)
        if (isSelected) {
          return prev.filter(p => p.id !== partner.id)
        }
        return [...prev, partner]
      })
    } else {
      // 단일 선택: 바로 채팅방으로 이동 (기존 채팅방 있으면 해당 채팅방, 없으면 빈 채팅방)
      console.log('🚀 [handleSelectPartner] /chat으로 이동, partnerId:', partner.id)
      navigate({
        to: '/chat',
        search: {
          partnerId: partner.id,
          partnerName: encodeURIComponent(partner.name || '파트너'),
        },
      })
    }
  }, [isBulkMode, user?.id, navigate])

  // 메시지 전송 (단일)
  const handleSendMessage = async () => {
    if (!selectedPartner || !messageInput.trim() || isSending) return
    
    setIsSending(true)
    try {
      const roomResponse = await mateYouApi.chat.createRoom({ partner_id: selectedPartner.id })
      if (!roomResponse.data?.success || !roomResponse.data?.data?.id) {
        throw new Error('채팅방 생성 실패')
      }
      
      const roomId = roomResponse.data.data.id
      
      await mateYouApi.chat.sendMessage({
        room_id: roomId,
        message: messageInput.trim(),
        message_type: 'text'
      })
      
      navigate({
        to: '/chat',
        search: {
          partnerId: selectedPartner.id,
          partnerName: encodeURIComponent(selectedPartner.name || '파트너'),
        },
      })
    } catch {
      toast.error('메시지 전송에 실패했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  // 일괄 메시지 전송
  const handleBulkSend = async () => {
    const hasMessage = messageInput.trim()
    const hasMedia = selectedMedia
    
    if (selectedPartners.length === 0 || (!hasMessage && !hasMedia) || isSending) return
    
    setIsSending(true)
    try {
      let successCount = 0
      let failCount = 0
      
      for (const partner of selectedPartners) {
        try {
          const roomResponse = await mateYouApi.chat.createRoom({ partner_id: partner.id })
          if (roomResponse.data?.success && roomResponse.data?.data?.id) {
            const roomId = roomResponse.data.data.id
            
            // 미디어 메시지 전송 (기존 채팅방과 동일한 방식)
            if (hasMedia && selectedMedia) {
              const uploadedFiles = await uploadFiles(roomId, [selectedMedia])
              if (uploadedFiles && uploadedFiles.length > 0) {
                const mediaFiles = uploadedFiles.map((f: any) => ({
                  media_url: f.url,
                  media_type: f.type.startsWith('image') ? 'image' as const : f.type.startsWith('video') ? 'video' as const : 'file' as const,
                  file_name: f.name,
                  thumbnail_url: f.thumbnail_url,
                }))
                await sendMessageWithMedia(roomId, hasMessage ? messageInput.trim() : '사진을 보냈습니다', mediaFiles)
                
                // 푸시 알림 전송 (네이티브 + 웹)
                const previewMessage = hasMessage ? messageInput.trim() : '📷 사진을 보냈습니다'
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
                const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
                
                // 1. 네이티브 푸시
                fetch(`${supabaseUrl}/functions/v1/push-native`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${anonKey}`,
                    'apikey': anonKey || '',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    action: 'enqueue_notification',
                    user_id: partner.id,
                    target_member_id: partner.id,
                    title: '새 메시지',
                    body: previewMessage,
                    url: `/chat?partnerId=${user?.id}`,
                    notification_type: 'chat',
                    data: { type: 'chat' },
                    process_immediately: true,
                  }),
                }).catch(console.error)
                
                // 2. 웹 푸시
                edgeApi.chat.notifyChat({
                  roomId,
                  targetMemberId: partner.id,
                  senderId: user?.id,
                  message: previewMessage
                }).catch(console.error)
              }
            } else if (hasMessage) {
              // 텍스트만 전송
              await mateYouApi.chat.sendMessage({
                room_id: roomId,
                message: messageInput.trim(),
                message_type: 'text'
              })
              
              // 푸시 알림 전송 (네이티브 + 웹)
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
              const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
              
              // 1. 네이티브 푸시
              fetch(`${supabaseUrl}/functions/v1/push-native`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${anonKey}`,
                  'apikey': anonKey || '',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'enqueue_notification',
                  user_id: partner.id,
                  target_member_id: partner.id,
                  title: '새 메시지',
                  body: messageInput.trim(),
                  url: `/chat?partnerId=${user?.id}`,
                  notification_type: 'chat',
                  data: { type: 'chat' },
                  process_immediately: true,
                }),
              }).catch(console.error)
              
              // 2. 웹 푸시
              edgeApi.chat.notifyChat({
                roomId,
                targetMemberId: partner.id,
                senderId: user?.id,
                message: messageInput.trim()
              }).catch(console.error)
            }
            
            successCount++
          } else {
            failCount++
          }
        } catch {
          failCount++
        }
      }
      
      if (successCount > 0) {
        toast.success(`${successCount}명에게 메시지를 전송했습니다.`)
      }
      if (failCount > 0) {
        toast.error(`${failCount}명에게 전송 실패했습니다.`)
      }
      
      setSelectedPartners([])
      setMessageInput('')
      setSelectedMedia(null)
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview)
        setMediaPreview(null)
      }
      setIsBulkMode(false)
    } catch {
      toast.error('일괄 전송에 실패했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  // 선택 취소
  const handleCancelSelection = () => {
    setSelectedPartner(null)
    setSelectedPartners([])
    setMessageInput('')
    setSelectedMedia(null)
    setMediaPreview(null)
    setIsMediaMenuOpen(false)
  }

  // 미디어 선택 핸들러
  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedMedia(file)
      const url = URL.createObjectURL(file)
      setMediaPreview(url)
      setIsMediaMenuOpen(false)
    }
  }

  // 미디어 제거
  const handleRemoveMedia = () => {
    setSelectedMedia(null)
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview)
      setMediaPreview(null)
    }
  }

  // 한글 입력 핸들러
  const handleCompositionStart = () => setIsComposing(true)
  const handleCompositionEnd = () => setIsComposing(false)

  // 키보드 핸들러 (일괄 전송용)
  const handleBulkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleBulkSend()
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-20">
      {/* 검색창 */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름 또는 멤버코드로 검색"
            className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* 일괄 전송 버튼 (파트너/관리자만) */}
      {isPartnerOrAdmin && !selectedPartner && (
        <div className="mb-4 flex items-center justify-between">
          <Typography variant="h5" className="text-[13px] font-semibold uppercase text-gray-400">
            {isBulkMode ? (filterTab === 'follower' ? '팔로워' : '구독자') : '추천'}
          </Typography>
          <button
            onClick={() => {
              setIsBulkMode(!isBulkMode)
              setSelectedPartners([])
              setFilterTab('follower')
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isBulkMode 
                ? 'bg-pink-100 text-pink-600' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Users className="h-4 w-4" />
            {isBulkMode ? '취소' : '일괄 전송'}
          </button>
        </div>
      )}

      {/* 타이틀 (일반 사용자) */}
      {!isPartnerOrAdmin && !selectedPartner && (
        <div className="mb-4">
          <Typography variant="h5" className="text-[13px] font-semibold uppercase text-gray-400">
            추천
          </Typography>
        </div>
      )}

      {/* 필터 탭 (일괄 전송 모드에서만) */}
      {isBulkMode && (
        <div className="mb-4 flex gap-2">
          {(['follower', 'membership'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setFilterTab(tab)
                setSelectedPartners([])
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterTab === tab
                  ? 'bg-[#FE3A8F] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab === 'follower' ? '팔로워' : '구독자'}
            </button>
          ))}
          {selectedPartners.length > 0 && (
            <span className="ml-auto flex items-center text-sm text-pink-600 font-medium">
              {selectedPartners.length}명 선택됨
            </span>
          )}
        </div>
      )}

      {/* 선택된 사용자 (단일) - 메시지 입력 UI */}
      {selectedPartner && !isBulkMode && (
        <div className="mb-6 p-4 bg-pink-50 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <Avatar
              src={selectedPartner.profile_image || undefined}
              alt={selectedPartner.name}
              name={selectedPartner.name}
              className="h-12 w-12 border border-pink-200"
            />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{selectedPartner.name}</p>
              <p className="text-xs text-gray-500">@{selectedPartner.member_code}</p>
            </div>
            <button
              onClick={handleCancelSelection}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="메시지를 입력하세요"
              className="flex-1 px-4 py-3 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              autoFocus
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || isSending}
              className="px-4 py-3 bg-[#FE3A8F] text-white rounded-xl disabled:opacity-50 transition-colors hover:bg-pink-600"
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {/* 사용자 목록 */}
      {isLoading || isSearching ? (
        <div className="flex items-center gap-2 px-4 py-10 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          {isSearching ? '검색 중...' : '불러오는 중...'}
        </div>
      ) : errorMessage ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
          {errorMessage}
        </div>
      ) : filteredPartners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          {searchQuery 
            ? '검색 결과가 없습니다.' 
            : isBulkMode 
              ? (filterTab === 'follower' ? '팔로워가 없습니다.' : '멤버십 구독자가 없습니다.')
              : '표시할 사용자가 없습니다.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPartners.map((partner) => {
            const isSelected = isBulkMode 
              ? selectedPartners.some(p => p.id === partner.id)
              : selectedPartner?.id === partner.id
            
            return (
              <button
                key={partner.id}
                type="button"
                onClick={() => handleSelectPartner(partner)}
                className={`flex w-full items-center gap-3 rounded-xl text-left transition-colors`}
              >
                {isBulkMode && (
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected 
                      ? 'bg-[#FE3A8F] border-[#FE3A8F]' 
                      : 'border-gray-300'
                  }`}>
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </div>
                )}
                <Avatar
                  src={partner.profile_image || undefined}
                  alt={partner.name || '파트너'}
                  name={partner.name}
                  className="h-12 w-12 border border-gray-100"
                />
                <div className="flex flex-col flex-1">
                  <span className="text-sm font-semibold text-[#110f1a]">{partner.name}</span>
                  <span className="text-xs text-gray-400">
                    @{partner.member_code || 'unknown'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 일괄 전송 입력 UI */}
      {isBulkMode && selectedPartners.length > 0 && (
        <div className="fixed bottom-17 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
          {/* 입력 영역 */}
          <div className="p-3">
            <div className="max-w-5xl mx-auto flex items-center gap-2">
              {/* + 버튼 */}
              <button
                onClick={() => setIsMediaMenuOpen(!isMediaMenuOpen)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isMediaMenuOpen ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Plus className={`w-5 h-5 transition-transform ${isMediaMenuOpen ? 'rotate-45' : ''}`} />
              </button>

              {/* 텍스트 입력 */}
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleBulkKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                placeholder={`${selectedPartners.length}명에게 메시지 전송`}
                className="flex-1 px-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white"
              />

              {/* 전송 버튼 */}
              <button
                onClick={handleBulkSend}
                disabled={(!messageInput.trim() && !selectedMedia) || isSending}
                className="px-4 py-2 bg-[#FE3A8F] text-white rounded-lg disabled:opacity-50 transition-colors hover:bg-pink-600 font-medium"
              >
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : '전송'}
              </button>
            </div>
          </div>

          {/* 미디어 프리뷰 (인풋 아래) */}
          {mediaPreview && (
            <div className="p-3">
              <div className="max-w-5xl mx-auto">
                <div className="relative inline-block">
                  {selectedMedia?.type.startsWith('video/') ? (
                    <video src={mediaPreview} className="h-20 rounded-lg" />
                  ) : (
                    <img src={mediaPreview} alt="미리보기" className="h-20 rounded-lg object-cover" />
                  )}
                  <button
                    onClick={handleRemoveMedia}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 미디어 메뉴 (인풋 아래) */}
          {isMediaMenuOpen && !mediaPreview && (
            <div className="p-3">
              <div className="max-w-5xl mx-auto flex gap-4">
                {/* 앨범 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Image className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-xs text-gray-600">앨범</span>
                </button>

                {/* 카메라 - 네이티브 환경에서만 */}
                {isNative && (
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="text-xs text-gray-600">카메라</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaSelect}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleMediaSelect}
            className="hidden"
          />
        </div>
      )}
    </div>
  )
}

import { forwardRef, useState, useRef, useEffect, useCallback } from 'react'
import { Input, VoiceCallButton } from '@/components'
import { VideoCallButton } from '@/components/ui/VideoCallButton'
import { useDevice } from '@/hooks/useDevice'
import { useAdaptiveDevice } from '@/hooks/useAdaptiveDevice'
import { Send, Plus, X, Image, Camera, Gift, Phone, Sparkles } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

const MAX_MESSAGE_LENGTH = 100
const SHOW_COUNTER_THRESHOLD = 80

// URL 패턴 감지 정규식 (보안을 위해 매우 엄격하게)
const URL_PATTERNS = [
  // HTTP/HTTPS 프로토콜
  /https?:\/\/[^\s]+/gi,
  // www로 시작
  /www\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s]*/gi,
  // 도메인.확장자 패턴 (더 엄격하게)
  /[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}\/[^\s]*/gi,
  // 유명 사이트들 직접 패턴
  /(?:youtube|youtu\.be|instagram|facebook|twitter|tiktok|discord|telegram|kakao|naver|google|github)[\w\.-]*[\/\?\=\&\w\-\.]*/gi,
  // IP 주소 패턴
  /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]+)?(?:\/[^\s]*)?\b/gi,
  // 단축 URL 패턴
  /[a-zA-Z0-9-]+\.(ly|me|co|io|cc|tk|ml|ga|cf)(?:\/[^\s]*)?/gi
]

// URL 감지 함수 (여러 패턴 체크)
const containsURL = (text: string): boolean => {
  return URL_PATTERNS.some(pattern => {
    pattern.lastIndex = 0 // 정규식 초기화
    return pattern.test(text)
  })
}

interface ChatInputProps {
  newMessage: string
  isPartnerBlockedUser: boolean
  hasAnyActiveRequest: boolean
  selectedRequest: any
  isSending: boolean
  partnerId: string
  partnerName?: string
  partnerAvatar?: string | null
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  onMessageChange: (value: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onButtonClick: () => void
  onSendMessageToChat: (message: string) => void
  onCompositionStart?: () => void
  onCompositionEnd?: () => void
  onToggleJobs?: () => void
  onToggleDonation?: () => void
  onSelectAlbum?: () => void
  onSelectCamera?: () => void
  isJobsVisible?: boolean
  isDonationVisible?: boolean
  showDonationButton?: boolean
  disabled?: boolean
  userRole?: string
  isSubscribedToPartner?: boolean
  isCurrentUserPartner?: boolean
  isPartnerRolePartner?: boolean
  messageCostInfo?: {
    shouldPay: boolean
    freeRemaining: number
    membershipQuotaRemaining: number
    chatPrice: number
  }
  hideAttachButton?: boolean
}

export const ChatInput = forwardRef<HTMLDivElement, ChatInputProps>(
  function ChatInput({
    newMessage,
    isPartnerBlockedUser,
    hasAnyActiveRequest,
    selectedRequest,
    isSending,
    partnerId,
    partnerName,
    partnerAvatar,
    inputRef,
    onMessageChange,
    onKeyDown,
    onButtonClick,
    onSendMessageToChat,
    onCompositionStart,
    onCompositionEnd,
    onToggleJobs,
    onToggleDonation,
    onSelectAlbum,
    onSelectCamera,
    isJobsVisible = false,
    isDonationVisible = false,
    showDonationButton = false,
    disabled = false,
    userRole,
    isSubscribedToPartner = false,
    isCurrentUserPartner = false,
    isPartnerRolePartner = false,
    messageCostInfo,
    hideAttachButton = false,
  }, ref) {
    const isAdmin = userRole === 'admin'
    const bothArePartners = isCurrentUserPartner && isPartnerRolePartner
    // 진행 중인 퀘스트가 있는지 확인 (in_progress 또는 accepted 상태)
    const isQuestInProgress = hasAnyActiveRequest && (
      selectedRequest?.status === 'in_progress' || 
      selectedRequest?.status === 'accepted'
    )
    
    // 통화 버튼 노출 조건:
    // 1. 둘 다 파트너 + 활성 퀘스트 있음 → 둘 다 노출
    // 2. 한쪽만 파트너 + 활성 퀘스트 있음 → 파트너에게만 노출
    // 3. 멤버십 구독 → 노출
    // 4. 관리자 → 항상 노출
    const canShowCallButton = isAdmin || isSubscribedToPartner || 
      (bothArePartners && hasAnyActiveRequest) || 
      (isCurrentUserPartner && !isPartnerRolePartner && hasAnyActiveRequest)
    
    // 통화 버튼 활성화 조건 (노출되면서 클릭 가능한지)
    // 퀘스트가 진행 중(in_progress/accepted)이거나 멤버십 구독 시 활성화
    const canCallNow = isAdmin || isSubscribedToPartner || isQuestInProgress || hasAnyActiveRequest
    
    const { isMobile } = useDevice()
    const { isMobile: isMobileUA } = useAdaptiveDevice()
    const isNative = Capacitor.isNativePlatform()
    const isMobileWeb = !isNative && isMobileUA
    const [urlBlockError, setUrlBlockError] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [showCallOptions, setShowCallOptions] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    
    // Textarea 자동 높이 조정
    const adjustTextareaHeight = useCallback(() => {
      if (inputRef.current) {
        inputRef.current.style.height = '40px'
        const scrollH = inputRef.current.scrollHeight
        inputRef.current.style.height = `${Math.max(40, Math.min(scrollH, 120))}px`
      }
    }, [inputRef])
    
    // 메시지 변경 시 높이 조정
    useEffect(() => {
      adjustTextareaHeight()
    }, [newMessage, adjustTextareaHeight])

    const messageLength = newMessage.length
    const isOverLimit = messageLength > MAX_MESSAGE_LENGTH
    const shouldShowCounter = messageLength > SHOW_COUNTER_THRESHOLD
    const remainingChars = MAX_MESSAGE_LENGTH - messageLength
    const hasUrl = containsURL(newMessage)

    // 메뉴 외부 클릭 시 닫기
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setIsMenuOpen(false)
          setShowCallOptions(false)
        }
      }
      if (isMenuOpen) {
        document.addEventListener('mousedown', handleClickOutside)
      }
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isMenuOpen])

    const handleSendClick = () => {
      if (hasUrl) {
        setUrlBlockError('보안상 링크는 전송할 수 없습니다')
        setTimeout(() => setUrlBlockError(null), 3000)
        return
      }
      setUrlBlockError(null)
      onButtonClick()
    }

    const handleMenuToggle = () => {
      setIsMenuOpen(!isMenuOpen)
      setShowCallOptions(false)
    }

    return (
      <div
        ref={ref}
        className={`${
          isMobile
            ? `bg-white px-3 w-full ${isNative ? 'pt-2 pb-3' : 'py-2'}`
            : 'border-t bg-gray-50 rounded-b-lg p-6'
        } flex-shrink-0 relative`}
      >
        <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
          {!hideAttachButton && (
            <button
              onClick={handleMenuToggle}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isMenuOpen 
                  ? 'bg-[#FE3A8F] text-white rotate-45' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              disabled={disabled}
            >
              <Plus className="w-6 h-6" />
            </button>
          )}
          <div className="flex items-center flex-1 relative">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => {
                const value = e.target.value
                if (value.length <= MAX_MESSAGE_LENGTH) {
                  onMessageChange(value)
                  // URL 에러가 있었다면 입력시 초기화
                  if (urlBlockError) {
                    setUrlBlockError(null)
                  }
                }
              }}
              onKeyDown={onKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              placeholder={
                userRole === 'normal' && isPartnerRolePartner
                  ? messageCostInfo?.shouldPay 
                    ? `${messageCostInfo?.chatPrice ?? 100}P 소요`
                    : messageCostInfo?.freeRemaining !== undefined && messageCostInfo.freeRemaining > 0
                      ? `무료 메시지 ${messageCostInfo.freeRemaining}회 남음`
                      : messageCostInfo?.membershipQuotaRemaining !== undefined && messageCostInfo.membershipQuotaRemaining > 0
                        ? `멤버십 무료 ${messageCostInfo.membershipQuotaRemaining}회 남음`
                        : `${messageCostInfo?.chatPrice ?? 100}P 소요`
                  : isMobile ? '메시지 보내기...' : '메시지 보내기... (Shift+Enter로 줄바꿈)'
              }
              className={`w-full max-h-[120px] resize-none overflow-y-auto bg-gray-200 ring-0 focus:ring-0 focus:ring-offset-0 border-none !rounded-2xl focus:border-none focus:outline-none pl-3 pr-12 caret-[#FE3A8F] ${
                isOverLimit || hasUrl
                  ? 'border-red-500 focus:border-red-500 focus:ring-0 focus:ring-offset-0'
                  : ''
              } ${isMobile ? 'text-sm' : 'text-base'}`}
              style={{
                boxShadow: 'none',
                minHeight: 40,
                maxHeight: 120,
                lineHeight: '20px',
                padding: '10px 48px 10px 12px',
                fieldSizing: 'content',
              } as React.CSSProperties}
              disabled={disabled}
            />
            {/* 글자수 카운터 */}
            {shouldShowCounter && !urlBlockError && (
              <div className={`absolute -top-6 right-0 text-xs ${
                isOverLimit ? 'text-red-500' : remainingChars < 50 ? 'text-pink-500' : 'text-gray-500'
              }`}>
                {remainingChars < 0 ? `${-remainingChars}자 초과` : `${remainingChars}자 남음`}
              </div>
            )}
            {/* URL 차단 에러 메시지 */}
            {urlBlockError && (
              <div className="absolute -top-6 right-0 text-xs text-red-500 font-medium">
                🚫 {urlBlockError}
              </div>
            )}
            {/* URL 감지 경고 */}
            {hasUrl && !urlBlockError && (
              <div className="absolute -top-6 right-0 text-xs text-red-500">
                ⚠️ 링크는 전송할 수 없습니다
              </div>
            )}
            {/* 전송 버튼 */}
            <button
              onClick={handleSendClick}
              onMouseDown={(e) => { if (isMobile) e.preventDefault() }}
              disabled={isSending || isOverLimit || hasUrl || disabled || !newMessage.trim()}
              className={`absolute right-2 -bottom-1 -translate-y-1/2 flex items-center justify-center w-10 h-6 rounded-full transition-colors ${
                newMessage.trim()
                  ? 'bg-[#FE3A8F] hover:bg-[#e8a0c0] text-white'
                  : 'bg-gray-300 text-gray-500'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="전송"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* 확장 메뉴 */}
        {isMenuOpen && (
          <div 
            ref={menuRef}
            className="mt-3 bg-gray-50 rounded-2xl p-4 animate-in slide-in-from-bottom-2 duration-200"
          >
            {!showCallOptions ? (
              <div className="grid grid-cols-5 gap-3">
                {/* 앨범 - partner/admin만 */}
                {(userRole === 'partner' || userRole === 'admin') && (
                  <button
                    onClick={() => {
                      onSelectAlbum?.()
                      setIsMenuOpen(false)
                    }}
                    className="flex flex-col items-center gap-1.5"
                    disabled={disabled}
                  >
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <Image className="w-6 h-6 text-green-600" />
                    </div>
                    <span className="text-xs text-gray-600">앨범</span>
                  </button>
                )}

                {/* 카메라 - 네이티브 환경 + partner/admin만 */}
                {isNative && (userRole === 'partner' || userRole === 'admin') && (
                  <button
                    onClick={() => {
                      onSelectCamera?.()
                      setIsMenuOpen(false)
                    }}
                    className="flex flex-col items-center gap-1.5"
                    disabled={disabled}
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="text-xs text-gray-600">카메라</span>
                  </button>
                )}

                {/* 후원 */}
                {showDonationButton && onToggleDonation && (
                  <button
                    onClick={() => {
                      onToggleDonation()
                      setIsMenuOpen(false)
                    }}
                    className="flex flex-col items-center gap-1.5"
                    disabled={disabled}
                  >
                    <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                      <Gift className="w-6 h-6 text-pink-600" />
                    </div>
                    <span className="text-xs text-gray-600">후원</span>
                  </button>
                )}

                {/* 통화 */}
                {canShowCallButton && (
                  <button
                    onClick={() => {
                      if (isMobileWeb) {
                        alert('통화는 앱에서만 이용 가능합니다.')
                        const storeUrl = Capacitor.getPlatform() === 'ios'
                          ? 'https://apps.apple.com/kr/app/%EB%A9%94%EC%9D%B4%ED%8A%B8%EC%9C%A0/id6755867402'
                          : 'https://play.google.com/store/apps/details?id=com.mateyou.app&hl=ko'
                        window.open(storeUrl, '_blank')
                        return
                      }
                      setShowCallOptions(true)
                    }}
                    className="flex flex-col items-center gap-1.5"
                    disabled={disabled || (!canCallNow && !isAdmin)}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      canCallNow || isAdmin ? 'bg-purple-100' : 'bg-gray-100'
                    }`}>
                      <Phone className={`w-6 h-6 ${canCallNow || isAdmin ? 'text-purple-600' : 'text-gray-400'}`} />
                    </div>
                    <span className={`text-xs ${canCallNow || isAdmin ? 'text-gray-600' : 'text-gray-400'}`}>통화</span>
                  </button>
                )}

                {/* 퀘스트 */}
                {onToggleJobs && (
                  <button
                    onClick={() => {
                      onToggleJobs()
                      setIsMenuOpen(false)
                    }}
                    className="flex flex-col items-center gap-1.5"
                    disabled={disabled}
                  >
                    <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-yellow-600" />
                    </div>
                    <span className="text-xs text-gray-600">퀘스트</span>
                  </button>
                )}
              </div>
            ) : (
              /* 통화 옵션 선택 */
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">통화 유형 선택</span>
                  <button onClick={() => setShowCallOptions(false)} className="p-1">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="flex gap-3 justify-center">
                  {/* 음성통화 */}
                  <VoiceCallButton
                    partnerId={partnerId}
                    partnerName={partnerName || '통화 상대'}
                    partnerAvatar={partnerAvatar}
                    disabled={disabled || !partnerId || isPartnerBlockedUser || (!canCallNow && !isAdmin)}
                    className="flex-1"
                    variant="default"
                    onSendMessage={async (message: string) => {
                      onSendMessageToChat(message)
                      setIsMenuOpen(false)
                      setShowCallOptions(false)
                    }}
                    callId={selectedRequest?.call_id}
                    isSubscribed={isSubscribedToPartner}
                  />
                  {/* 영상통화 */}
                  <VideoCallButton
                    partnerId={partnerId}
                    partnerName={partnerName || '영상통화 상대'}
                    disabled={disabled || !partnerId || isPartnerBlockedUser || (!canCallNow && !isAdmin)}
                    className="flex-1"
                    variant="default"
                    onSendMessage={async (message: string) => {
                      onSendMessageToChat(message)
                      setIsMenuOpen(false)
                      setShowCallOptions(false)
                    }}
                    callId={selectedRequest?.call_id}
                    isSubscribed={isSubscribedToPartner}
                  />
                </div>
                {!canCallNow && !isAdmin && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    퀘스트 진행 중이거나 멤버십 구독 시 이용 가능합니다
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
)
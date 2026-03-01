/**
 * CreateStreamSheet - 스트림 방 생성 바텀시트
 * 
 * 기능:
 * - 방 제목, 설명 입력
 * - 공개/비공개/구독자전용 선택
 * - 비공개 시 비밀번호 입력
 * - 최대 참여 인원 선택 (1-10명)
 * - 카테고리 선택
 * - 방송 타입 선택 (보이스/비디오)
 */

import { Button, SlideSheet, Typography } from '@/components'
import { useCreateStreamRoom } from '@/hooks/useCreateStreamRoom'
import { StreamThumbnailUpload } from '@/components/features/stream/StreamThumbnailUpload'
import { PcStreamGuide } from '@/components/features/stream/PcStreamGuide'
import { MobileStreamGuide } from '@/components/features/stream/MobileStreamGuide'
import {
    ChevronRight,
    Globe,
    Loader2,
    Lock,
    Mic,
    Monitor,
    Smartphone,
    Users,
    Video,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useDevice } from '@/hooks/useDevice'

interface CreateStreamSheetProps {
  isOpen: boolean
  onClose: () => void
  /** 초기 방송 타입 (audio/video) */
  initialStreamType?: 'audio' | 'video'
  /** 모바일 라이브 모드 (WebRTC 방송) */
  isMobileLiveMode?: boolean
}

export function CreateStreamSheet({ 
  isOpen, 
  onClose,
  initialStreamType,
  isMobileLiveMode = false,
}: CreateStreamSheetProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [isWebRTCMode, setIsWebRTCMode] = useState(isMobileLiveMode)
  const navigate = useNavigate()
  const { isMobile } = useDevice()

  const {
    formState,
    error,
    isLoading,
    isPartner,
    canSubmit,
    categories,
    selectedCategory,
    hasActiveHostingRoom,
    currentRoomId,
    updateField,
    resetForm,
    createRoom,
    setFormState,
  } = useCreateStreamRoom({
    isOpen,
    isWebRTCMode: isWebRTCMode,
    onSuccess: () => {
      onClose()
      setShowCategoryPicker(false)
    },
  })

  // initialStreamType과 isMobileLiveMode가 변경되면 폼 상태 업데이트
  useEffect(() => {
    if (isOpen) {
      if (initialStreamType) {
        updateField('streamType', initialStreamType)
      }
      setIsWebRTCMode(isMobileLiveMode)
    }
  }, [isOpen, initialStreamType, isMobileLiveMode, updateField])

  const handleClose = () => {
    resetForm()
    setShowCategoryPicker(false)
    setIsWebRTCMode(false)
    onClose()
  }

  // PC 라이브 모드 (OBS 가이드 표시)
  const isPcLiveMode = isPartner && formState.streamType === 'video' && !isWebRTCMode
  // 모바일 라이브 모드 (WebRTC 방송)
  const isMobileLive = isPartner && formState.streamType === 'video' && isWebRTCMode

  const handleOpenObsGuide = () => {
    handleClose()
    navigate({ to: '/dashboard/partner', search: { tab: 'stream' } })
  }

  // 방송 타입 옵션 (파트너만 비디오 옵션 표시)
  const streamTypeOptions = [
    { 
      value: 'audio' as const, 
      label: '보이스', 
      icon: <Mic className="w-5 h-5" />,
      description: '음성으로 소통해요',
      disabled: false,
      isWebRTC: false,
    },
    ...(isPartner ? [
      {
        value: 'video' as const, 
        label: '모바일 라이브', 
        icon: <Smartphone className="w-5 h-5" />,
        description: '폰으로 바로 방송',
        disabled: false,
        isWebRTC: true,
      },
      {
        value: 'video' as const, 
        label: 'PC 라이브', 
        icon: <Monitor className="w-5 h-5" />,
        description: 'OBS/PRISM 방송',
        disabled: false,
        isWebRTC: false,
      },
    ] : []),
  ]

  // 공개 설정 옵션
  const accessTypeOptions = [
    { 
      value: 'public' as const, 
      label: '공개', 
      icon: <Globe className="w-4 h-4" />,
      description: '모두 참여 가능',
      partnerOnly: true,
    },
    { 
      value: 'subscriber' as const, 
      label: '구독자 전용', 
      icon: <Users className="w-4 h-4" />,
      description: '구독자만 참여',
      partnerOnly: true,
    },
    { 
      value: 'private' as const, 
      label: '비공개', 
      icon: <Lock className="w-4 h-4" />,
      description: '비밀번호 필요',
      partnerOnly: false,
    },
  ]

  // 시트 타이틀 결정
  const getSheetTitle = () => {
    if (isPcLiveMode) return 'PC로 라이브 방송하기'
    if (isMobileLive) return '모바일 라이브 방송하기'
    return '방송 시작하기'
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={getSheetTitle()}
      initialHeight={0.85}
      minHeight={0.5}
      maxHeight={0.95}
      zIndex={9999}
      footer={
        isPcLiveMode ? (
          <Button
            variant="primary"
            onClick={handleOpenObsGuide}
            className="w-full"
          >
            스트림 키 관리로 이동
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={createRoom}
            disabled={!canSubmit || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                생성 중...
              </span>
            ) : isMobileLive ? (
              '방송 준비하기'
            ) : (
              '방송 시작'
            )}
          </Button>
        )
      }
    >
      {!isPartner ? (
        // 일반 유저용 UI (비공개방만 생성 가능)
        <div className="space-y-6 pb-4">
          {/* 호스트가 진행중인 방이 있으면 경고 */}
          {hasActiveHostingRoom && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ 이미 진행 중인 방송이 있습니다
              </p>
              <p className="text-xs text-red-600 mt-1">
                방송을 종료한 후 새 방을 만들 수 있습니다.
              </p>
            </div>
          )}
          
          {/* 안내 문구 */}
          <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
            <p className="text-sm text-purple-700">
              💡 일반 유저는 비공개 보이스 채팅방을 만들 수 있어요
            </p>
          </div>

          {/* 방 제목 */}
          <div>
            <Typography variant="subtitle2" className="mb-2">
              방 제목 <span className="text-red-500">*</span>
            </Typography>
            <input
              type="text"
              value={formState.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="방 제목을 입력하세요"
              maxLength={50}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{formState.title.length}/50</p>
          </div>

          {/* 방 설명 */}
          <div>
            <Typography variant="subtitle2" className="mb-2">설명 (선택)</Typography>
            <textarea
              value={formState.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="방에 대한 설명을 입력하세요"
              maxLength={200}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{formState.description.length}/200</p>
          </div>

          {/* 썸네일 이미지 (선택) */}
          <div>
            <Typography variant="subtitle2" className="mb-2">썸네일 이미지 (선택)</Typography>
            <StreamThumbnailUpload
              currentThumbnailUrl={formState.thumbnailUrl || undefined}
              onThumbnailUploaded={(url) => updateField('thumbnailUrl', url)}
              onThumbnailDeleted={() => updateField('thumbnailUrl', null)}
              required={false}
            />
          </div>

          {/* 비밀번호 (일반 유저는 비공개만) */}
          <div>
            <Typography variant="subtitle2" className="mb-2">
              비밀번호 <span className="text-red-500">*</span>
            </Typography>
            <input
              type="password"
              value={formState.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder="4자리 이상 입력해주세요"
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
            />
          </div>

          {/* 최대 참여 인원 (라이브룸은 1명 고정이므로 숨김) */}
          {formState.streamType === 'audio' && (
            <div>
              <Typography variant="subtitle2" className="mb-2">
                최대 발언자 수: <span className="text-purple-500 font-bold">{formState.maxParticipants}명</span>
              </Typography>
              <input
                type="range"
                min={1}
                max={10}
                value={formState.maxParticipants}
                onChange={(e) => updateField('maxParticipants', Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1명</span>
                <span>10명</span>
              </div>
            </div>
          )}

          {/* 카테고리 선택 */}
          <div>
            <Typography variant="subtitle2" className="mb-2">카테고리</Typography>
            <button
              type="button"
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between hover:border-gray-300 transition-colors"
            >
              <span className={selectedCategory ? 'text-[#110f1a]' : 'text-gray-400'}>
                {selectedCategory?.name || '카테고리 선택 (선택)'}
              </span>
              <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showCategoryPicker ? 'rotate-90' : ''}`} />
            </button>
            
            {showCategoryPicker && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      updateField('categoryId', category.id)
                      setShowCategoryPicker(false)
                    }}
                    className={`
                      px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${formState.categoryId === category.id
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }
                    `}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      ) : (
        // 파트너용 UI (모든 기능)
        <div className="space-y-6 pb-4">
          {/* 호스트가 진행중인 방이 있으면 경고 */}
          {hasActiveHostingRoom && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ 이미 진행 중인 방송이 있습니다
              </p>
              <p className="text-xs text-red-600 mt-1">
                방송을 종료한 후 새 방을 만들 수 있습니다.
              </p>
            </div>
          )}
          
          {/* 방송 타입 선택 */}
          <div>
            <Typography variant="subtitle2" className="mb-3">방송 유형</Typography>
            <div className="grid grid-cols-3 gap-3">
              {streamTypeOptions.map((option) => {
                // 현재 선택된 상태인지 확인
                const isSelected = formState.streamType === option.value && 
                  (option.value === 'audio' || isWebRTCMode === option.isWebRTC)
                
                return (
                  <button
                    key={`${option.value}-${option.isWebRTC ? 'webrtc' : 'obs'}`}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return
                      updateField('streamType', option.value)
                      setIsWebRTCMode(option.isWebRTC)
                    }}
                    className={`
                      relative p-3 rounded-xl border-2 transition-all text-left
                      ${option.disabled 
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed' 
                        : isSelected
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center mb-2
                      ${option.disabled 
                        ? 'bg-gray-200 text-gray-400'
                        : isSelected 
                          ? 'bg-purple-500 text-white' 
                          : 'bg-gray-100 text-gray-600'
                      }
                    `}>
                      {option.icon}
                    </div>
                    <p className="font-semibold text-[#110f1a] text-sm">{option.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{option.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {isPcLiveMode ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800 font-semibold">
                  💡 라이브(영상) 방송은 OBS 또는 PRISM에서 시작합니다
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  이 화면에서는 방송을 생성/시작하지 않아요. 아래 가이드를 따라 설정 후 방송 프로그램에서 "방송 시작"을 눌러주세요.
                </p>
              </div>

              {/* 상세 PC 방송 가이드 */}
              <PcStreamGuide 
                showStreamKeySection={true}
                defaultExpanded={true}
              />

              {/* 모바일 방송 가이드 */}
              <MobileStreamGuide 
                showStreamKeySection={true}
                defaultExpanded={false}
              />
            </div>
          ) : (
            <>
              {/* 모바일 라이브 안내 */}
              {isMobileLive && (
                <div className="p-4 rounded-xl bg-pink-50 border border-pink-200">
                  <p className="text-sm text-pink-800 font-semibold">
                    📱 모바일에서 바로 방송을 시작해요
                  </p>
                  <p className="text-xs text-pink-700 mt-1">
                    방 정보를 입력한 후 "방송 준비하기"를 누르면 카메라 화면으로 이동합니다.
                  </p>
                </div>
              )}

              {/* 방송 제목 */}
              <div>
                <Typography variant="subtitle2" className="mb-2">
                  방송 제목 <span className="text-red-500">*</span>
                </Typography>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="어떤 방송인지 알려주세요"
                  maxLength={50}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{formState.title.length}/50</p>
              </div>

              {/* 방송 설명 */}
              <div>
                <Typography variant="subtitle2" className="mb-2">설명 (선택)</Typography>
                <textarea
                  value={formState.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="방송에 대해 더 자세히 설명해주세요"
                  maxLength={200}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{formState.description.length}/200</p>
              </div>

              {/* 썸네일 이미지 (파트너 필수) */}
              <div>
                <Typography variant="subtitle2" className="mb-2">
                  썸네일 이미지 <span className="text-red-500">*</span>
                </Typography>
                <StreamThumbnailUpload
                  currentThumbnailUrl={formState.thumbnailUrl || undefined}
                  onThumbnailUploaded={(url) => updateField('thumbnailUrl', url)}
                  onThumbnailDeleted={() => updateField('thumbnailUrl', null)}
                  required={true}
                />
              </div>

              {/* 카테고리 선택 */}
              <div>
                <Typography variant="subtitle2" className="mb-2">카테고리</Typography>
                <button
                  type="button"
                  onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between hover:border-gray-300 transition-colors"
                >
                  <span className={selectedCategory ? 'text-[#110f1a]' : 'text-gray-400'}>
                    {selectedCategory?.name || '카테고리 선택'}
                  </span>
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showCategoryPicker ? 'rotate-90' : ''}`} />
                </button>
                
                {showCategoryPicker && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          updateField('categoryId', category.id)
                          setShowCategoryPicker(false)
                        }}
                        className={`
                          px-3 py-2 rounded-lg text-sm font-medium transition-colors
                          ${formState.categoryId === category.id
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }
                        `}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 최대 참여 인원 (라이브룸은 1명 고정이므로 숨김) */}
              {formState.streamType === 'audio' && (
                <div>
                  <Typography variant="subtitle2" className="mb-2">
                    최대 발언자 수: <span className="text-purple-500 font-bold">{formState.maxParticipants}명</span>
                  </Typography>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={formState.maxParticipants}
                    onChange={(e) => updateField('maxParticipants', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1명</span>
                    <span>10명</span>
                  </div>
                </div>
              )}

              {/* 공개 설정 */}
              <div>
                <Typography variant="subtitle2" className="mb-3">공개 설정</Typography>
                <div className="space-y-2">
                  {accessTypeOptions.map((option) => {
                    const isDisabled = option.partnerOnly && !isPartner
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && updateField('accessType', option.value)}
                        className={`
                          w-full p-3 rounded-xl border-2 flex items-center gap-3 transition-all
                          ${isDisabled
                            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                            : formState.accessType === option.value
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }
                        `}
                      >
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center
                          ${isDisabled
                            ? 'bg-gray-200 text-gray-400'
                            : formState.accessType === option.value 
                              ? 'bg-purple-500 text-white' 
                              : 'bg-gray-100 text-gray-600'
                          }
                        `}>
                          {option.icon}
                        </div>
                        <div className="text-left flex-1">
                          <p className="font-medium text-[#110f1a]">{option.label}</p>
                          <p className="text-xs text-gray-500">{option.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 비밀번호 입력 (비공개 선택 시) */}
              {formState.accessType === 'private' && (
                <div>
                  <Typography variant="subtitle2" className="mb-2">
                    비밀번호 <span className="text-red-500">*</span>
                  </Typography>
                  <input
                    type="password"
                    value={formState.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder="4자리 이상 입력해주세요"
                    maxLength={20}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
                  />
                </div>
              )}
            </>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      )}
    </SlideSheet>
  )
}

export default CreateStreamSheet

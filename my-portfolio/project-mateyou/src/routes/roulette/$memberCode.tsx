/**
 * 파트너 룰렛 모음 페이지
 * 
 * Phase 5-C: 비방송용 룰렛
 * - /roulette/:memberCode 형식으로 접근
 * - 방송용 룰렛과 동일한 RouletteWheel 컴포넌트 사용
 * - 전체화면 오버레이 룰렛 애니메이션
 * - 수량 제한 및 소진 표시
 */

import { Button, Modal } from '@/components'
import { RouletteWheel } from '@/components/features/stream/roulette/RouletteWheel'
import { RemainingFilesInfo } from '@/components/features/stream/roulette/components'
import type { RouletteItem } from '@/components/features/stream/roulette/types'
import { useAuth } from '@/hooks/useAuth'
import { useWheelDigitalProgress } from '@/hooks/useDigitalItemProgress'
import { useExecuteProfileRoulette, usePartnerProfileWheels, type ProfileRouletteResult, type ProfileRouletteWheel } from '@/hooks/useProfileRoulette'
import { useCanSpinWheel, useUserWheelItemsStatus } from '@/hooks/useRouletteStock'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, Coins, Gift, Loader2, Lock, Sparkles, Star, X } from 'lucide-react'
import { useCallback, useState } from 'react'

/**
 * 룰렛 에러 코드를 한글 메시지로 변환
 */
function getRouletteErrorMessage(errorCode: string | undefined): string {
  if (!errorCode) return '룰렛 실행에 실패했습니다.'
  
  const errorMessages: Record<string, string> = {
    'INVALID_PROFILE_WHEEL': '유효하지 않은 룰렛입니다.',
    'AMOUNT_TOO_LOW': '금액이 부족합니다.',
    'INSUFFICIENT_POINTS': '포인트가 부족합니다.',
    'ALL_EXHAUSTED': '모든 상품이 소진되었습니다.',
    'NO_ROULETTE_ITEMS': '룰렛에 상품이 없습니다.',
    'NO_AVAILABLE_ITEMS': '받을 수 있는 상품이 없습니다.',
    'ROULETTE_CALCULATION_FAILED': '룰렛 계산에 실패했습니다.',
    'EXECUTION_FAILED': '룰렛 실행 중 오류가 발생했습니다.',
  }
  
  return errorMessages[errorCode] || errorCode
}

export const Route = createFileRoute('/roulette/$memberCode')({
  component: PartnerRoulettePage,
})

function PartnerRoulettePage() {
  const { memberCode } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // memberCode로 파트너 정보 조회
  const { data: partnerData, isLoading: isLoadingPartner } = useQuery({
    queryKey: ['partner-by-member-code', memberCode],
    queryFn: async () => {
      // members 테이블에서 member_code로 조회
      const { data: memberData } = await supabase
        .from('members')
        .select('id')
        .eq('member_code', memberCode)
        .single()
      
      if (memberData) {
        const { data: partnerByMember } = await supabase
          .from('partners')
          .select('id, member_id, partner_name')
          .eq('member_id', memberData.id)
          .single()
        
        if (partnerByMember) {
          return partnerByMember
        }
      }
      throw new Error('파트너를 찾을 수 없습니다.')
    },
    enabled: !!memberCode,
  })

  const partnerId = partnerData?.id

  // 프로필 룰렛 목록 조회
  const { data: wheels = [], isLoading: isLoadingWheels } = usePartnerProfileWheels(partnerId ?? null)
  
  // 선택된 휠
  const [selectedWheel, setSelectedWheel] = useState<ProfileRouletteWheel | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<ProfileRouletteResult | null>(null)
  const [isSpinComplete, setIsSpinComplete] = useState(false)
  
  // 룰렛 실행
  const executeRoulette = useExecuteProfileRoulette()
  const queryClient = useQueryClient()
  
  // 전체화면 오버레이 상태
  const [showOverlay, setShowOverlay] = useState(false)
  
  // 선택된 휠의 스핀 가능 여부 확인
  const { data: selectedWheelSpinStatus, refetch: refetchSpinStatus } = useCanSpinWheel(
    selectedWheel?.wheel_id ?? null, 
    user?.id ?? null
  )
  const canSpinSelectedWheel = selectedWheelSpinStatus?.can_spin ?? true
  const isSelectedWheelExhausted = selectedWheelSpinStatus?.reason === 'ALL_EXHAUSTED'

  // 선택된 휠의 디지털 상품 진행률
  const { items: digitalItems, progress: digitalProgress } = useWheelDigitalProgress({
    userId: user?.id,
    wheelId: selectedWheel?.wheel_id,
    enabled: !!selectedWheel && !!user?.id,
  })

  // 선택된 휠의 아이템별 수량 상태
  const { data: itemsStatus = [] } = useUserWheelItemsStatus(
    selectedWheel?.wheel_id ?? null,
    user?.id ?? null
  )
  
  // 휠 선택 핸들러
  const handleSelectWheel = (wheel: ProfileRouletteWheel) => {
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    setSelectedWheel(wheel)
    setShowConfirmModal(true)
  }
  
  // 룰렛 스핀 완료 콜백
  const handleSpinComplete = useCallback(() => {
    setIsSpinComplete(true)
    // 스핀 완료 후 수량 상태 갱신
    if (selectedWheel) {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'canSpin', selectedWheel.wheel_id] 
      })
    }
  }, [queryClient, selectedWheel])

  // 룰렛 실행 핸들러
  const handleSpin = async () => {
    if (!selectedWheel || !user || !partnerId) return
    
    setShowConfirmModal(false)
    setIsSpinning(true)
    setIsSpinComplete(false)
    setSpinResult(null)
    setShowOverlay(true) // 전체화면 오버레이 표시
    
    try {
      const result = await executeRoulette.mutateAsync({
        donorId: user.id,
        partnerId,
        wheelId: selectedWheel.wheel_id,
        amount: selectedWheel.wheel_price,
      })
      
      // 결과 설정 - RouletteWheel 컴포넌트가 애니메이션 실행
      setSpinResult(result)
      
      // 실패 시 스핀 상태 해제 (에러 화면에서 닫기 가능하도록)
      if (!result.success) {
        setIsSpinning(false)
      }
    } catch (error) {
      console.error('룰렛 실행 실패:', error)
      setSpinResult({ success: false, error: 'EXECUTION_FAILED' })
      setIsSpinning(false)
    }
  }
  
  // 오버레이 닫기
  const handleCloseOverlay = () => {
    if (!isSpinning || isSpinComplete) {
      setShowOverlay(false)
      setSpinResult(null)
      setIsSpinning(false)
      setIsSpinComplete(false)
      setSelectedWheel(null)
    }
  }

  // 룰렛 아이템 변환 (ProfileRouletteItem -> RouletteItem)
  const getRouletteItems = useCallback((): RouletteItem[] => {
    if (!spinResult?.all_items) return []
    
    return spinResult.all_items.map((item, index) => ({
      id: item.id,
      wheel_id: selectedWheel?.wheel_id || '',
      name: item.name,
      color: item.color,
      weight: 1,
      reward_type: item.reward_type as 'text' | 'usable' | 'digital',
      sort_order: index,
      is_active: true,
      is_blank: item.is_blank,
    }))
  }, [spinResult?.all_items, selectedWheel?.wheel_id])

  // 당첨 아이템 ID 찾기 (item_id 우선, 없으면 이름으로 매칭)
  const getWinningItemId = useCallback((): string | undefined => {
    // DB에서 직접 반환받은 item_id 사용 (있는 경우)
    if (spinResult?.item_id) return spinResult.item_id
    
    // 없으면 이름으로 매칭 (fallback)
    if (!spinResult?.all_items || !spinResult?.item_name) return undefined
    const winningItem = spinResult.all_items.find(item => item.name === spinResult.item_name)
    return winningItem?.id
  }, [spinResult?.item_id, spinResult?.all_items, spinResult?.item_name])
  
  const isLoading = isLoadingPartner || isLoadingWheels
  const partnerName = partnerData?.partner_name || memberCode

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#1a1a3a] to-[#0a0a1a] relative overflow-hidden">
      {/* 배경 별/파티클 효과 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.2,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[#0a0a1a] to-transparent px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate({ to: '/partners/$memberCode', params: { memberCode } })}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">돌아가기</span>
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="text-white font-medium">{partnerName}의 룰렛</span>
          </div>
          <div className="w-20" />
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="px-4 pb-20">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="mt-4 text-white/60">룰렛을 불러오는 중...</p>
          </div>
        ) : wheels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Gift className="w-10 h-10 text-white/30" />
            </div>
            <p className="text-white/60 text-center">
              아직 등록된 룰렛이 없습니다
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-4">
            {/* 소진되지 않은 휠 먼저, 소진된 휠은 아래로 */}
            {[...wheels]
              .sort((a, b) => {
                // is_featured가 true인 것을 최상단으로
                if (a.is_featured && !b.is_featured) return -1
                if (!a.is_featured && b.is_featured) return 1
                return 0
              })
              .map((wheel) => (
                <WheelCard
                  key={wheel.wheel_id}
                  wheel={wheel}
                  userId={user?.id}
                  onClick={() => handleSelectWheel(wheel)}
                />
              ))}
          </div>
        )}
      </main>

      {/* 구매 확인 모달 */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="룰렛 돌리기"
      >
        {selectedWheel && (
          <div className="space-y-4">
            <div className="text-center">
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 ${
                isSelectedWheelExhausted 
                  ? 'bg-gray-400' 
                  : 'bg-gradient-to-br from-purple-500 to-pink-500'
              }`}>
                {isSelectedWheelExhausted ? (
                  <Lock className="w-8 h-8 text-white" />
                ) : (
                  <Gift className="w-8 h-8 text-white" />
                )}
              </div>
              <h3 className="text-lg font-bold">{selectedWheel.wheel_name}</h3>
              <p className="text-2xl font-bold text-pink-500 mt-2">
                {selectedWheel.wheel_price.toLocaleString()}P
              </p>
            </div>
            
            {isSelectedWheelExhausted ? (
              <div className="bg-red-50 rounded-xl p-4">
                <div className="flex items-center justify-center gap-2 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm font-medium">
                    모든 상품이 소진되어 더 이상 돌릴 수 없습니다.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 가격 안내 */}
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <p className="text-sm text-purple-700 text-center font-medium">
                    {selectedWheel.wheel_price.toLocaleString()}P가 차감됩니다
                  </p>
                </div>

                {/* 남은 상품 현황 */}
                {selectedWheelSpinStatus && !selectedWheelSpinStatus.has_unlimited && selectedWheelSpinStatus.total_items > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">뽑을 수 있는 상품</span>
                      <span className={`text-sm font-bold ${
                        selectedWheelSpinStatus.available_items > 3 ? 'text-green-600' : 
                        selectedWheelSpinStatus.available_items > 0 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {selectedWheelSpinStatus.available_items}개 남음
                      </span>
                    </div>
                    {/* 진행 바 */}
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          selectedWheelSpinStatus.available_items > 3 ? 'bg-green-500' : 
                          selectedWheelSpinStatus.available_items > 0 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${(selectedWheelSpinStatus.available_items / selectedWheelSpinStatus.total_items) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      전체 {selectedWheelSpinStatus.total_items}개 중 {selectedWheelSpinStatus.total_items - selectedWheelSpinStatus.available_items}개 소진
                    </p>
                  </div>
                )}

                {/* 상품 목록 상세 */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">상품별 현황</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {itemsStatus.length > 0 ? (
                      // 서버에서 수량 정보를 받아온 경우
                      itemsStatus
                        .filter(item => !item.is_blank)
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              item.is_exhausted 
                                ? 'bg-gray-100 border-gray-200 opacity-60' 
                                : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-3 h-3 rounded-full shrink-0" 
                                style={{ backgroundColor: item.color }}
                              />
                              <span className={`text-sm font-medium ${item.is_exhausted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                {item.name}
                              </span>
                            </div>
                            <div className="text-right">
                              {item.is_exhausted ? (
                                <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded">
                                  품절
                                </span>
                              ) : item.type === 'unlimited' ? (
                                <span className="text-xs text-gray-500">무제한</span>
                              ) : item.remaining !== null && item.total !== null ? (
                                <span className={`text-xs font-medium ${
                                  item.remaining > 3 ? 'text-green-600' : 
                                  item.remaining > 0 ? 'text-amber-600' : 'text-red-500'
                                }`}>
                                  {item.remaining}/{item.total}개
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      // 수량 정보가 없는 경우 기본 표시
                      selectedWheel.items
                        .filter(item => !item.is_blank)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-white border-gray-200"
                          >
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-3 h-3 rounded-full shrink-0" 
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-sm font-medium text-gray-800">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">-</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* 디지털 상품 진행률 표시 */}
                {Array.from(digitalProgress.entries()).map(([itemId, progress]) => (
                  <RemainingFilesInfo 
                    key={itemId} 
                    progress={progress} 
                  />
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmModal(false)}
              >
                {isSelectedWheelExhausted ? '닫기' : '취소'}
              </Button>
              {!isSelectedWheelExhausted && (
                <Button
                  variant="primary"
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                  onClick={handleSpin}
                  disabled={!canSpinSelectedWheel}
                >
                  돌리기
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 전체화면 룰렛 오버레이 */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gradient-to-b from-[#0a0a1a] via-[#1a1a3a] to-[#0a0a1a] flex flex-col"
          >
            {/* 배경 파티클 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(80)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-white rounded-full"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                  }}
                  animate={{
                    opacity: [0.1, 0.6, 0.1],
                    scale: [1, 2, 1],
                  }}
                  transition={{
                    duration: Math.random() * 2 + 1,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                />
              ))}
            </div>

            {/* 닫기 버튼 (스핀 완료 후에만 표시) */}
            {(!isSpinning || isSpinComplete) && (
              <button
                onClick={handleCloseOverlay}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            )}

            {/* 휠 이름 */}
            <div className="text-center pt-12 pb-4">
              <h2 className="text-white text-xl font-bold">
                {selectedWheel?.wheel_name}
              </h2>
              <p className="text-purple-300 text-sm mt-1">
                {selectedWheel?.wheel_price.toLocaleString()}P
              </p>
            </div>

            {/* 룰렛 메인 영역 */}
            <div className="flex-1 flex items-center justify-center px-4">
              {/* 에러 발생 시 */}
              {spinResult && !spinResult.success ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="w-12 h-12 text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">실패</h3>
                  <p className="mt-2 text-white/60 text-center max-w-xs">
                    {getRouletteErrorMessage(spinResult.error)}
                  </p>
                  <Button
                    variant="primary"
                    className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500"
                    onClick={handleCloseOverlay}
                  >
                    확인
                  </Button>
                </motion.div>
              ) : spinResult?.all_items && spinResult.all_items.length > 0 ? (
                /* 룰렛 휠 또는 결과 */
                <div className="flex flex-col items-center">
                  {/* 룰렛 휠 - 스핀 완료 후에는 숨김 */}
                  {!isSpinComplete && (
                    <RouletteWheel
                      items={getRouletteItems()}
                      finalRotation={spinResult.final_rotation || 1440}
                      winningItemId={getWinningItemId()}
                      isSpinning={isSpinning && !!spinResult}
                      size={320}
                      onSpinComplete={handleSpinComplete}
                    />
                  )}

                  {/* 당첨 결과 표시 (애니메이션 완료 후 - 룰렛 숨기고 결과만) */}
                  {isSpinComplete && spinResult?.success && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', damping: 15 }}
                      className="text-center"
                    >
                      {/* 디지털 당첨 시 이미지 미리보기 (더 크게!) */}
                      {spinResult.reward_type === 'digital' && spinResult.digital_preview?.file_url && (
                        <motion.div
                          initial={{ scale: 0, rotate: -10 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                          className="relative mb-8"
                        >
                          <div className="relative w-64 h-64 mx-auto overflow-hidden rounded-3xl border-4 border-purple-400 shadow-2xl shadow-purple-500/40">
                            {spinResult.digital_preview.file_type?.startsWith('video') ? (
                              <video
                                src={spinResult.digital_preview.file_url}
                                className="w-full h-full object-cover"
                                autoPlay
                                muted
                                loop
                                playsInline
                              />
                            ) : (
                              <img
                                src={spinResult.digital_preview.file_url}
                                alt={spinResult.item_name}
                                className="w-full h-full object-cover"
                              />
                            )}
                            {/* 그라데이션 오버레이 */}
                            <div className="absolute inset-0 bg-gradient-to-t from-purple-900/30 to-transparent" />
                          </div>
                          {/* 반짝이 효과 */}
                          <motion.div
                            className="absolute -top-3 -right-3 text-4xl"
                            animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                          >
                            ✨
                          </motion.div>
                          <motion.div
                            className="absolute -bottom-2 -left-2 text-3xl"
                            animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.2, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1, delay: 0.3 }}
                          >
                            💜
                          </motion.div>
                        </motion.div>
                      )}

                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: spinResult.reward_type === 'digital' ? 0.5 : 0.2 }}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full mb-3"
                        style={{ backgroundColor: spinResult.reward_type === 'digital' ? '#9333ea' : (spinResult.item_color || '#9333ea') }}
                      >
                        {spinResult.reward_type === 'digital' ? (
                          <span className="text-xl">📷</span>
                        ) : (
                          <Star className="w-6 h-6 text-white" />
                        )}
                        <span className="text-white font-bold text-lg">{spinResult.item_name}</span>
                      </motion.div>
                      {spinResult.is_blank ? (
                        <p className="text-white/60 text-lg">다음 기회에!</p>
                      ) : spinResult.reward_type === 'digital' ? (
                        <p className="text-purple-300 font-medium text-lg">내 컬렉션에 저장되었어요! 💜</p>
                      ) : (
                        <p className="text-pink-400 font-medium text-lg">축하합니다! 🎉</p>
                      )}
                      <div className="flex gap-3 mt-6">
                        <Button
                          variant="outline"
                          className="border-white/30 text-white hover:bg-white/10"
                          onClick={handleCloseOverlay}
                        >
                          닫기
                        </Button>
                        {canSpinSelectedWheel && !isSelectedWheelExhausted ? (
                          <Button
                            variant="primary"
                            className="bg-gradient-to-r from-purple-500 to-pink-500"
                            onClick={async () => {
                              // 스핀 전 상태 갱신
                              await refetchSpinStatus()
                              setSpinResult(null)
                              setIsSpinning(false)
                              setIsSpinComplete(false)
                              handleSpin()
                            }}
                          >
                            한 번 더!
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2 px-4 py-2 bg-gray-600/50 rounded-lg">
                            <Lock className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-400 text-sm">소진됨</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : (
                /* 로딩 중 (아직 결과 없음) */
                <div className="flex flex-col items-center">
                  <motion.div
                    className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-16 h-16 text-white" />
                  </motion.div>
                  <p className="mt-8 text-white/80 font-medium text-lg">룰렛 준비 중...</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 휠 카드 컴포넌트
function WheelCard({ 
  wheel, 
  userId,
  onClick 
}: { 
  wheel: ProfileRouletteWheel
  userId?: string
  onClick: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // 스핀 가능 여부 확인
  const { data: spinStatus, isLoading: isLoadingStatus } = useCanSpinWheel(
    wheel.wheel_id, 
    userId ?? null
  )

  const canSpin = spinStatus?.can_spin ?? true
  const availableItems = spinStatus?.available_items ?? 0
  const totalItems = spinStatus?.total_items ?? wheel.item_count
  const isExhausted = spinStatus?.reason === 'ALL_EXHAUSTED'

  const handleCardClick = () => {
    if (canSpin) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleSpin = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick()
  }

  return (
    <motion.div
      layout
      onClick={handleCardClick}
      style={{ order: isExhausted ? 100 : 0 }}
      className={`relative rounded-2xl p-6 border text-left overflow-hidden shadow-sm ${
        canSpin 
          ? 'bg-white border-gray-200 cursor-pointer' 
          : 'bg-gray-100 border-gray-200'
      }`}
    >
      {/* 소진됨 오버레이 */}
      {isExhausted && (
        <div className="absolute inset-0 bg-gray-50/90 flex items-center justify-center rounded-2xl z-10">
          <div className="flex items-center gap-2 bg-red-100 border border-red-200 px-4 py-2 rounded-full">
            <Lock className="w-4 h-4 text-red-400" />
            <span className="text-red-500 font-medium text-sm">모두 소진됨</span>
          </div>
        </div>
      )}

      {/* 제목 영역 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className={`font-bold text-xl ${canSpin ? 'text-gray-900' : 'text-gray-400'}`}>
            {wheel.wheel_name}
          </h3>
          {wheel.is_featured && (
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 text-xs font-bold px-3 py-1 rounded-full text-white">
              대표
            </span>
          )}
        </div>
        {/* 펼침 아이콘 */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          className="text-gray-400"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </div>

      {/* 설명 */}
      {wheel.wheel_description && (
        <p className="text-gray-500 text-base mt-2">{wheel.wheel_description}</p>
      )}

      {/* 상품 개수 + 남은 수량 */}
      <div className="flex items-center gap-4 mt-3">
        <p className="text-gray-500 text-base">
          상품 {wheel.item_count}개
        </p>
        {!isLoadingStatus && !spinStatus?.has_unlimited && totalItems > 0 && (
          <p className={`text-base font-medium ${
            availableItems > 3 ? 'text-green-600' : 
            availableItems > 0 ? 'text-amber-600' : 'text-red-500'
          }`}>
            남은 {availableItems}/{totalItems}
          </p>
        )}
      </div>

      {/* 상품 목록 (항상 표시) */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {wheel.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ 
              backgroundColor: `${item.color}15`,
              color: item.color,
              border: `1px solid ${item.color}40`
            }}
          >
            <span 
              className="w-2.5 h-2.5 rounded-full shrink-0" 
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate max-w-[120px]">{item.name}</span>
          </div>
        ))}
      </div>

      {/* 뽑기 버튼 (펼쳤을 때만) */}
      <AnimatePresence>
        {isExpanded && canSpin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <Coins className="w-7 h-7 text-amber-500" />
                <span className="font-bold text-2xl text-amber-500">
                  {wheel.wheel_price.toLocaleString()}P
                </span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSpin}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg px-8 py-4 rounded-2xl shadow-lg shadow-purple-500/30"
              >
                <Gift className="w-6 h-6" />
                뽑기
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

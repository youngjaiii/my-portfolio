import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, ChargeModal, Typography } from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { useUser } from '@/hooks/useUser'
import { useMemberPoints } from '@/hooks/useMemberPoints'

export function PointsCard() {
  const { user } = useAuth()
  const { user: reactQueryUser, isLoading: userLoading } = useUser()
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const navigate = useNavigate()

  // 모든 사용자 공통 포인트 데이터 (React Query로 관리)
  const {
    totalPoints: memberTotalPoints,
    isLoading: memberPointsLoading,
    addPointsLog,
  } = useMemberPoints(user?.id || '')

  // 로딩 상태 - members 테이블만 사용하므로 partnerLoading 제거
  const isLoading = memberPointsLoading || userLoading

  // 표시할 포인트 계산 - DevMode에서는 user.total_points 우선 사용
  const displayPoints =
    user?.total_points ?? reactQueryUser?.total_points ?? memberTotalPoints ?? 0

  const handleCharge = async (points: number, amount: number) => {
    try {
      // 모든 사용자(일반/파트너/관리자) members.total_points에 충전
      await addPointsLog(
        'earn',
        points,
        `포인트 충전 - ${amount.toLocaleString()}원`,
      )

      setIsChargeModalOpen(false)
    } catch (error) {
      throw error
    }
  }

  // 로그인되지 않은 사용자 처리
  if (!user) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <Typography variant="h5" className="mb-4">
          포인트 시스템
        </Typography>
        <div className="text-center">
          <Typography variant="body1" color="text-secondary" className="mb-4">
            로그인하여 포인트를 확인하고 충전하세요
          </Typography>
          <Button className="w-full" onClick={() => navigate({ to: '/login' })}>
            로그인
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <Typography variant="h5" className="mb-4">
          내 포인트
        </Typography>
        <div className="text-center">
          <Typography variant="body1" color="text-secondary">
            로딩 중...
          </Typography>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <Typography variant="h5" className="mb-4">
        내 포인트
      </Typography>
      <div className="text-center">
        <Typography variant="h1" color="primary" className="mb-2">
          {(displayPoints || 0).toLocaleString()}P
        </Typography>
        <Typography variant="caption" color="text-disabled">
          보유 포인트
        </Typography>

        <Button
          className="mt-4 w-full"
          onClick={() => {
            setIsChargeModalOpen(true)
          }}
        >
          포인트 충전
        </Button>
      </div>

      {/* Charge Modal - 모든 사용자 공통 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleCharge}
      />
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useMemberPoints } from '@/hooks/useMemberPoints'
import {
  Button,
  ChargeModal,
  Flex,
  Footer,
  Grid,
  Navigation,
  PointsHistoryModal,
  Typography,
} from '@/components'

export const Route = createFileRoute('/points')({
  component: PointsPage,
})

function PointsPage() {
  const { user } = useAuth()
  const { addPointsLog, refetch } = useMemberPoints(user?.id || '')
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [preselectedAmount, setPreselectedAmount] = useState<number | null>(
    null,
  )

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto p-6">
          <Typography variant="h3">로그인이 필요합니다</Typography>
        </div>
      </div>
    )
  }

  const handleCharge = async (points: number, amount: number) => {
    try {
      // 토스페이먼츠 결제가 성공하면 서버에 포인트 충전 요청
      // 실제로는 결제 성공 페이지에서 처리되어야 함
      setIsChargeModalOpen(false)
    } catch (error) {
      console.error('포인트 충전 실패:', error)
    }
  }

  const handleQuickCharge = (points: number) => {
    setPreselectedAmount(points)
    setIsChargeModalOpen(true)
  }

  const handleTestSpend = async () => {
    if (!user) return

    try {
      // 랜덤한 포인트 사용 (50-200P)
      const spendAmount = Math.floor(Math.random() * 151) + 50
      const testServices = [
        '프리미엄 아이템 구매',
        '이벤트 참여 티켓',
        '선물하기 이용권',
        '특별 이모티콘 팩',
        '게임 부스터 아이템',
        '프로필 꾸미기 아이템',
        '채팅 테마 구매',
        '랭킹 부스트'
      ]
      const randomService = testServices[Math.floor(Math.random() * testServices.length)]

      await addPointsLog(
        'spend',
        spendAmount,
        `${randomService} (${spendAmount}P 사용)`
      )

      refetch()
      alert(`${spendAmount}P를 사용하여 "${randomService}"를 구매했습니다!`)
    } catch (error) {
      console.error('테스트 포인트 사용 실패:', error)
      alert('포인트 사용에 실패했습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="container mx-auto p-6 pb-12">
        {' '}
        {/* 하단 탭바 공간 확보 */}
        {/* 헤더 */}
        <div className="mb-8">
          <Typography variant="h2" className="mb-2">
            포인트
          </Typography>
          <Typography variant="body1" color="text-secondary">
            포인트를 관리하고 충전하세요
          </Typography>
        </div>
        <Grid cols={1} mdCols={2} gap={6}>
          {/* 포인트 현황 카드 */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white">
            <Typography variant="h6" className="text-blue-100 mb-2">
              보유 포인트
            </Typography>
            <Typography variant="h1" className="font-bold mb-4">
              {(user.total_points || 0).toLocaleString('ko-kr')} P
            </Typography>
            <Flex gap={3}>
              <Button
                variant="outline"
                onClick={() => setIsChargeModalOpen(true)}
                className="flex-1 bg-white/20 border-white/30 text-white hover:bg-white/30"
              >
                충전하기
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex-1 bg-white/20 border-white/30 text-white hover:bg-white/30"
              >
                사용내역
              </Button>
            </Flex>
          </div>

          {/* 빠른 충전 옵션 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <Typography variant="h5" className="mb-4">
              빠른 충전
            </Typography>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => handleQuickCharge(1000)}
                className="p-4 h-auto flex flex-col"
              >
                <Typography variant="h6" className="font-bold">
                  1,000P
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  ₩1,000
                </Typography>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleQuickCharge(5000)}
                className="p-4 h-auto flex flex-col"
              >
                <Typography variant="h6" className="font-bold">
                  5,000P
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  ₩5,000
                </Typography>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleQuickCharge(10000)}
                className="p-4 h-auto flex flex-col"
              >
                <Typography variant="h6" className="font-bold">
                  10,000P
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  ₩10,000
                </Typography>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleQuickCharge(50000)}
                className="p-4 h-auto flex flex-col"
              >
                <Typography variant="h6" className="font-bold">
                  50,000P
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  ₩50,000
                </Typography>
              </Button>
            </div>
          </div>

          {/* 포인트 사용처 */}
          <div className="bg-white rounded-lg shadow-md p-6 md:col-span-2">
            <Flex justify="between" align="center" className="mb-4">
              <Typography variant="h5">
                포인트 사용처
              </Typography>
            </Flex>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <Typography variant="body2" className="font-semibold mb-2">
                  파트너 의뢰
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  게임 파트너에게 서비스 의뢰 시
                </Typography>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-100">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <Typography variant="body2" className="font-semibold mb-2">
                  선물하기
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  다른 사용자에게 포인트 선물
                </Typography>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-100">
                <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <Typography variant="body2" className="font-semibold mb-2">
                  프리미엄 기능
                </Typography>
                <Typography variant="caption" color="text-secondary">
                  특별 아이템 및 부가 서비스
                </Typography>
              </div>
            </div>
          </div>
        </Grid>
      </div>

      <Footer />

      {/* 모달들 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => {
          setIsChargeModalOpen(false)
          setPreselectedAmount(null)
        }}
        onCharge={handleCharge}
        preselectedPoints={preselectedAmount}
      />

      <PointsHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />
    </div>
  )
}

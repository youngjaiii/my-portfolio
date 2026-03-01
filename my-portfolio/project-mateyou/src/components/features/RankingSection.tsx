import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Avatar } from '@/components/ui/Avatar'
import { mateYouApi } from '@/lib/apiClient'

interface RankingData {
  id: string
  name: string
  profileImage?: string | null
  count: number
  memberCode?: string
}

interface RankingSectionProps {
  className?: string
}

export function RankingSection({ className = '' }: RankingSectionProps) {
  const navigate = useNavigate()
  const [popularPartners, setPopularPartners] = useState<RankingData[]>([])
  const [hotPartners, setHotPartners] = useState<RankingData[]>([])
  const [activeMembers, setActiveMembers] = useState<RankingData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchRankings()
  }, [])

  const fetchRankings = async () => {
    try {
      setIsLoading(true)

      const response = await mateYouApi.rankings.getRankings()

      // API 응답 형식 처리 (두 가지 형식 모두 지원)
      // 1. 표준 ApiResponse 형식: { success: true, data: { ... } }
      // 2. 직접 데이터 형식: { popularPartners: [...], ... }
      let rankingData: {
        popularPartners?: RankingData[]
        hotPartners?: RankingData[]
        activeMembers?: RankingData[]
      }

      if (response.data && typeof response.data === 'object') {
        // success 필드가 있으면 표준 ApiResponse 형식
        if ('success' in response.data && response.data.success && 'data' in response.data) {
          rankingData = response.data.data as typeof rankingData
        } 
        // popularPartners 필드가 직접 있으면 직접 데이터 형식
        else if ('popularPartners' in response.data || 'hotPartners' in response.data || 'activeMembers' in response.data) {
          rankingData = response.data as typeof rankingData
        } 
        else {
          console.error('랭킹 API 응답 형식 오류:', response.data)
          throw new Error('Invalid API response format')
        }
      } else {
        console.error('랭킹 API 응답 오류:', response.data)
        throw new Error('Failed to fetch rankings')
      }

      setPopularPartners(rankingData.popularPartners || [])
      setHotPartners(rankingData.hotPartners || [])
      setActiveMembers(rankingData.activeMembers || [])
    } catch (error: any) {
      console.error('랭킹 데이터 로드 실패:', error)
      // 응답 데이터가 있으면 로깅
      if (error?.response?.data) {
        console.error('응답 데이터:', error.response.data)
      } else if (error?.data) {
        console.error('에러 데이터:', error.data)
      }
      // 에러 시 빈 배열로 설정
      setPopularPartners([])
      setHotPartners([])
      setActiveMembers([])
    } finally {
      setIsLoading(false)
    }
  }

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return '🥇'
      case 1: return '🥈'
      case 2: return '🥉'
      default: return `${index + 1}위`
    }
  }

  const handlePartnerClick = (memberCode?: string) => {
    if (memberCode) {
      navigate({ to: `/partners/${memberCode}` })
    }
  }

  const RankingCard = ({ title, data, showCount = true }: {
    title: string
    data: RankingData[]
    showCount?: boolean
  }) => {
    const isPartnerRanking = title.includes('파트너')

    return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">{title}</h3>
      <div className="space-y-3">
        {data.length > 0 ? data.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg transition-colors ${
              isPartnerRanking ? 'hover:bg-gray-100 cursor-pointer' : ''
            }`}
            onClick={() => isPartnerRanking && handlePartnerClick(item.memberCode)}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold w-8">{getRankIcon(index)}</span>
              <Avatar
                src={item.profileImage || undefined}
                alt={item.name}
                size="sm"
              />
              <div>
                <p className="font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">@{item.memberCode}</p>
              </div>
            </div>
          </div>
        )) : (
          <p className="text-center text-gray-500 py-4">아직 데이터가 없습니다</p>
        )}
      </div>
    </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`py-12 bg-gray-50 ${className}`}>
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-4"></div>
                <div className="space-y-3">
                  {[1, 2, 3].map(j => (
                    <div key={j} className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
                      <div className="w-8 h-6 bg-gray-200 rounded"></div>
                      <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded mb-1"></div>
                        <div className="h-3 bg-gray-200 rounded w-20"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`py-12 bg-gray-50 ${className}`}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">🏆 랭킹</h2>
          <p className="text-gray-600">지난 30일간 뛰어난 파트너들과 활발한 회원들을 만나보세요</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <RankingCard
            title="🔥 인기 있는 파트너"
            data={popularPartners}
            showCount={true}
          />
          <RankingCard
            title="💎 핫한 파트너"
            data={hotPartners}
            showCount={false}
          />
          <RankingCard
            title="⚡ 활동이 활발한 회원"
            data={activeMembers}
            showCount={true}
          />
        </div>
      </div>
    </div>
  )
}
import { useState, useEffect } from 'react'
import { Trophy, Crown, Medal, Star } from 'lucide-react'
import { edgeApi } from '@/lib/edgeApi'
import { Typography } from '@/components'

interface ClientRanking {
  rank: number
  client_id: string
  client_name: string
  client_profile_image?: string
  client_member_code?: string
  total_coins: number
  request_count: number
}

interface MonthlyClientRankingProps {
  memberId?: string  // 파트너의 members.id (특정 파트너의 의뢰자 랭킹을 조회하기 위해)
}

export default function MonthlyClientRanking({ memberId }: MonthlyClientRankingProps) {
  const [rankings, setRankings] = useState<ClientRanking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        // memberId가 있으면 특정 파트너의 의뢰자 랭킹, 없으면 전체 랭킹
        const response = await edgeApi.partnerDashboard.getMonthlyClientRanking(memberId)
        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to fetch rankings')
        }
        setRankings((response.data as any)?.ranking || [])
      } catch (error) {
        console.error('Error fetching client rankings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRankings()
  }, [memberId])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Trophy className="w-5 h-5 text-gray-400" />
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />
      default:
        return <Star className="w-4 h-4 text-gray-300" />
    }
  }

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'text-yellow-600 font-bold'
      case 2:
        return 'text-gray-600 font-semibold'
      case 3:
        return 'text-amber-600 font-semibold'
      default:
        return 'text-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">월간 의뢰자 랭킹</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-20 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">월간 의뢰자 랭킹</h3>

      {rankings.length === 0 ? (
        <div className="text-center py-6">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">이번 달 완료된 의뢰가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rankings.slice(0, 5).map((client) => {
            return (
              <div key={client.client_id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-center w-8 h-8">
                  {getRankIcon(client.rank)}
                  <span className={`ml-1 text-sm ${getRankColor(client.rank)}`}>#{client.rank}</span>
                </div>

                <div className="flex-shrink-0">
                  {client.client_profile_image ? (
                    <img
                      src={client.client_profile_image}
                      alt={client.client_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-xs text-gray-500 font-medium">
                        {client.client_name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-grow min-w-0">
                  <Typography variant="body2" className="font-semibold text-gray-900 truncate">
                    {client.client_name}
                  </Typography>
                  {client.client_member_code && (
                    <Typography variant="caption" className="text-gray-500">
                      @{client.client_member_code}
                    </Typography>
                  )}
                </div>
              </div>
            )
          })}

          {rankings.length > 5 && (
            <div className="text-center pt-2">
              <p className="text-xs text-gray-500">
                외 {rankings.length - 5}명의 의뢰자
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
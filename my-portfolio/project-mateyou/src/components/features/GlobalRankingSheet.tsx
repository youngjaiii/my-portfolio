import { useState, useEffect, useCallback } from 'react'
import { SlideSheet, AvatarWithFallback, Typography } from '@/components'
import { useUIStore } from '@/store/useUIStore'
import { resolveAccessToken } from '@/utils/sessionToken'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface RankingMember {
  id: string
  user_id: string
  user_name: string
  profile_image?: string
  member_code?: string
  total_points_spent?: number
  rank?: number
}

export function GlobalRankingSheet() {
  const { isRankingSheetOpen, setIsRankingSheetOpen, currentViewingPartnerId } = useUIStore()
  const [rankings, setRankings] = useState<RankingMember[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchRankings = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = await resolveAccessToken()
      
      // 파트너 ID가 있으면 해당 파트너의 팬 랭킹 조회, 없으면 내 팬 랭킹 조회
      const endpoint = currentViewingPartnerId
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-partners/ranking?partner_id=${currentViewingPartnerId}`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-partners/ranking`
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          apikey: SUPABASE_ANON_KEY,
        },
      })

      const result = await response.json()
      if (result.success && result.data) {
        setRankings(result.data)
      }
    } catch (error) {
      console.error('랭킹 조회 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentViewingPartnerId])

  useEffect(() => {
    if (isRankingSheetOpen) {
      fetchRankings()
    }
  }, [isRankingSheetOpen, fetchRankings])

  const getRankImage = (rank: number) => {
    if (rank === 1) return '/icon/rank1.png'
    if (rank === 2) return '/icon/rank2.png'
    if (rank === 3) return '/icon/rank3.png'
    return null
  }

  return (
    <SlideSheet
      isOpen={isRankingSheetOpen}
      onClose={() => setIsRankingSheetOpen(false)}
      title="팬 랭킹"
    >
      <div className="pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            랭킹 정보가 없습니다
          </div>
        ) : (
          <div className="space-y-5">
            {rankings.map((partner, index) => {
              const rank = index + 1
              const rankImage = getRankImage(rank)
              
              return (
                <div
                  key={partner.user_id || partner.id}
                  className="w-full flex items-center gap-3 px-3"
                >
                  {/* 순위 */}
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                    {rankImage ? (
                      <img src={rankImage} alt={`${rank}등`} className="w-10 h-10 object-contain" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-600">{rank}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* 프로필 */}
                  <AvatarWithFallback
                    src={partner.profile_image}
                    name={partner.user_name || ''}
                    size="sm"
                    className="border border-gray-200"
                  />
                  
                  {/* 정보 - 닉네임 표시 */}
                  <div className="flex-1 text-left min-w-0">
                    <Typography variant="body2" className="font-semibold text-[#110f1a] truncate">
                      {partner.user_name || '익명'}
                    </Typography>
                  </div>
                  
                  {/* 포인트 - 주석처리 */}
                  {/* <div className="flex flex-1 items-center gap-2 flex-shrink-0">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#FE3A8F]">
                      <span className="text-xs font-bold text-white">P</span>
                    </div>
                    <span className="text-sm font-semibold text-[#110f1a]">
                      {(partner.total_points_spent ?? 0).toLocaleString()}
                    </span>
                  </div> */}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SlideSheet>
  )
}


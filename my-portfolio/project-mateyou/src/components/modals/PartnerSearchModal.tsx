import { useState } from 'react'
import type { Database } from '@/types/database'
import {
  AvatarWithFallback,
  Button,
  Flex,
  Modal,
  OnlineIndicator,
  PartnerRequestModal,
  StarRating,
  Typography,
} from '@/components'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { supabase } from '@/lib/supabase'
import { getStatusColor, getStatusLabel } from '@/utils/statusUtils'
import { MEMBER_PUBLIC_FIELDS } from '@/constants/memberFields'

type Member = Database['public']['Tables']['members']['Row']
type Partner = Database['public']['Tables']['partners']['Row']

interface PartnerWithMember extends Partner {
  member: Member
  averageRating?: number
  reviewCount?: number
}

interface PartnerSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

const isOnlineStatus = (status: string) => {
  return status !== 'offline'
}

export function PartnerSearchModal({
  isOpen,
  onClose,
}: PartnerSearchModalProps) {
  const [partnerCode, setPartnerCode] = useState('')
  const [searchResult, setSearchResult] = useState<PartnerWithMember | null>(
    null,
  )
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)

  // 검색된 파트너의 직무 정보 가져오기 - 활성화된 것만
  const { jobs: activeJobs, isLoading: jobsLoading } = usePartnerJobs(
    searchResult?.member_id || '',
    true,
  )
  const hasActiveJobs = activeJobs.length > 0

  const handleSearch = async () => {
    if (!partnerCode.trim()) {
      setSearchError('파트너 코드를 입력해주세요.')
      return
    }

    try {
      setIsSearching(true)
      setSearchError(null)
      setSearchResult(null)

      // 파트너 코드로 검색 (member_code 기준)
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(MEMBER_PUBLIC_FIELDS)
        .eq('member_code', partnerCode.trim())
        .eq('role', 'partner')
        .maybeSingle()

      if (memberError) throw memberError

      if (!memberData) {
        setSearchError('해당 코드의 파트너를 찾을 수 없습니다.')
        return
      }

      // 파트너 정보 가져오기
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('member_id', memberData.id)
        .eq('partner_status', 'approved')
        .maybeSingle()

      if (partnerError) throw partnerError

      if (!partnerData) {
        setSearchError('승인된 파트너가 아닙니다.')
        return
      }

      // 리뷰 평균 및 개수 계산 (0점 리뷰 제외)
      const { data: reviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('target_partner_id', partnerData.id)
        .gt('rating', 0)

      const validRatings =
        reviews?.filter((r) => r.rating !== null && r.rating > 0).map((r) => r.rating!) || []
      const averageRating =
        validRatings.length > 0
          ? validRatings.reduce((sum, rating) => sum + rating, 0) /
            validRatings.length
          : 0

      setSearchResult({
        ...partnerData,
        member: memberData,
        averageRating,
        reviewCount: validRatings.length,
      })
    } catch (error) {
      console.error('Error searching partner:', error)
      setSearchError('검색 중 오류가 발생했습니다.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const resetSearch = () => {
    setPartnerCode('')
    setSearchResult(null)
    setSearchError(null)
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="파트너 코드로 찾기">
        <div className="p-6 space-y-4">
          {/* 검색 입력 */}
          <div>
            <Typography variant="h6" className="mb-2">
              파트너 코드 입력
            </Typography>
            <div className="flex gap-2">
              <input
                type="text"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="예: MATE001"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSearching}
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching || !partnerCode.trim()}
                loading={isSearching}
              >
                검색
              </Button>
            </div>
          </div>

          {/* 검색 오류 */}
          {searchError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <Typography variant="body2" className="text-red-600">
                {searchError}
              </Typography>
            </div>
          )}

          {/* 검색 결과 */}
          {searchResult && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-4">
              <Typography variant="h6" className="text-center">
                검색 결과
              </Typography>

              {/* 파트너 정보 */}
              <Flex align="center" gap={3}>
                <div className="relative">
                  <AvatarWithFallback
                    name={
                      searchResult.partner_name ||
                      searchResult.member.name ||
                      searchResult.member.member_code ||
                      'Unknown'
                    }
                    src={searchResult.member.profile_image || undefined}
                    size="lg"
                  />
                  <div className="absolute -bottom-1 -right-1">
                    <OnlineIndicator
                      isOnline={isOnlineStatus(
                        searchResult.member.current_status,
                      )}
                      size="md"
                    />
                  </div>
                </div>

                <div className="flex-1">
                  <Typography variant="h5" className="font-semibold">
                    {searchResult.partner_name || searchResult.member.name}
                  </Typography>
                  <Typography variant="body2" color="text-secondary">
                    코드: {searchResult.member.member_code}
                  </Typography>
                  <Flex align="center" gap={1} className="mt-1">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isOnlineStatus(searchResult.member.current_status)
                          ? 'bg-green-500'
                          : 'bg-gray-400'
                      }`}
                    />
                    <Typography
                      variant="caption"
                      className={getStatusColor(
                        searchResult.member.current_status,
                      )}
                    >
                      {getStatusLabel(searchResult.member.current_status)}
                    </Typography>
                  </Flex>
                </div>
              </Flex>

              {/* 평점 및 리뷰 */}
              <Flex align="center" gap={2}>
                <StarRating
                  rating={searchResult.averageRating || 0}
                  size="sm"
                />
                <Typography variant="body2" color="text-secondary">
                  {searchResult.averageRating?.toFixed(1) || '0.0'} (
                  {searchResult.reviewCount || 0}개 리뷰)
                </Typography>
              </Flex>

              {/* 파트너 메시지 */}
              {searchResult.partner_message && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <Typography variant="body2">
                    {searchResult.partner_message}
                  </Typography>
                </div>
              )}

              {/* 액션 버튼 */}
              <Flex gap={2}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetSearch}
                  className="flex-1"
                >
                  다시 검색
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsRequestModalOpen(true)}
                  disabled={!hasActiveJobs || jobsLoading}
                  className="flex-1"
                  title={
                    !hasActiveJobs
                      ? '현재 활성화된 서비스가 없습니다'
                      : undefined
                  }
                >
                  {jobsLoading
                    ? '확인 중...'
                    : !hasActiveJobs
                      ? '서비스 중단'
                      : '의뢰하기'}
                </Button>
              </Flex>
            </div>
          )}

          {/* 하단 버튼 */}
          {!searchResult && (
            <Flex justify="end">
              <Button variant="outline" onClick={onClose}>
                닫기
              </Button>
            </Flex>
          )}
        </div>
      </Modal>

      {/* 의뢰하기 모달 */}
      {searchResult && (
        <PartnerRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          partnerId={searchResult.member_id}
          partnerName={
            searchResult.partner_name || searchResult.member.name || undefined
          }
          onSuccess={() => {
            setIsRequestModalOpen(false)
            onClose()
            resetSearch()
          }}
        />
      )}
    </>
  )
}

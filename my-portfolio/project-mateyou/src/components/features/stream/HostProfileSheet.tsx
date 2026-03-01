/**
 * HostProfileSheet - 일반 유저용 호스트 프로필 시트
 * 
 * 보이스룸에서 호스트를 클릭했을 때 표시되는 시트
 * - 호스트 정보 표시
 * - 팔로우 기능
 * - 프로필로 이동 기능
 */

import { SlideSheet } from '@/components/ui/SlideSheet'
import { useFollowHost } from '@/hooks/useFollowHost'
import type { StreamHost } from '@/hooks/useVoiceRoom'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from '@tanstack/react-router'
import { Crown, Mic, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface HostProfileSheetProps {
  isOpen: boolean
  onClose: () => void
  host: StreamHost | null
}

export function HostProfileSheet({
  isOpen,
  onClose,
  host,
}: HostProfileSheetProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [memberCode, setMemberCode] = useState<string | null>(null)

  // 호스트 정보 추출
  const hostName = host?.partner?.partner_name || host?.member?.name || '알 수 없음'
  const profileImage = host?.partner?.member?.profile_image || host?.member?.profile_image || ''
  const isOwner = host?.role === 'owner'
  // partner_id를 직접 확인 (partner 객체가 없어도 partner_id 필드가 있을 수 있음)
  const hostPartnerId = host?.partner?.id || host?.partner_id || null
  const hostMemberId = host?.member_id || host?.partner?.member?.id

  // member_code 조회
  useEffect(() => {
    if (!hostMemberId) {
      setMemberCode(null)
      return
    }

    const fetchMemberCode = async () => {
      try {
        const { data } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', hostMemberId)
          .single()

        if (data?.member_code) {
          setMemberCode(data.member_code)
        }
      } catch (error) {
        console.error('member_code 조회 실패:', error)
        setMemberCode(null)
      }
    }

    fetchMemberCode()
  }, [hostMemberId])

  // 팔로우 훅
  const { isFollowing, isLoading: isFollowLoading, toggleFollow } = useFollowHost({
    hostPartnerId: hostPartnerId || null,
    hostMemberId: hostMemberId || null,
  })

  // 팔로우 처리
  const handleFollow = async () => {
    if (!user) {
      navigate({ to: '/login' })
      return
    }

    // 자기 자신을 팔로우하려는 경우 방지
    if (hostMemberId === user.id) {
      return
    }

    await toggleFollow()
  }

  // 프로필로 이동
  const handleGoToProfile = () => {
    if (!memberCode) return
    navigate({ to: '/partners/$memberCode', params: { memberCode } })
    onClose()
  }

  if (!host) return null

  const isOwnProfile = hostMemberId === user?.id

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title=""
      initialHeight={0.5}
      minHeight={0.3}
      maxHeight={0.7}
      zIndex={10000}
    >
      <div className="pb-4">
        {/* 프로필 헤더 */}
        <div className="flex flex-col items-center gap-4 pb-6 mb-4 border-b border-gray-100">
          <div className="relative">
            <img
              src={profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${hostName}`}
              alt={hostName}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-100"
            />
            {/* 역할 뱃지 */}
            <div className={`absolute -bottom-1 -right-1 rounded-full p-1 ${
              isOwner ? 'bg-[#FE3A8F]' : 'bg-purple-500'
            }`}>
              {isOwner ? (
                <Crown className="w-4 h-4 text-white" />
              ) : (
                <Mic className="w-4 h-4 text-white" />
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-1">
            <h3 className="text-lg font-semibold text-[#110f1a]">{hostName}</h3>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
              isOwner ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600'
            }`}>
              {isOwner ? (
                <>
                  <Crown className="w-3 h-3" />
                  방장
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3" />
                  발언자
                </>
              )}
            </span>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="space-y-3">
          {/* 팔로우 버튼 - 파트너인 경우에만 표시 */}
          {!isOwnProfile && hostPartnerId && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={isFollowLoading}
              className={`w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isFollowing
                  ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  : 'bg-[#FE3A8F] text-white hover:bg-[#fe4a9a]'
              }`}
            >
              {isFollowLoading ? '처리 중...' : isFollowing ? '팔로잉' : '팔로우'}
            </button>
          )}

          {/* 프로필로 이동 버튼 */}
          {memberCode && (
            <button
              type="button"
              onClick={handleGoToProfile}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User className="w-4 h-4" />
              <span className="font-semibold">프로필 보기</span>
            </button>
          )}
        </div>
      </div>
    </SlideSheet>
  )
}


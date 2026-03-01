import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Code2 } from 'lucide-react'
import type { Database } from '@/types/database'
import { Button, Typography } from '@/components'
import { useAuthStore } from '@/store/useAuthStore'
import { useDevice } from '@/hooks/useDevice'
import { supabase } from '@/lib/supabase'
import { edgeApi } from '@/lib/edgeApi'

type Member = Database['public']['Tables']['members']['Row']

interface DevUser {
  member: Member
  label: string
  color: 'primary' | 'success' | 'warning'
}

export function DevModeSwitcher() {
  const isLocalDev =
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    (/^(localhost|127(?:\.\d+){3})$/.test(window.location.hostname) ||
      /^172\.(?:1[6-9]|2[0-9]|3[01])\./.test(window.location.hostname) ||
      /^192\.168\./.test(window.location.hostname) ||
      /^10\./.test(window.location.hostname))

  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [devUsers, setDevUsers] = useState<Array<DevUser>>([])
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuthStore()
  const { isMobile } = useDevice()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    fetchDevUsers()
  }, [])

  // 인증 상태 변경 시 dev users 다시 가져오기
  useEffect(() => {
    if (user?.id) {
      fetchDevUsers()
    }
  }, [user?.id])

  const fetchDevUsers = async () => {
    try {
      setIsLoading(true)

      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at')

      if (error) {
        return
      }

      if (data.length > 0) {
        const users: Array<DevUser> = data.map((member) => ({
          member,
          label: `${member.name || member.member_code || member.social_id || 'Unknown'} (${getRoleLabel(member.role)})`,
          color: getRoleColor(member.role),
        }))
        setDevUsers(users)
      }
    } catch (error) {
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleLabel = (role: Member['role']) => {
    switch (role) {
      case 'normal':
        return '일반'
      case 'partner':
        return '파트너'
      case 'admin':
        return '관리자'
      default:
        return '알 수 없음'
    }
  }

  const getRoleColor = (
    role: Member['role'],
  ): 'primary' | 'success' | 'warning' => {
    switch (role) {
      case 'normal':
        return 'primary'
      case 'partner':
        return 'success'
      case 'admin':
        return 'warning'
      default:
        return 'primary'
    }
  }

  const getCurrentUser = () => {
    if (!user || !devUsers.length) return null
    return devUsers.find((devUser) => devUser.member.id === user.id)
  }

  const currentUser = getCurrentUser()

  const handleTestPush = async () => {
    if (!currentUser?.member?.id) return
    try {
      await edgeApi.pushAuto.send({
        target_id: currentUser.member.id,
        notification_type: 'system',
        title: '🔔 테스트 푸시',
        body: '이것은 로컬 Dev 테스트 푸시입니다.',
        url: '/',
        data: { ts: Date.now().toString(), from: 'DevModeSwitcher' },
      })
      alert('푸시 전송 요청 완료 (push-notification-auto)')
    } catch (e) {
      alert('푸시 전송 실패: ' + (e as Error).message)
    }
  }

  const handleUserChange = (devUser: DevUser) => {
    setIsOpen(false)

    try {
      const newUser = {
        ...devUser.member,
        username:
          devUser.member.name || devUser.member.member_code || 'Unknown',
        email: devUser.member.social_id || '',
        avatar: devUser.member.profile_image || undefined,
      }

      // 새로운 사용자로 로그인 시뮬레이션
      useAuthStore.setState({
        user: newUser,
        isAuthenticated: true,
        isLoading: false,
      })

      // React Query 캐시에도 user 데이터 설정
      queryClient.setQueryData(['user'], newUser)

      // 관련 쿼리들 무효화하여 새로운 user ID로 다시 가져오도록 함
      queryClient.invalidateQueries({ queryKey: ['member-points'] })
      queryClient.invalidateQueries({ queryKey: ['member-points-history'] })

      // 메인 페이지로 이동
      navigate({ to: '/' })
    } catch (error) {}
  }

  // 개발 환경이 아니면 숨김
  if (!isLocalDev) {
    return null
  }

  // 모바일: 아이콘 버튼 + 토글 UI
  if (isMobile) {
    return (
      <div className="fixed bottom-20 left-4 z-50">
        {!isExpanded ? (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#110f1a] text-white shadow-lg transition hover:bg-[#241f3f]"
            aria-label="개발 모드 열기"
          >
            <Code2 className="h-5 w-5" />
          </button>
        ) : (
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-2 min-w-[280px]">
            <div className="flex items-center justify-between mb-2">
              <Typography
                variant="caption"
                color="text-secondary"
                className="font-semibold"
              >
                DEV MODE
              </Typography>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <Button
              variant={currentUser?.color || 'primary'}
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? '로딩...' : currentUser?.label || '사용자 선택'}
            </Button>

            {currentUser && (
              <div className="mt-2">
                <Button variant="primary" size="sm" onClick={handleTestPush} className="w-full">
                  푸시 테스트 보내기
                </Button>
              </div>
            )}

            {isOpen && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden min-w-[280px] max-h-64 overflow-y-auto">
                {isLoading ? (
                  <div className="px-3 py-2 text-sm text-gray-500">로딩 중...</div>
                ) : devUsers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    사용자가 없습니다
                  </div>
                ) : (
                  devUsers.map((devUser) => (
                    <button
                      key={devUser.member.id}
                      onClick={() => handleUserChange(devUser)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors ${
                        currentUser?.member.id === devUser.member.id
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700'
                      }`}
                    >
                      <div className="font-medium">
                        {devUser.member.name || devUser.member.member_code}
                      </div>
                      <div className="text-xs text-gray-500">
                        {getRoleLabel(devUser.member.role)} ·{' '}
                        {devUser.member.current_status}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // 데스크톱: 기존 UI
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-2">
        <Typography
          variant="caption"
          color="text-secondary"
          className="block text-center mb-2"
        >
          DEV MODE
        </Typography>

        <Button
          variant={currentUser?.color || 'primary'}
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? '로딩...' : currentUser?.label || '사용자 선택'}
        </Button>

        {currentUser && (
          <div className="mt-2">
            <Button variant="primary" size="sm" onClick={handleTestPush} className="w-full">
              푸시 테스트 보내기
            </Button>
          </div>
        )}

        {isOpen && (
          <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden min-w-64 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-gray-500">로딩 중...</div>
            ) : devUsers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                사용자가 없습니다
              </div>
            ) : (
              devUsers.map((devUser) => (
                <button
                  key={devUser.member.id}
                  onClick={() => handleUserChange(devUser)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors ${
                    currentUser?.member.id === devUser.member.id
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700'
                  }`}
                >
                  <div className="font-medium">
                    {devUser.member.name || devUser.member.member_code}
                  </div>
                  <div className="text-xs text-gray-500">
                    {getRoleLabel(devUser.member.role)} ·{' '}
                    {devUser.member.current_status}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

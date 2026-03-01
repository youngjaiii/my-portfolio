import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useAuth } from '@/hooks/useAuth'
import { Button, Flex, Typography, Input } from '@/components'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { generateUUID } from '@/lib/utils'

export const Route = createFileRoute('/loginTester' as const)({
  component: LoginTesterPage,
})

function LoginTesterPage() {
  const { syncSession } = useAuthStore()
  const { refreshUser } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createdUsers, setCreatedUsers] = useState<string[]>([])

  const testUsers = [
    {
      role: 'normal' as const,
      email: 'user@test.com',
      name: '일반사용자',
      member_code: 'TEST001',
      greeting: '안녕하세요! 게임을 좋아하는 일반 사용자입니다.',
      favorite_game: '리그 오브 레전드'
    },
    {
      role: 'partner' as const,
      email: 'partner@test.com',
      name: '파트너사용자',
      member_code: 'PARTNER001',
      greeting: '안녕하세요! 경험이 풍부한 게임 파트너입니다.',
      favorite_game: '발로란트',
      partner_name: '프로게이머 김파트너',
      partner_message: '5년 경력의 FPS 전문 파트너입니다. 실력 향상을 도와드립니다!'
    },
    {
      role: 'admin' as const,
      email: 'admin@test.com',
      name: '관리자',
      member_code: 'ADMIN001',
      greeting: '시스템 관리자입니다.',
      favorite_game: '모든 게임'
    },
  ]

  const createTestAccount = async (role: 'normal' | 'partner' | 'admin') => {
    setCreateLoading(true)
    try {
      const testUser = testUsers.find(u => u.role === role)
      if (!testUser) return

      // 1. UUID 생성 (Supabase Auth 우회)
      const userId = generateUUID()

      // Auth가 비활성화된 경우를 위한 대안
      let authCreated = false
      try {
        // Admin API 시도
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: testUser.email,
          password: 'test123456',
          email_confirm: true,
          user_metadata: {
            full_name: testUser.name,
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${role}`,
            test_role: role,
          }
        })

        if (!authError && authData.user) {
          authCreated = true
        }
      } catch (error) {
      }

      // 2. members 테이블에 사용자 정보 저장
      const memberData: Database['public']['Tables']['members']['Insert'] = {
        id: userId,
        member_code: testUser.member_code,
        social_id: `test-social-${role}`,
        name: testUser.name,
        role: testUser.role,
        profile_image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${role}`,
        favorite_game: testUser.favorite_game,
        greeting: testUser.greeting,
        current_status: 'online',
        total_points: role === 'admin' ? 999999 : role === 'partner' ? 50000 : 10000,
      }

      const { error: memberError } = await supabase
        .from('members')
        .insert(memberData)

      if (memberError) throw memberError

      // 3. 파트너인 경우 partners 테이블에도 추가
      if (role === 'partner') {
        const partnerData: Database['public']['Tables']['partners']['Insert'] = {
          member_id: userId,
          partner_name: testUser.partner_name,
          partner_message: testUser.partner_message,
          partner_status: 'approved',
          partner_applied_at: new Date().toISOString(),
          partner_reviewed_at: new Date().toISOString(),
          total_points: 50000,
          game_info: {
            games: ['발로란트', '리그 오브 레전드', 'PUBG'],
            specialties: ['FPS', 'MOBA', '코칭'],
            experience_years: 5
          }
        }

        const { error: partnerError } = await supabase
          .from('partners')
          .insert(partnerData)

        if (partnerError) throw partnerError
      }

      setCreatedUsers(prev => [...prev, `${testUser.name} (${testUser.email})`])
      const authMessage = authCreated ? '\n✅ Auth 계정도 생성됨' : '\n⚠️ DB만 생성됨 (Auth 비활성화)'
      alert(`${testUser.name} 계정이 성공적으로 생성되었습니다!${authMessage}\n이메일: ${testUser.email}\nID: ${userId}`)

    } catch (error) {
      console.error('계정 생성 실패:', error)
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      alert(`계정 생성에 실패했습니다: ${errorMessage}\n\n상세 오류는 브라우저 콘솔을 확인해주세요.`)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleTestLogin = async (role: 'normal' | 'partner' | 'admin') => {
    setIsLoading(true)
    try {
      const testUser = testUsers.find(u => u.role === role)
      if (!testUser) return

      // DB에서 해당 역할의 테스트 계정 조회 (RLS 우회)
      let existingMember = null
      try {
        // 여러 방법으로 계정 조회 시도
        const queries = [
          // 방법 1: member_code로 조회
          () => supabase.from('members').select('*').eq('member_code', testUser.member_code).single(),
          // 방법 2: role과 name으로 조회
          () => supabase.from('members').select('*').eq('role', role).eq('name', testUser.name).single(),
          // 방법 3: social_id로 조회
          () => supabase.from('members').select('*').eq('social_id', `test-social-${role}`).single(),
        ]

        for (const query of queries) {
          try {
            const { data, error } = await query()
            if (!error && data) {
              existingMember = data
              break
            }
          } catch (e) {
            continue
          }
        }
      } catch (error) {
      }

      if (!existingMember) {
        alert(`${testUser.name} 계정이 없습니다. 먼저 "계정 생성" 버튼을 눌러주세요.\n\n오류가 계속 발생한다면 브라우저 콘솔을 확인해주세요.`)
        return
      }

      // Auth 로그인 건너뛰고 바로 모킹 세션 사용 (개발/테스트 환경)

      const mockSession = {
          access_token: 'test-token',
          token_type: 'bearer' as const,
          user: {
            id: existingMember.id,
            email: testUser.email,
            user_metadata: {
              full_name: existingMember.name,
              avatar_url: existingMember.profile_image,
              test_role: role, // 테스트 역할 정보 추가
            },
            app_metadata: {
              provider: 'test',
              test_mode: true, // 테스트 모드 식별자
            },
            aud: 'authenticated',
            created_at: existingMember.created_at,
            confirmed_at: new Date().toISOString(),
            email_confirmed_at: new Date().toISOString(),
            phone_confirmed_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
            role: 'authenticated',
            updated_at: existingMember.updated_at,
          },
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'test-refresh-token',
        }


        await syncSession(mockSession as any)

        // 세션 동기화 후 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 100))


      // 사용자 정보 강제 새로고침
      await refreshUser()

      // 짧은 대기 후 상태 확인
      await new Promise(resolve => setTimeout(resolve, 500))

      // 홈으로 리다이렉트
      window.location.href = '/'
    } catch (error) {
      console.error('테스트 로그인 실패:', error)
      alert('로그인에 실패했습니다: ' + (error as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickDiscordLogin = async () => {
    setIsLoading(true)
    try {
      // 실제 Discord 로그인 시도
      const { Capacitor } = await import('@capacitor/core')
      const isNative = Capacitor.isNativePlatform()
      const redirectTo = isNative 
        ? 'capacitor://localhost' 
        : `${window.location.origin}/`
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo,
        },
      })
      if (error) throw error
    } catch (error) {
      console.error('Discord 로그인 실패:', error)
      setIsLoading(false)
    }
  }

  return (
    <Flex
      align="center"
      justify="center"
      className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900"
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        <div className="text-center mb-8">
          <Typography variant="h1" className="mb-2 text-green-600">
            🧪 테스트 로그인
          </Typography>
          <Typography variant="body1" color="text-secondary">
            개발용 테스트 계정으로 빠르게 로그인
          </Typography>
        </div>

        <div className="space-y-6">
          {/* 로그인 섹션 */}
          <div>
            <Typography variant="h3" className="mb-4 text-center">
              테스트 계정으로 로그인
            </Typography>
            <div className="space-y-3">
              {testUsers.map((user) => (
                <Button
                  key={user.role}
                  onClick={() => handleTestLogin(user.role)}
                  disabled={isLoading || createLoading}
                  className={`w-full py-3 text-left justify-start ${
                    user.role === 'normal'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : user.role === 'partner'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                  size="sm"
                >
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <div className="font-medium">🚀 {user.name}</div>
                      <div className="text-sm opacity-80">{user.email}</div>
                    </div>
                    <div className="text-xs opacity-70 uppercase">
                      LOGIN
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* 생성된 계정 목록 */}
          {createdUsers.length > 0 && (
            <div>
              <Typography variant="h3" className="mb-4 text-center text-green-600">
                ✅ 생성된 계정들
              </Typography>
              <div className="bg-green-50 p-4 rounded-lg">
                {createdUsers.map((user, index) => (
                  <Typography key={index} variant="caption" className="text-green-700 block">
                    • {user}
                  </Typography>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-6">
            <Typography variant="h3" className="mb-4 text-center">
              실제 로그인
            </Typography>
            <Button
              onClick={handleQuickDiscordLogin}
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 py-3"
              size="sm"
            >
              Discord로 실제 로그인
            </Button>
          </div>

          <div className="text-center">
            <Typography variant="body2" color="text-secondary">
              💡 팁: 각 역할별로 다른 기능을 테스트해보세요
            </Typography>
            <ul className="mt-2 space-y-1 text-left">
              <Typography variant="caption" color="text-disabled" as="li">
                • 일반사용자: 파트너 찾기, 예약 기능
              </Typography>
              <Typography variant="caption" color="text-disabled" as="li">
                • 파트너: 대시보드, 예약 관리 기능
              </Typography>
              <Typography variant="caption" color="text-disabled" as="li">
                • 관리자: 전체 관리 기능
              </Typography>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <Typography variant="caption" color="text-disabled">
            ⚠️ 이 페이지는 개발/테스트 목적으로만 사용하세요
          </Typography>
        </div>
      </div>
    </Flex>
  )
}
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  Button,
  FileInput,
  Flex,
  Input,
  Textarea,
  Typography,
} from '@/components'

export const Route = createFileRoute('/partner/apply' as const)({
  component: PartnerApplyPage,
})

function PartnerApplyPage() {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    photo: null as File | null,
    favoriteGames: '',
    gameInfo: '',
    greeting: '',
    phoneNumber: '',
    socialId: '',
  })

  // 디스코드 로그인 정보가 있으면 자동으로 채우기
  useEffect(() => {
    if (user?.username) {
      setFormData((prev) => ({
        ...prev,
        socialId: user.username || '',
      }))
    }
  }, [user?.username])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Supabase에 데이터 전송
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, photo: e.target.files[0] })
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="text-center mb-8">
        <Typography variant="h1" className="mb-4">
          파트너 신청
        </Typography>
        <Typography variant="subtitle1" color="text-secondary" className="mb-2">
          게임 파트너로 활동하고 수익을 얻어보세요
        </Typography>
        <Typography variant="body2" color="text-disabled">
          아래 정보를 입력하여 파트너 신청을 완료하세요
        </Typography>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 space-y-6"
      >
        <FileInput
          label="프로필 사진"
          accept="image/*"
          onChange={handlePhotoChange}
        />

        <Input
          label="디스코드 아이디"
          type="text"
          value={formData.socialId}
          onChange={(e) =>
            setFormData({ ...formData, socialId: e.target.value })
          }
          placeholder="username#1234"
          required
          readOnly={!!user?.username}
          helpText={
            user?.username
              ? '디스코드 로그인 정보로 자동 입력되었습니다'
              : undefined
          }
        />

        <Input
          label="이름"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />

        <Input
          label="전화번호"
          type="tel"
          value={formData.phoneNumber}
          onChange={(e) =>
            setFormData({ ...formData, phoneNumber: e.target.value })
          }
          placeholder="010-1234-5678"
          required
        />

        <Input
          label="선호하는 게임"
          type="text"
          value={formData.favoriteGames}
          onChange={(e) =>
            setFormData({ ...formData, favoriteGames: e.target.value })
          }
          placeholder="예: 리그 오브 레전드, 배틀그라운드"
          required
        />

        <Textarea
          label="게임 정보"
          value={formData.gameInfo}
          onChange={(e) =>
            setFormData({ ...formData, gameInfo: e.target.value })
          }
          placeholder="예: 랭크, 주 포지션, 플레이 스타일 등"
          rows={3}
          required
        />

        <Textarea
          label="인사말"
          value={formData.greeting}
          onChange={(e) =>
            setFormData({ ...formData, greeting: e.target.value })
          }
          placeholder="자신을 소개하고 고객들에게 전할 메시지를 작성해주세요"
          rows={4}
          required
        />

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <Flex align="start">
            <svg
              className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <Typography
                variant="body2"
                className="mb-1 font-medium text-blue-800"
              >
                신청 승인 안내
              </Typography>
              <Typography variant="caption" className="text-blue-700">
                관리자가 승인 후 파트너로 활동할 수 있습니다. 승인 결과는
                디스코드 또는 전화로 연락드립니다.
              </Typography>
            </div>
          </Flex>
        </div>

        <Button type="submit" className="w-full" size="lg">
          파트너 신청하기
        </Button>
      </form>
    </div>
  )
}

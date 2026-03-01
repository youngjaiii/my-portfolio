import { useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { SlideSheet, Button, Typography } from '@/components'
import { resolveAccessToken } from '@/utils/sessionToken'
import { toast } from 'sonner'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// 신고 유형 (api-post-reports reason_type과 일치)
const REPORT_REASONS = [
  { value: 1, label: '욕설/비방', description: '욕설, 비방, 인신공격 등' },
  { value: 2, label: '음란물/성적 콘텐츠', description: '음란물, 성적 콘텐츠, 노출 등' },
  { value: 3, label: '스팸/광고', description: '스팸, 무분별한 광고, 도배 등' },
  { value: 4, label: '사기/허위정보', description: '사기, 허위정보, 거짓말 등' },
  { value: 5, label: '혐오/차별', description: '혐오 발언, 차별, 인종차별 등' },
  { value: 6, label: '아동 학대/착취', description: 'CSAE, 아동 성적 학대, 착취 등' },
  { value: 7, label: '폭력/위협', description: '폭력, 위협, 협박 등' },
  { value: 8, label: '개인정보 노출', description: '개인정보 무단 노출, 신상털기 등' },
  { value: 9, label: '저작권 침해', description: '저작권 침해, 무단 전재 등' },
  { value: 99, label: '기타', description: '위 항목에 해당하지 않는 경우' },
]

export type ReportTargetType = 'post' | 'comment' | 'profile' | 'chat'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string // post_id, comment_id, member_id, chat_room_id 등
  targetName?: string // 신고 대상 이름 (표시용)
}

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<number | null>(null)
  const [detail, setDetail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getTargetLabel = () => {
    switch (targetType) {
      case 'post':
        return '게시물'
      case 'comment':
        return '댓글'
      case 'profile':
        return '프로필'
      case 'chat':
        return '채팅'
      default:
        return '콘텐츠'
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!selectedReason) {
      toast.error('신고 사유를 선택해주세요')
      return
    }

    setIsSubmitting(true)
    try {
      const token = await resolveAccessToken()
      if (!token) {
        toast.error('로그인이 필요합니다')
        return
      }

      // API 요청 본문 구성
      const body: Record<string, unknown> = {
        reason_type: selectedReason,
        reason_detail: detail.trim() || REPORT_REASONS.find(r => r.value === selectedReason)?.label || '',
      }

      // 타겟 타입에 따라 필드 추가
      switch (targetType) {
        case 'post':
          body.post_id = targetId
          break
        case 'comment':
          body.comment_id = targetId
          break
        case 'profile':
          body.reported_user_id = targetId
          break
        case 'chat':
          body.chat_room_id = targetId
          break
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-reports`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )

      const result = await response.json()

      if (result.success || response.ok) {
        toast.success('신고가 접수되었습니다. 24시간 내에 검토 후 조치하겠습니다.')
        handleClose()
      } else {
        toast.error(result.error || '신고 접수에 실패했습니다')
      }
    } catch (error) {
      console.error('신고 실패:', error)
      toast.error('신고 접수 중 오류가 발생했습니다')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedReason, detail, targetType, targetId])

  const handleClose = () => {
    setSelectedReason(null)
    setDetail('')
    onClose()
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={`${getTargetLabel()} 신고`}
      initialHeight={0.85}
      minHeight={0.5}
      maxHeight={0.9}
      zIndex={9999999}
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedReason || isSubmitting}
            className="flex-1 bg-red-500 hover:bg-red-600"
          >
            {isSubmitting ? '제출 중...' : '신고하기'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-4">
        {/* 경고 안내 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <Typography variant="body2" className="text-yellow-800 font-semibold">
              신고 전 확인해주세요
            </Typography>
            <Typography variant="caption" className="text-yellow-700 mt-1 block">
              허위 신고 시 제재를 받을 수 있습니다. 신고된 콘텐츠는 24시간 내에 검토 후 조치됩니다.
            </Typography>
          </div>
        </div>

        {/* 신고 대상 표시 */}
        {targetName && (
          <div className="bg-gray-50 rounded-lg p-3">
            <Typography variant="caption" className="text-gray-500">
              신고 대상
            </Typography>
            <Typography variant="body2" className="text-gray-800 font-medium mt-1">
              {targetName}
            </Typography>
          </div>
        )}

        {/* 신고 사유 선택 */}
        <div>
          <Typography variant="body2" className="text-gray-700 font-semibold mb-3">
            신고 사유 선택 <span className="text-red-500">*</span>
          </Typography>
          <div className="space-y-2">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                onClick={() => setSelectedReason(reason.value)}
                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                  selectedReason === reason.value
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Typography variant="body2" className="font-medium text-gray-800">
                  {reason.label}
                </Typography>
                <Typography variant="caption" className="text-gray-500">
                  {reason.description}
                </Typography>
              </button>
            ))}
          </div>
        </div>

        {/* 상세 내용 입력 */}
        <div>
          <Typography variant="body2" className="text-gray-700 font-semibold mb-2">
            상세 내용 (선택)
          </Typography>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="추가로 전달하고 싶은 내용이 있다면 입력해주세요"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none resize-none"
            rows={4}
            maxLength={500}
          />
          <Typography variant="caption" className="text-gray-400 text-right block mt-1">
            {detail.length}/500
          </Typography>
        </div>

        {/* 운영 정책 안내 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <Typography variant="body2" className="text-gray-700 font-semibold mb-2">
            운영 정책 안내
          </Typography>
          <ul className="space-y-1 text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-red-500">•</span>
              <Typography variant="caption">
                신고 접수 후 24시간 내에 검토 및 조치합니다
              </Typography>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500">•</span>
              <Typography variant="caption">
                유해/혐오/학대 콘텐츠는 무관용 원칙으로 즉시 삭제됩니다
              </Typography>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500">•</span>
              <Typography variant="caption">
                악성 유저는 경고, 일시정지, 영구정지 순으로 제재됩니다
              </Typography>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500">•</span>
              <Typography variant="caption">
                아동 학대/착취(CSAE) 관련 신고는 법 집행 기관에 보고됩니다
              </Typography>
            </li>
          </ul>
        </div>
      </div>
    </SlideSheet>
  )
}


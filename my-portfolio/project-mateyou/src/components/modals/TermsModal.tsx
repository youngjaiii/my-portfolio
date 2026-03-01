import { Button, Modal, Typography } from '@/components'

interface TermsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TermsModal({ isOpen, onClose }: TermsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="이용약관 및 환불규정">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {/* 서비스 이용약관 */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <Typography variant="h5" className="text-blue-700 font-semibold">
              서비스 이용약관
            </Typography>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-blue-700 mb-1"
                >
                  서비스 이용시간
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  24시간 연중무휴 (시스템 점검 시 제외)
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-blue-700 mb-1"
                >
                  회원가입
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  만 14세 이상 누구나 가입 가능
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-blue-700 mb-1"
                >
                  포인트 사용
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  충전된 포인트는 파트너 서비스 이용 시 차감
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-blue-700 mb-1"
                >
                  금지사항
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  불법적인 이용, 타인에게 피해를 주는 행위 금지
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-blue-700 mb-1"
                >
                  계정 관리
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  회원은 본인의 계정 정보를 안전하게 관리할 책임
                </Typography>
              </div>
            </div>
          </div>
        </div>

        {/* 환불규정 */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <Typography variant="h5" className="text-green-700 font-semibold">
              환불 규정
            </Typography>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-green-700 mb-1"
                >
                  미사용 포인트
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  충전 후 7일 이내 미사용 시 전액 환불 가능
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-green-700 mb-1"
                >
                  서비스 변경 시
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  가맹점 축소나 이용조건 악화 시 수수료 없이 전액 환불
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-green-700 mb-1"
                >
                  부분 사용 시
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  사용된 금액을 제외한 잔액의 90% 환불
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-green-700 mb-1"
                >
                  환불 신청
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  고객센터를 통해 신청 (영업일 기준 3-5일 소요)
                </Typography>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <Typography
                  variant="body2"
                  className="font-semibold text-green-700 mb-1"
                >
                  환불 제한
                </Typography>
                <Typography
                  variant="caption"
                  className="text-gray-700 leading-relaxed"
                >
                  유효기간 만료된 포인트는 환불 불가
                </Typography>
              </div>
            </div>
          </div>
        </div>

        {/* 고객센터 안내 */}
        <div className="bg-gray-50 p-4 rounded-lg border">
          <Typography variant="body2" className="text-gray-600 text-center">
            문의사항이 있으시면 고객센터로 연락해 주세요.
          </Typography>
          <Typography
            variant="body2"
            className="text-blue-600 text-center font-semibold mt-1"
          >
            support@mateyou.com
          </Typography>
        </div>

        <div className="flex justify-end pt-4">
          <Button variant="primary" onClick={onClose} className="px-8">
            확인
          </Button>
        </div>
      </div>
    </Modal>
  )
}

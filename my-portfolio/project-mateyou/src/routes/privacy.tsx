import { createFileRoute } from '@tanstack/react-router'
import { Typography } from '@/components'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPolicyPage,
})

function PrivacyPolicyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button
          onClick={() => navigate({ to: '/' })}
          className="rounded-full p-2 hover:bg-gray-100 flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold text-base whitespace-nowrap overflow-hidden text-ellipsis">
          개인정보처리방침
        </h1>
      </header>

      {/* 내용 */}
      <div className="px-4 pt-6 pb-20 space-y-6 max-w-3xl mx-auto">
        {/* 제1조 개인정보 처리목적 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제1조 (개인정보의 처리목적)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              MateYou는 다음의 목적을 위하여 개인정보를 처리합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              1. 회원가입 및 관리: 회원 식별, 서비스 이용에 따른 본인확인
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 서비스 제공: 게임 파트너 매칭, 포인트 충전 및 사용
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 고객지원: 문의사항 처리, 분쟁 조정을 위한 기록 보존
            </Typography>
          </div>
        </section>

        {/* 제2조 수집하는 개인정보 항목 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제2조 (수집하는 개인정보의 항목)
          </Typography>
          <div className="space-y-3">
            <div>
              <Typography variant="body2" className="font-semibold text-blue-700 mb-1">
                필수정보
              </Typography>
              <Typography variant="caption" className="text-gray-700">
                • 이메일주소, 닉네임, 비밀번호
              </Typography>
            </div>
            <div>
              <Typography variant="body2" className="font-semibold text-blue-700 mb-1">
                선택정보
              </Typography>
              <Typography variant="caption" className="text-gray-700">
                • 프로필 사진, 관심 게임, 자기소개
              </Typography>
            </div>
            <div>
              <Typography variant="body2" className="font-semibold text-blue-700 mb-1">
                자동수집정보
              </Typography>
              <Typography variant="caption" className="text-gray-700">
                • 서비스 이용기록, 기기정보
              </Typography>
            </div>
          </div>
        </section>

        {/* 제3조 처리 및 보유기간 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제3조 (개인정보의 처리 및 보유기간)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 회원탈퇴 시까지 또는 법정 의무보유기간 동안 보유합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 전자상거래법에 따른 거래기록: 5년
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 부정이용 방지를 위한 기록: 1년
            </Typography>
          </div>
        </section>

        {/* 제4조 제3자 제공 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제4조 (개인정보의 제3자 제공)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              회사는 원칙적으로 개인정보를 제3자에게 제공하지 않습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              다만, 다음의 경우에는 예외로 합니다:
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              1. 정보주체가 사전에 동의한 경우
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 법령의 규정에 의하거나 수사기관의 요구가 있는 경우
            </Typography>
          </div>
        </section>

        {/* 제5조 처리위탁 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제5조 (개인정보 처리의 위탁)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              회사는 서비스 향상을 위해 다음과 같이 개인정보 처리업무를 위탁합니다:
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              1. 결제대행: 결제 및 정산 서비스
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 클라우드 서비스: 데이터 저장 및 관리
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 고객지원: 상담 및 문의 처리
            </Typography>
          </div>
        </section>

        {/* 제6조 정보주체의 권리 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제6조 (정보주체의 권리·의무 및 행사방법)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              정보주체는 다음과 같은 권리를 행사할 수 있습니다:
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              1. 개인정보 열람 요구
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 오류 등이 있을 경우 정정·삭제 요구
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 처리정지 요구
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              ※ 권리행사는 서면, 전화, 이메일 등을 통해 가능합니다.
            </Typography>
          </div>
        </section>

        {/* 제7조 개인정보의 안전성 확보조치 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제7조 (개인정보의 안전성 확보조치)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              회사는 개인정보 보호를 위해 다음과 같은 조치를 취합니다:
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              1. 개인정보 암호화
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 해킹 등에 대비한 기술적 대책
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 개인정보 취급자의 최소화 및 교육
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              4. 개인정보 접근통제 시스템 운영
            </Typography>
          </div>
        </section>

        {/* 제8조 개인정보보호책임자 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제8조 (개인정보보호책임자)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와
              관련한 정보주체의 불만처리 및 피해구제를 위하여 아래와 같이
              개인정보보호책임자를 지정하고 있습니다.
            </Typography>
            <div className="bg-gray-50 p-3 rounded border">
              <Typography variant="body2" className="font-semibold">
                개인정보보호책임자
              </Typography>
              <Typography variant="caption" className="text-gray-600">
                이메일: contact@mateyou.me
                <br />
                전화: 010-8712-9811
              </Typography>
            </div>
          </div>
        </section>

        {/* 제9조 개인정보 처리방침 변경 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제9조 (개인정보 처리방침의 변경)
          </Typography>
          <Typography variant="body2" className="text-gray-700">
            이 개인정보 처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른
            변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일
            전부터 공지사항을 통하여 고지할 것입니다.
          </Typography>
        </section>

        {/* 제10조 환불 정책 */}
        <section>
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제10조 (환불 정책)
          </Typography>

          <div className="mb-4">
            <Typography variant="body2" className="font-semibold text-blue-700 mb-2">
              🗓 12개월 이용 기간 정책
            </Typography>
            <div className="space-y-1 ml-4">
              <Typography variant="body2" className="text-gray-700">
                • 포인트 유효기간: 충전일로부터 12개월
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                • 추가 충전 시 전체 포인트 유효기간 연장
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                • 유효기간 만료 시 자동 소멸
              </Typography>
            </div>
          </div>

          <div className="mb-4">
            <Typography variant="body2" className="font-semibold text-blue-700 mb-2">
              💰 환불 조건 (3단계)
            </Typography>
            <div className="space-y-3 ml-4">
              <div>
                <Typography variant="body2" className="font-semibold text-green-700 mb-1">
                  즉시 환불 (100%)
                </Typography>
                <div className="space-y-1 ml-2">
                  <Typography variant="caption" className="text-gray-700">
                    • 충전 후 7일 이내 + 미사용
                  </Typography>
                  <Typography variant="caption" className="text-gray-700">
                    • 서비스 장애 시 전액 보상
                  </Typography>
                  <Typography variant="caption" className="text-gray-700">
                    • 파트너 서비스 미제공 시
                  </Typography>
                </div>
              </div>
              <div>
                <Typography variant="body2" className="font-semibold text-orange-700 mb-1">
                  부분 환불 (수수료 10% 차감)
                </Typography>
                <div className="space-y-1 ml-2">
                  <Typography variant="caption" className="text-gray-700">
                    • 충전 후 30일 이내 + 부분 사용
                  </Typography>
                  <Typography variant="caption" className="text-gray-700">
                    • 계정 해지 시 잔여 포인트
                  </Typography>
                </div>
              </div>
              <div>
                <Typography variant="body2" className="font-semibold text-red-700 mb-1">
                  환불 불가
                </Typography>
                <div className="space-y-1 ml-2">
                  <Typography variant="caption" className="text-gray-700">
                    • 30일 경과 또는 전체 사용 완료
                  </Typography>
                  <Typography variant="caption" className="text-gray-700">
                    • 유효기간 만료 또는 부정 사용
                  </Typography>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <Typography variant="body2" className="font-semibold text-blue-700 mb-2">
              🔄 처리 절차
            </Typography>
            <Typography variant="body2" className="text-gray-700 ml-4">
              신청 → 검토(3일) → 승인 → 완료(5-7일)
            </Typography>
          </div>

          <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
            <Typography variant="caption" className="text-gray-600">
              환불 문의: contact@mateyou.me | 고객센터: 평일 09:00-18:00
            </Typography>
          </div>
        </section>

        <div className="bg-gray-100 p-4 rounded-lg text-center">
          <Typography variant="caption" className="text-gray-600">
            시행일자: 2025년 12월 2일
          </Typography>
        </div>
      </div>
    </div>
  )
}

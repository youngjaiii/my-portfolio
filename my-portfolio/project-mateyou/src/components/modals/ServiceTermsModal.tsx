import { Button, Modal, Typography } from '@/components'

interface ServiceTermsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ServiceTermsModal({ isOpen, onClose }: ServiceTermsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="서비스 이용약관">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {/* 제1조 목적 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제1조 (목적)
          </Typography>
          <Typography variant="body2" className="text-gray-700 leading-relaxed">
            이 약관은 MateYou(이하 "회사")가 제공하는 게임 파트너 매칭
            서비스(이하 "서비스")의 이용조건 및 절차, 회사와 회원 간의 권리·의무
            및 책임사항을 규정함을 목적으로 합니다.
          </Typography>
        </div>

        {/* 제2조 정의 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제2조 (정의)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. "서비스"란 회사가 제공하는 게임 파트너 매칭 및 관련
              부가서비스를 의미합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. "회원"이란 서비스에 회원가입을 하고 서비스를 이용하는 자를
              의미합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. "파트너"란 게임 서비스를 제공하는 회원을 의미합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              4. "포인트"란 서비스 이용을 위해 충전할 수 있는 가상화폐를
              의미합니다.
            </Typography>
          </div>
        </div>

        {/* 제3조 약관의 효력 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제3조 (약관의 효력 및 변경)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 이 약관은 서비스를 이용하는 모든 회원에게 그 효력이 발생합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 회사는 필요에 따라 약관을 변경할 수 있으며, 변경된 약관은
              공지사항을 통해 공지합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 변경된 약관에 동의하지 않는 회원은 서비스 이용을 중단하고
              탈퇴할 수 있습니다.
            </Typography>
          </div>
        </div>

        {/* 제4조 회원가입 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제4조 (회원가입)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 만 14세 이상의 개인은 누구나 회원가입을 신청할 수 있습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 회원가입은 서비스 이용약관과 개인정보처리방침에 동의 후
              가능합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 허위정보로 가입한 경우 서비스 이용이 제한될 수 있습니다.
            </Typography>
          </div>
        </div>

        {/* 제5조 서비스 이용 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제5조 (서비스 이용)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 서비스는 24시간 연중무휴 제공되나, 시스템 점검 시 일시 중단될
              수 있습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 포인트를 충전하여 파트너 서비스를 이용할 수 있습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 서비스 이용 중 발생하는 문제는 고객센터를 통해 신고할 수
              있습니다.
            </Typography>
          </div>
        </div>

        {/* 제6조 금지행위 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제6조 (금지행위)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 타인의 개인정보를 무단으로 수집, 이용, 제공하는 행위
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 서비스의 안정적 운영에 지장을 주는 행위
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 불법적이거나 부적절한 내용의 전송
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              4. 서비스를 이용한 영리활동
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              5. 유해, 혐오, 차별, 학대 관련 콘텐츠의 게시
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              6. 타인을 비방하거나 명예를 훼손하는 행위
            </Typography>
          </div>
        </div>

        {/* 제6조의2 신고 및 조치 */}
        <div className="p-4 bg-red-50 rounded-lg mx-4">
          <Typography variant="h6" className="text-red-700 font-semibold mb-3">
            제6조의2 (신고 및 조치 프로세스)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700 font-semibold">
              ⚠️ 유해/혐오/학대 콘텐츠 무관용 정책
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              1. 회원은 게시물, 댓글, 프로필, 채팅에 대해 신고할 수 있습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 회사는 신고 접수 후 <span className="font-bold text-red-600">24시간 이내</span>에 검토 및 조치합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              3. 위반 콘텐츠는 삭제 또는 비공개 처리되며, 작성자는 다음과 같이 제재됩니다:
            </Typography>
            <div className="pl-4 space-y-1">
              <Typography variant="body2" className="text-gray-700">
                - 1차 위반: 경고
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                - 2차 위반: 7일 서비스 이용 정지
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                - 3차 위반: 30일 서비스 이용 정지
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                - 4차 이상 또는 중대 위반: 영구 추방
              </Typography>
            </div>
            <Typography variant="body2" className="text-gray-700">
              4. 악성 유저는 사전 경고 없이 즉시 제재될 수 있습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              5. 허위 신고 시 신고자가 제재를 받을 수 있습니다.
            </Typography>
          </div>
        </div>

        {/* 제7조 책임의 한계 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제7조 (책임의 한계)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 회사는 천재지변, 시스템 장애 등 불가항력으로 인한 서비스 중단에
              대해 책임지지 않습니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 회원 간의 거래나 분쟁에 대해서는 당사자 간에 해결해야 합니다.
            </Typography>
          </div>
        </div>

        {/* 제8조 아동 보호 정책 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제8조 (아동 보호 정책)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 회사는 아동 성적 학대 및 착취(CSAE)를 포함한 모든 형태의 아동 학대에 대해 무관용 원칙을 적용합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 다음 행위는 엄격히 금지되며, 위반 시 즉시 계정이 정지되고 관련 법 집행 기관에 신고됩니다:
            </Typography>
            <div className="pl-4 space-y-1">
              <Typography variant="body2" className="text-gray-700">
                - 아동을 대상으로 한 성적 콘텐츠의 생성, 업로드, 공유
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                - 아동에 대한 그루밍(grooming) 또는 성적 착취 시도
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                - 아동 성적 학대물(CSAM)의 배포 또는 소지
              </Typography>
              <Typography variant="body2" className="text-gray-700">
                - 미성년자를 대상으로 한 부적절한 접촉 시도
              </Typography>
            </div>
            <Typography variant="body2" className="text-gray-700">
              3. 의심스러운 행위 발견 시 앱 내 신고 기능 또는 support@mateyou.co.kr로 신고해 주시기 바랍니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              4. 회사는 신고된 내용을 검토하고, 필요시 관련 법 집행 기관에 보고합니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              5. 본 서비스는 만 14세 이상만 이용 가능합니다.
            </Typography>
          </div>
        </div>

        {/* 제9조 기타 */}
        <div className="p-4">
          <Typography variant="h6" className="text-blue-700 font-semibold mb-3">
            제9조 (기타)
          </Typography>
          <div className="space-y-2">
            <Typography variant="body2" className="text-gray-700">
              1. 이 약관에 명시되지 않은 사항은 관련 법령에 따릅니다.
            </Typography>
            <Typography variant="body2" className="text-gray-700">
              2. 서비스 관련 분쟁은 회사 소재지 관할 법원에서 해결합니다.
            </Typography>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded-lg text-center">
          <Typography variant="caption" className="text-gray-600">
            시행일: 2025년 12월 2일
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

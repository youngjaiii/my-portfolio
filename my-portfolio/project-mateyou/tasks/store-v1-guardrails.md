# 0) 한 번만 만들 파일(권장)
# tasks/store-v1-guardrails.md

## SoT
- requirements/requirement.md
- tasks/store-v1-backlog.md

## Non-negotiables
- Pickup(on_site)=채팅 기반 확정형(슬롯/달력/홀드 금지)
- on_site 주문 시 schedule.start_at/location_id null 허용, Partner가 reserved로 확정
- timesheet는 조회(참조)만, 기존 timesheet 코드 수정 금지
- Digital=결제→오픈(다운로드). 권한 검증 없이 다운로드 URL 발급 금지
- Delivery 분기:
  - source=collaboration: Partner 출고요청 → Admin 출고/송장 → User 확인
  - source=partner: paid 후 채팅 구매요청 자동 → Partner 송장입력 → 채팅 발송
- 재고 권한:
  - collaboration 재고=Admin only
  - partner 재고=Partner(본인) or Admin
- API는 requirements/requirement.md의 “2. api 수정 반영”이 기준
- 충돌 시: (1) 충돌 지점 (2) PRD 해석 (3) 수정안 순서로 제시

## Output
- 파일 변경 반영 후 “변경 파일 목록” 출력
- 세션 종료 시: 구현 요약 + curl 테스트 + 다음 세션 추천

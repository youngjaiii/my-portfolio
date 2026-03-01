import { SlideSheet, Typography } from '@/components'
import type { ReactNode } from 'react'

type StreamHudGuideContext = 'video-room' | 'webrtc-broadcast'

interface StreamHudGuideSheetProps {
  isOpen: boolean
  onClose: () => void
  context: StreamHudGuideContext
}

function GuideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <Typography variant="subtitle2" className="font-semibold text-[#110f1a]">
        {title}
      </Typography>
      <div className="mt-2 text-sm text-gray-600 leading-relaxed">{children}</div>
    </div>
  )
}

/**
 * StreamHudGuideSheet - 라이브 화면 사용 가이드
 * 초보 호스트가 화면(UI) 조작을 쉽게 이해할 수 있도록 안내합니다.
 */
export function StreamHudGuideSheet({ isOpen, onClose, context }: StreamHudGuideSheetProps) {
  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="화면 도움말"
      initialHeight={0.75}
      minHeight={0.45}
      maxHeight={0.9}
      zIndex={10050}
    >
      <div className="px-4 pb-6 space-y-3">
        <GuideCard title="화면 집중 모드 (UI 숨김)">
          우측 상단의 <strong>눈 버튼</strong>으로 상단/하단 UI를 숨겨서 방송 화면을 더 넓게 볼 수 있어요.
          <br />
          숨긴 상태에서도 같은 버튼으로 다시 UI를 표시할 수 있어요.
        </GuideCard>

        <GuideCard title="채팅 보기/닫기">
          하단의 <strong>채팅 버튼</strong>으로 채팅을 열고 닫을 수 있어요.
          <br />
          방송 화면을 가리지 않도록 채팅은 모바일에서 더 컴팩트하게 표시돼요.
        </GuideCard>

        {context === 'video-room' && (
          <GuideCard title="PC 화면: 우측 패널 숨기기">
            PC에서는 우측의 <strong>정보/채팅 패널</strong>을 숨겨서 영상 영역을 넓게 볼 수 있어요.
          </GuideCard>
        )}

        {context === 'webrtc-broadcast' && (
          <GuideCard title="브라우저 방송 팁">
            화면 하단의 <strong>컨트롤 바</strong>에서 마이크/카메라, 카메라 전환, 좌우 반전, 방송 시작/종료를 조작할 수 있어요.
            <br />
            <strong>전체/꽉채움</strong> 버튼으로 화면이 잘려 보이는(배율이 높아 보이는) 느낌을 조절할 수 있어요.
          </GuideCard>
        )}

        <div className="pt-1 text-xs text-gray-400">
          안내: UI 숨김은 시청자 화면에는 영향을 주지 않고, 현재 내 화면에만 적용돼요.
        </div>
      </div>
    </SlideSheet>
  )
}


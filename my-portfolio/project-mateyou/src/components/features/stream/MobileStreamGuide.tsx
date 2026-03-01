/**
 * MobileStreamGuide - 모바일 라이브 방송 시작 가이드
 * 
 * PRISM Live Studio 모바일 앱 사용법을 단계별로 안내합니다.
 * 브라우저에서 직접 WebRTC로 방송하는 옵션도 제공합니다.
 * 처음 방송하는 사용자도 쉽게 따라할 수 있도록 상세하게 설명합니다.
 */

import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Typography } from '@/components/ui/Typography'
import { Button } from '@/components/ui/Button'
import { 
  ChevronDown, 
  ChevronRight,
  Copy, 
  Check, 
  Download, 
  Settings,
  Smartphone,
  Play,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Wifi,
  Key,
  Camera,
  Mic,
  Globe,
  Radio,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

interface MobileStreamGuideProps {
  roomId?: string // WebRTC 방송 시 사용
  streamKey?: string
  streamKeyMasked?: string
  showStreamKeySection?: boolean
  showWebRTCOption?: boolean // 브라우저 방송 옵션 표시 여부
  className?: string
  defaultExpanded?: boolean
}

interface StepProps {
  stepNumber: number
  title: string
  children: React.ReactNode
  isCompleted?: boolean
}

function Step({ stepNumber, title, children, isCompleted }: StepProps) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className={`
          w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
          ${isCompleted ? 'bg-green-500 text-white' : 'bg-pink-500 text-white'}
        `}>
          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : stepNumber}
        </div>
        <span className="font-medium text-[#110f1a] flex-1 text-left">{title}</span>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 py-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

export function MobileStreamGuide({ 
  roomId,
  streamKey, 
  streamKeyMasked,
  showStreamKeySection = true,
  showWebRTCOption = true,
  className = '',
  defaultExpanded = false,
}: MobileStreamGuideProps) {
  const navigate = useNavigate()
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isGuideExpanded, setIsGuideExpanded] = useState(defaultExpanded)
  const [selectedMethod, setSelectedMethod] = useState<'webrtc' | 'rtmp'>('webrtc')

  // RTMP 서버 URL
  const RTMP_SERVER = 'rtmp://stream.mateyou.me:1935/live'

  // WebRTC 방송 시작
  const handleStartWebRTCBroadcast = () => {
    if (!roomId) {
      toast.error('방 ID가 없습니다')
      return
    }
    navigate({ to: '/stream/video/webrtc-broadcast/$roomId', params: { roomId } })
  }

  // 클립보드 복사
  const handleCopy = useCallback(async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      toast.success(`${fieldName} 복사됨`)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('복사에 실패했습니다')
    }
  }, [])

  // 복사 버튼 컴포넌트
  const CopyButton = ({ text, fieldName }: { text: string; fieldName: string }) => (
    <button
      onClick={() => handleCopy(text, fieldName)}
      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      title="복사"
    >
      {copiedField === fieldName ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  )

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 가이드 토글 헤더 */}
      <button
        type="button"
        onClick={() => setIsGuideExpanded(!isGuideExpanded)}
        className="w-full p-4 bg-gradient-to-r from-pink-50 to-orange-50 border border-pink-200 rounded-xl flex items-center gap-3 hover:from-pink-100 hover:to-orange-100 transition-colors"
      >
        <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <Typography variant="subtitle1" className="font-bold text-pink-900">
            모바일로 라이브 방송 시작하기
          </Typography>
          <Typography variant="body2" className="text-pink-700">
            PRISM Live Studio 앱 가이드 (클릭해서 {isGuideExpanded ? '접기' : '펼치기'})
          </Typography>
        </div>
        {isGuideExpanded ? (
          <ChevronDown className="w-6 h-6 text-pink-500" />
        ) : (
          <ChevronRight className="w-6 h-6 text-pink-500" />
        )}
      </button>

      {isGuideExpanded && (
        <div className="space-y-6">
          {/* 방송 방법 선택 (WebRTC 옵션이 있는 경우) */}
          {showWebRTCOption && roomId && (
            <div className="space-y-3">
              <Typography variant="subtitle2" className="font-semibold">
                방송 방법 선택
              </Typography>
              
              <div className="grid grid-cols-2 gap-3">
                {/* WebRTC 브라우저 방송 */}
                <button
                  type="button"
                  onClick={() => setSelectedMethod('webrtc')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'webrtc'
                      ? 'border-pink-500 bg-pink-50'
                      : 'border-gray-200 bg-white hover:border-pink-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-5 h-5 text-pink-500" />
                    <span className="font-semibold text-sm">브라우저 방송</span>
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">추천</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    앱 설치 없이 바로 방송 시작
                  </p>
                </button>

                {/* RTMP 앱 방송 */}
                <button
                  type="button"
                  onClick={() => setSelectedMethod('rtmp')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'rtmp'
                      ? 'border-pink-500 bg-pink-50'
                      : 'border-gray-200 bg-white hover:border-pink-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone className="w-5 h-5 text-blue-500" />
                    <span className="font-semibold text-sm">앱으로 방송</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    PRISM Live 앱 사용
                  </p>
                </button>
              </div>

              {/* WebRTC 방송 시작 버튼 */}
              {selectedMethod === 'webrtc' && (
                <div className="p-4 bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <Typography variant="subtitle2" className="font-bold text-pink-900">
                        브라우저에서 바로 방송하기
                      </Typography>
                      <Typography variant="body2" className="text-pink-700 mt-1 mb-3">
                        앱 설치 없이 카메라와 마이크로 바로 방송을 시작하세요!
                        시청자들은 HLS로 안정적으로 시청합니다.
                      </Typography>
                      <Button
                        onClick={handleStartWebRTCBroadcast}
                        className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
                      >
                        <Radio className="w-4 h-4 mr-2" />
                        브라우저 방송 시작
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-pink-200">
                    <div className="flex flex-wrap gap-2 text-xs text-pink-700">
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" /> 카메라 필요
                      </span>
                      <span className="flex items-center gap-1">
                        <Mic className="w-3 h-3" /> 마이크 필요
                      </span>
                      <span className="flex items-center gap-1">
                        <Wifi className="w-3 h-3" /> 안정적인 인터넷
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RTMP 앱 방송 가이드 (RTMP 선택 시 또는 WebRTC 옵션이 없는 경우) */}
          {(selectedMethod === 'rtmp' || !showWebRTCOption || !roomId) && (
            <>
              {/* 앱 소개 */}
              <div className="p-4 bg-pink-50 border border-pink-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🔮</div>
                  <div>
                    <Typography variant="subtitle2" className="text-pink-900 font-semibold">
                      PRISM Live Studio
                    </Typography>
                    <Typography variant="body2" className="text-pink-700 mt-1">
                      네이버에서 개발한 무료 방송 앱입니다. iOS/Android 모두 지원하며, 
                      간편하게 스마트폰으로 고화질 라이브 방송이 가능합니다.
                    </Typography>
                  </div>
                </div>
              </div>

          {/* 단계별 가이드 */}
          <div className="space-y-4">
            {/* STEP 1: 앱 다운로드 */}
            <Step stepNumber={1} title="PRISM Live Studio 앱 다운로드">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <p className="text-sm text-blue-800 font-medium">
                      스마트폰에서 앱스토어를 열고 "PRISM Live Studio"를 검색하세요.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href="https://apps.apple.com/kr/app/prism-live-studio/id1319056339"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        App Store (iOS)
                      </a>
                      <a
                        href="https://play.google.com/store/apps/details?id=com.naver.prism"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Google Play (Android)
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </Step>

            {/* STEP 2: 앱 초기 설정 */}
            <Step stepNumber={2} title="앱 실행 및 권한 허용">
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                <div>
                  <Typography variant="body2" className="font-semibold mb-2">앱 실행 후 권한 허용:</Typography>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <Camera className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span><strong>카메라 권한</strong> - 방송 영상 촬영에 필요</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Mic className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span><strong>마이크 권한</strong> - 방송 음성 녹음에 필요</span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <Typography variant="body2" className="font-semibold mb-2">로그인 (선택):</Typography>
                  <p className="text-sm text-gray-600">
                    네이버/구글 계정으로 로그인하면 설정이 저장됩니다. 
                    로그인 없이도 "커스텀 RTMP" 방송은 가능합니다.
                  </p>
                </div>
              </div>
            </Step>

            {/* STEP 3: 커스텀 RTMP 설정 */}
            <Step stepNumber={3} title="커스텀 RTMP 방송 설정">
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                <div>
                  <Typography variant="body2" className="font-semibold mb-2">RTMP 방송 모드 선택:</Typography>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                    <li>앱 하단의 <strong>"방송"</strong> 또는 <strong>"LIVE"</strong> 버튼 탭</li>
                    <li><strong>"커스텀 RTMP"</strong> 선택 (다른 플랫폼 아이콘들 아래)</li>
                    <li>서버 URL과 스트림 키 입력 화면이 나타남</li>
                  </ol>
                </div>
              </div>

              {/* 서버 URL */}
              <div>
                <label className="text-sm text-gray-600 block mb-2 font-medium flex items-center gap-2">
                  <Wifi className="w-4 h-4" />
                  서버 URL (RTMP URL)
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm font-mono break-all">
                    {RTMP_SERVER}
                  </code>
                  <CopyButton text={RTMP_SERVER} fieldName="서버 URL" />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  💡 복사 버튼을 눌러 복사한 후 앱에 붙여넣기하세요
                </p>
              </div>

              {/* 스트림 키 */}
              <div>
                <label className="text-sm text-gray-600 block mb-2 font-medium flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  스트림 키 (Stream Key)
                </label>
                {streamKey ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm font-mono break-all">
                      {streamKey}
                    </code>
                    <CopyButton text={streamKey} fieldName="스트림 키" />
                  </div>
                ) : streamKeyMasked ? (
                  <div className="space-y-2">
                    <div className="px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-sm font-mono text-gray-500">
                      {streamKeyMasked}
                    </div>
                    <p className="text-xs text-gray-500">
                      보안을 위해 스트림 키가 마스킹되어 있습니다. 원본 키를 분실한 경우 재발급하세요.
                    </p>
                  </div>
                ) : showStreamKeySection ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      스트림 키는 파트너 대시보드에서 생성/확인할 수 있습니다.
                    </p>
                    <a
                      href="/dashboard/partner?tab=stream"
                      className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      스트림 키 관리로 이동
                    </a>
                  </div>
                ) : (
                  <div className="px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500">
                    스트림 키를 먼저 생성해주세요.
                  </div>
                )}
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-red-800 font-medium">스트림 키 보안 주의</p>
                    <p className="text-xs text-red-700 mt-1">
                      스트림 키는 비밀번호처럼 안전하게 보관하세요. 유출 시 즉시 재발급하세요.
                    </p>
                  </div>
                </div>
              </div>
            </Step>

            {/* STEP 4: 방송 품질 설정 */}
            <Step stepNumber={4} title="방송 품질 설정 (선택)">
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                <div>
                  <Typography variant="body2" className="font-semibold mb-2">권장 설정:</Typography>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span><strong>해상도:</strong> 720p (1280x720) 권장</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span><strong>프레임:</strong> 30fps 권장</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span><strong>비트레이트:</strong> 2000~3000 Kbps (모바일 데이터는 낮게)</span>
                    </li>
                  </ul>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800">
                    💡 <strong>팁:</strong> Wi-Fi 환경에서 방송하면 더 안정적입니다. 
                    모바일 데이터 사용 시 데이터 요금이 발생할 수 있습니다.
                  </p>
                </div>
              </div>
            </Step>

            {/* STEP 5: 방송 시작 */}
            <Step stepNumber={5} title="방송 시작하기">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Play className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-green-800 font-medium mb-2">
                      모든 설정이 완료되었습니다!
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-green-700">
                      <li>앱 화면의 <strong>"방송 시작"</strong> 버튼 탭</li>
                      <li>MateYou 앱에서 방송 상태가 "연결됨"으로 변경되는지 확인</li>
                      <li>시청자들이 내 방송을 볼 수 있습니다!</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Typography variant="body2" className="font-medium text-blue-800 mb-2">
                  💡 방송 종료 방법
                </Typography>
                <p className="text-sm text-blue-700">
                  앱에서 "방송 종료" 버튼을 탭하면 방송이 종료됩니다.
                </p>
              </div>
            </Step>

            {/* 문제 해결 */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <details className="group">
                <summary className="w-full px-4 py-3 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer list-none">
                  <div className="w-7 h-7 bg-gray-400 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium text-[#110f1a] flex-1 text-left">모바일 방송 FAQ</span>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-4 py-4 space-y-4">
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 방송이 연결되지 않아요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      서버 URL과 스트림 키를 다시 확인하세요. 복사/붙여넣기 시 앞뒤 공백이 들어갔을 수 있습니다.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 방송이 자꾸 끊겨요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      Wi-Fi 환경에서 방송하거나, 비트레이트를 낮춰보세요 (1500~2000 Kbps).
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 화면이 세로로 나와요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      스마트폰을 가로로 돌리면 가로 화면으로 방송됩니다. 앱 설정에서 화면 방향을 고정할 수도 있습니다.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 배터리가 빨리 닳아요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      라이브 방송은 배터리 소모가 큽니다. 충전하면서 방송하거나, 화면 밝기를 낮추세요.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 휴대폰이 뜨거워져요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      정상입니다. 케이스를 벗기고, 시원한 곳에서 방송하면 도움이 됩니다. 너무 뜨거우면 잠시 쉬었다가 하세요.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default MobileStreamGuide

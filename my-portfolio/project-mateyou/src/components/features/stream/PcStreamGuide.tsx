/**
 * PcStreamGuide - PC 라이브 방송 시작 가이드
 * 
 * OBS Studio / PRISM Live Studio 사용법을 단계별로 안내합니다.
 * 처음 방송하는 사용자도 쉽게 따라할 수 있도록 상세하게 설명합니다.
 */

import { useState, useCallback } from 'react'
import { Typography } from '@/components/ui/Typography'
import { 
  ChevronDown, 
  ChevronRight,
  Copy, 
  Check, 
  Download, 
  Settings,
  Monitor,
  Mic,
  Video,
  Play,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Wifi,
  Key,
} from 'lucide-react'
import { toast } from 'sonner'

interface PcStreamGuideProps {
  streamKey?: string
  streamKeyMasked?: string
  showStreamKeySection?: boolean
  className?: string
  defaultExpanded?: boolean
}

type SoftwareType = 'obs' | 'prism'

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
          ${isCompleted ? 'bg-green-500 text-white' : 'bg-purple-500 text-white'}
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

export function PcStreamGuide({ 
  streamKey, 
  streamKeyMasked,
  showStreamKeySection = true, 
  className = '',
  defaultExpanded = false,
}: PcStreamGuideProps) {
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareType>('obs')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isGuideExpanded, setIsGuideExpanded] = useState(defaultExpanded)

  // RTMP 서버 URL
  const RTMP_SERVER = 'rtmp://stream.mateyou.me:1935/live'

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

  // 소프트웨어 정보
  const softwareInfo = {
    obs: {
      name: 'OBS Studio',
      downloadUrl: 'https://obsproject.com/ko/download',
      logo: '🎬',
      description: '무료 오픈소스 방송 소프트웨어, 전 세계에서 가장 많이 사용',
    },
    prism: {
      name: 'PRISM Live Studio',
      downloadUrl: 'https://prismlive.com/ko_kr/download/',
      logo: '🔮',
      description: '네이버 개발, 한국어 지원 우수, 초보자 친화적 인터페이스',
    },
  }

  const currentSoftware = softwareInfo[selectedSoftware]

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 가이드 토글 헤더 */}
      <button
        type="button"
        onClick={() => setIsGuideExpanded(!isGuideExpanded)}
        className="w-full p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl flex items-center gap-3 hover:from-purple-100 hover:to-pink-100 transition-colors"
      >
        <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
          <Monitor className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <Typography variant="subtitle1" className="font-bold text-purple-900">
            PC로 라이브 방송 시작하기
          </Typography>
          <Typography variant="body2" className="text-purple-700">
            OBS / PRISM 설정 가이드 (클릭해서 {isGuideExpanded ? '접기' : '펼치기'})
          </Typography>
        </div>
        {isGuideExpanded ? (
          <ChevronDown className="w-6 h-6 text-purple-500" />
        ) : (
          <ChevronRight className="w-6 h-6 text-purple-500" />
        )}
      </button>

      {isGuideExpanded && (
        <div className="space-y-6">
          {/* 소프트웨어 선택 */}
          <div>
            <Typography variant="subtitle2" className="mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              방송 프로그램 선택
            </Typography>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(softwareInfo) as SoftwareType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedSoftware(key)}
                  className={`
                    p-4 rounded-xl border-2 transition-all text-left
                    ${selectedSoftware === key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  <div className="text-2xl mb-2">{softwareInfo[key].logo}</div>
                  <div className="font-semibold text-[#110f1a]">{softwareInfo[key].name}</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {softwareInfo[key].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 단계별 가이드 */}
          <div className="space-y-4">
            {/* STEP 1: 프로그램 다운로드 및 설치 */}
            <Step stepNumber={1} title={`${currentSoftware.name} 다운로드 및 설치`}>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 font-medium mb-2">
                      {currentSoftware.name}을(를) 아직 설치하지 않으셨다면 아래 링크에서 다운로드하세요.
                    </p>
                    <a
                      href={currentSoftware.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {currentSoftware.name} 다운로드
                    </a>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="font-medium mb-2">설치 방법:</Typography>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                  <li>다운로드한 설치 파일을 실행합니다</li>
                  <li>설치 마법사의 안내에 따라 "다음"을 클릭합니다</li>
                  <li>설치가 완료되면 프로그램을 실행합니다</li>
                </ol>
              </div>
            </Step>

            {/* STEP 2: 방송 기본 설정 */}
            <Step stepNumber={2} title="방송 기본 설정 (처음 사용자)">
              {selectedSoftware === 'obs' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800">
                        처음 OBS를 실행하면 "자동 구성 마법사"가 나타납니다. 아래 설정을 권장합니다.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <div>
                      <Typography variant="body2" className="font-semibold mb-2">자동 구성 마법사 설정:</Typography>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>"방송 최적화" 선택</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>해상도: <strong>1280x720 (720p)</strong> 권장</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>FPS: <strong>30</strong> 권장</span>
                        </li>
                      </ul>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                      <Typography variant="body2" className="font-semibold mb-2">수동 설정 (설정 &gt; 출력):</Typography>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span><strong>인코더:</strong> 하드웨어(NVENC) 권장, 없으면 x264</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span><strong>비트레이트:</strong> 2500~4000 Kbps 권장</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span><strong>키프레임 간격:</strong> 2초</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Typography variant="body2" className="font-semibold mb-2 flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      화면 소스 추가하기:
                    </Typography>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                      <li>하단 "소스" 패널에서 + 버튼 클릭</li>
                      <li>"화면 캡처" 또는 "게임 캡처" 선택</li>
                      <li>방송할 화면/게임 선택 후 확인</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Typography variant="body2" className="font-semibold mb-2 flex items-center gap-2">
                      <Mic className="w-4 h-4" />
                      마이크 설정:
                    </Typography>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                      <li>하단 "오디오 믹서"에서 마이크가 보이는지 확인</li>
                      <li>마이크에 말할 때 초록색 레벨이 움직이면 정상</li>
                      <li>안 움직이면: 설정 &gt; 오디오 &gt; 마이크 장치 확인</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800">
                        PRISM은 처음 실행 시 자동으로 초기 설정을 안내합니다. 아래 내용을 참고하세요.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <div>
                      <Typography variant="body2" className="font-semibold mb-2">초기 설정:</Typography>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>프로그램 실행 후 "커스텀 RTMP" 모드 선택</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>해상도: <strong>1280x720 (720p)</strong> 권장</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>프레임 속도: <strong>30fps</strong> 권장</span>
                        </li>
                      </ul>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                      <Typography variant="body2" className="font-semibold mb-2">방송 품질 설정 (설정 &gt; 방송):</Typography>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span><strong>품질:</strong> 고화질 또는 표준 선택</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Settings className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span><strong>비트레이트:</strong> 2500~4000 Kbps 권장</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Typography variant="body2" className="font-semibold mb-2 flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      화면 소스 추가하기:
                    </Typography>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                      <li>좌측 "소스" 패널에서 + 버튼 클릭</li>
                      <li>"화면 공유" 또는 "게임 캡처" 선택</li>
                      <li>캡처할 화면/창 선택 후 추가</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Typography variant="body2" className="font-semibold mb-2 flex items-center gap-2">
                      <Mic className="w-4 h-4" />
                      마이크 설정:
                    </Typography>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                      <li>하단 오디오 믹서에서 마이크 확인</li>
                      <li>말할 때 레벨 바가 움직이면 정상</li>
                      <li>설정 &gt; 오디오에서 마이크 장치 변경 가능</li>
                    </ol>
                  </div>
                </div>
              )}
            </Step>

            {/* STEP 3: 서버 및 스트림 키 설정 */}
            <Step stepNumber={3} title="서버 URL 및 스트림 키 입력">
              {selectedSoftware === 'obs' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Typography variant="body2" className="font-semibold mb-3">OBS 방송 설정 경로:</Typography>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                      <code className="px-2 py-1 bg-white border border-gray-200 rounded">설정</code>
                      <ChevronRight className="w-4 h-4" />
                      <code className="px-2 py-1 bg-white border border-gray-200 rounded">방송</code>
                    </div>
                    
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-start gap-2">
                        <span className="font-medium text-gray-700">서비스:</span>
                        <span>"사용자 지정..." 선택</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Typography variant="body2" className="font-semibold mb-3">PRISM 방송 설정 경로:</Typography>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                      <code className="px-2 py-1 bg-white border border-gray-200 rounded">설정</code>
                      <ChevronRight className="w-4 h-4" />
                      <code className="px-2 py-1 bg-white border border-gray-200 rounded">방송</code>
                      <ChevronRight className="w-4 h-4" />
                      <code className="px-2 py-1 bg-white border border-gray-200 rounded">커스텀 RTMP</code>
                    </div>
                    
                    <p className="text-sm text-gray-600">
                      또는 메인 화면에서 "커스텀 RTMP" 버튼을 클릭하세요.
                    </p>
                  </div>
                </div>
              )}

              {/* 서버 URL */}
              <div>
                <label className="text-sm text-gray-600 block mb-2 font-medium flex items-center gap-2">
                  <Wifi className="w-4 h-4" />
                  서버 URL (Server)
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm font-mono">
                    {RTMP_SERVER}
                  </code>
                  <CopyButton text={RTMP_SERVER} fieldName="서버 URL" />
                </div>
              </div>

              {/* 스트림 키 */}
              <div>
                <label className="text-sm text-gray-600 block mb-2 font-medium flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  스트림 키 (Stream Key)
                </label>
                {streamKey ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm font-mono">
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
                      className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
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
                      스트림 키는 비밀번호처럼 안전하게 보관하세요. 다른 사람에게 노출되면 다른 사람이 내 채널로 방송할 수 있습니다. 유출 시 즉시 재발급하세요.
                    </p>
                  </div>
                </div>
              </div>
            </Step>

            {/* STEP 4: 방송 시작 */}
            <Step stepNumber={4} title="방송 시작하기">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Play className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-green-800 font-medium mb-2">
                      모든 설정이 완료되었습니다!
                    </p>
                    {selectedSoftware === 'obs' ? (
                      <ol className="list-decimal list-inside space-y-1 text-sm text-green-700">
                        <li>OBS 우측 하단의 <strong>"방송 시작"</strong> 버튼 클릭</li>
                        <li>MateYou 앱에서 방송 상태가 "연결됨"으로 변경되는지 확인</li>
                        <li>시청자들이 내 방송을 볼 수 있습니다!</li>
                      </ol>
                    ) : (
                      <ol className="list-decimal list-inside space-y-1 text-sm text-green-700">
                        <li>PRISM 하단의 <strong>"방송 시작"</strong> 버튼 클릭</li>
                        <li>MateYou 앱에서 방송 상태가 "연결됨"으로 변경되는지 확인</li>
                        <li>시청자들이 내 방송을 볼 수 있습니다!</li>
                      </ol>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Typography variant="body2" className="font-medium text-blue-800 mb-2">
                  💡 방송 종료 방법
                </Typography>
                <p className="text-sm text-blue-700">
                  {selectedSoftware === 'obs' 
                    ? 'OBS에서 "방송 중단" 버튼을 클릭하면 방송이 종료됩니다.'
                    : 'PRISM에서 "방송 종료" 버튼을 클릭하면 방송이 종료됩니다.'
                  }
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
                  <span className="font-medium text-[#110f1a] flex-1 text-left">문제 해결 (FAQ)</span>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-4 py-4 space-y-4">
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 방송이 시작되지 않아요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      서버 URL과 스트림 키가 정확히 입력되었는지 확인하세요. 특히 앞뒤 공백이 없는지 체크하세요.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 화면이 안 나와요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      소스가 추가되어 있는지 확인하세요. 화면 캡처 또는 게임 캡처 소스를 추가해야 합니다.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 소리가 안 들려요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      오디오 믹서에서 마이크/데스크톱 오디오가 음소거되어 있지 않은지 확인하세요.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 방송이 끊겨요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      비트레이트를 낮춰보세요 (2000~3000 Kbps). 인터넷 속도가 느리면 방송이 불안정할 수 있습니다.
                    </p>
                  </div>
                  
                  <div>
                    <Typography variant="body2" className="font-semibold text-gray-800 mb-1">
                      Q: 화질이 안 좋아요
                    </Typography>
                    <p className="text-sm text-gray-600">
                      비트레이트를 높이거나 (4000~6000 Kbps) 인코더를 하드웨어(NVENC/QuickSync)로 변경해보세요.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PcStreamGuide

/**
 * StreamKeyManager - 스트림 키 관리 컴포넌트
 * 
 * 파트너가 자신의 스트림 키를 생성/조회/재발급할 수 있습니다.
 * 보안: 키는 마스킹되어 표시되고, 세션 토큰을 사용하여 방송합니다.
 */

import { useState, useCallback } from 'react'
import { 
  useStreamKey, 
  useCreateStreamKey, 
  useRefreshStreamKey,
  useStartStreamSession,
} from '@/hooks/useHlsStream'
import { 
  Key, 
  RefreshCw, 
  Copy, 
  Check, 
  AlertTriangle, 
  Eye,
  EyeOff,
  Clock,
} from 'lucide-react'
import { PcStreamGuide } from './PcStreamGuide'
import { MobileStreamGuide } from './MobileStreamGuide'
import { toast } from 'sonner'

interface StreamKeyManagerProps {
  partnerId: string
  className?: string
}

export function StreamKeyManager({ partnerId, className = '' }: StreamKeyManagerProps) {
  const { data: keyData, isLoading: isKeyLoading } = useStreamKey(partnerId)
  const createKey = useCreateStreamKey()
  const refreshKey = useRefreshStreamKey()
  const startSession = useStartStreamSession()
  
  // 새로 생성된 키 (한 번만 표시)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // 방송 세션 정보
  const [sessionInfo, setSessionInfo] = useState<{
    rtmpUrl: string
    expiresAt: Date
  } | null>(null)

  // 키 생성
  const handleCreateKey = useCallback(async () => {
    try {
      const result = await createKey.mutateAsync(partnerId)
      setNewlyCreatedKey(result.stream_key)
      setShowKey(true)
      toast.success('스트림 키가 생성되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '스트림 키 생성 실패')
    }
  }, [partnerId, createKey])

  // 키 재발급
  const handleRefreshKey = useCallback(async () => {
    if (!confirm('스트림 키를 재발급하면 기존 키는 더 이상 사용할 수 없습니다. 계속하시겠습니까?')) {
      return
    }
    
    try {
      const result = await refreshKey.mutateAsync(partnerId)
      setNewlyCreatedKey(result.stream_key)
      setShowKey(true)
      toast.success('스트림 키가 재발급되었습니다')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '스트림 키 재발급 실패')
    }
  }, [partnerId, refreshKey])

  // 방송 세션 시작 (임시 토큰 발급)
  const handleStartSession = useCallback(async () => {
    try {
      const result = await startSession.mutateAsync(partnerId)
      setSessionInfo({
        rtmpUrl: result.rtmp_url,
        expiresAt: new Date(result.expires_at),
      })
      toast.success('방송 세션이 시작되었습니다. 30분 내에 OBS에서 방송을 시작하세요.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '방송 세션 시작 실패')
    }
  }, [partnerId, startSession])

  // 클립보드 복사
  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`${label} 복사됨`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사 실패')
    }
  }, [])

  // 로딩
  if (isKeyLoading) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg animate-pulse ${className}`}>
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-10 bg-gray-200 rounded" />
      </div>
    )
  }

  return (
    <div className={`p-4 bg-gray-50 rounded-lg space-y-4 ${className}`}>
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Key className="w-5 h-5 text-purple-500" />
        스트림 키 관리
      </h3>

      {/* 키가 없는 경우 */}
      {!keyData && !newlyCreatedKey && (
        <div className="text-center py-6">
          <Key className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">
            아직 스트림 키가 없습니다.<br />
            OBS로 방송하려면 스트림 키를 생성하세요.
          </p>
          <button
            onClick={handleCreateKey}
            disabled={createKey.isPending}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
          >
            {createKey.isPending ? '생성 중...' : '스트림 키 생성'}
          </button>
        </div>
      )}

      {/* 새로 생성된 키 (한 번만 표시) */}
      {newlyCreatedKey && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 font-medium">스트림 키가 생성되었습니다!</p>
              <p className="text-amber-600 text-sm">
                이 키는 지금만 볼 수 있습니다. 안전한 곳에 저장해주세요.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-white border border-amber-300 rounded font-mono text-sm break-all">
              {showKey ? newlyCreatedKey : '•'.repeat(32)}
            </div>
            <button
              onClick={() => setShowKey(!showKey)}
              className="p-2 text-gray-500 hover:text-gray-700"
              title={showKey ? '숨기기' : '보기'}
            >
              {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button
              onClick={() => handleCopy(newlyCreatedKey, '스트림 키')}
              className="p-2 text-gray-500 hover:text-gray-700"
              title="복사"
            >
              {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          
          <button
            onClick={() => setNewlyCreatedKey(null)}
            className="mt-3 text-sm text-amber-600 hover:text-amber-800"
          >
            확인했습니다
          </button>
        </div>
      )}

      {/* 기존 키 정보 */}
      {keyData && !newlyCreatedKey && (
        <div className="space-y-4">
          {/* 마스킹된 키 */}
          <div>
            <label className="text-sm text-gray-500 block mb-1">스트림 키</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-white border border-gray-200 rounded font-mono text-sm">
                {keyData.stream_key_masked}
              </div>
              <button
                onClick={handleRefreshKey}
                disabled={refreshKey.isPending}
                className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                title="재발급"
              >
                <RefreshCw className={`w-5 h-5 ${refreshKey.isPending ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              보안을 위해 키가 마스킹되어 표시됩니다. 원본 키를 분실한 경우 재발급하세요.
            </p>
          </div>

          {/* RTMP 서버 */}
          <div>
            <label className="text-sm text-gray-500 block mb-1">RTMP 서버</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-white border border-gray-200 rounded font-mono text-sm">
                rtmp://stream.mateyou.me:1935/live
              </div>
              <button
                onClick={() => handleCopy('rtmp://stream.mateyou.me:1935/live', 'RTMP 서버')}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="복사"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 마지막 사용 */}
          {keyData.last_used_at && (
            <p className="text-xs text-gray-400">
              마지막 사용: {new Date(keyData.last_used_at).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      )}

      {/* PC 방송 가이드 */}
      {(keyData || newlyCreatedKey) && (
        <div className="pt-4 border-t border-gray-200 space-y-4">
          {/* PC 방송 가이드 */}
          <PcStreamGuide 
            streamKey={newlyCreatedKey || undefined}
            streamKeyMasked={keyData?.stream_key_masked}
            showStreamKeySection={false}
            defaultExpanded={false}
          />

          {/* 모바일 방송 가이드 */}
          <MobileStreamGuide 
            streamKey={newlyCreatedKey || undefined}
            streamKeyMasked={keyData?.stream_key_masked}
            showStreamKeySection={false}
            defaultExpanded={false}
          />

          {/* 고급 보안 옵션 (선택사항) */}
          <details>
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              🔒 고급 보안 옵션 (선택사항)
            </summary>
            <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700 mb-3">
                스트림 키 노출이 걱정된다면, 30분간 유효한 임시 토큰을 사용할 수 있습니다.
              </p>
              
              {sessionInfo ? (
                <div className="p-3 bg-white border border-blue-300 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700 font-medium">
                      세션 유효: {Math.max(0, Math.floor((sessionInfo.expiresAt.getTime() - Date.now()) / 60000))}분 남음
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-gray-50 rounded text-xs break-all">
                      {sessionInfo.rtmpUrl}
                    </code>
                    <button
                      onClick={() => handleCopy(sessionInfo.rtmpUrl, '임시 URL')}
                      className="p-1 text-blue-600"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleStartSession}
                  disabled={startSession.isPending}
                  className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {startSession.isPending ? '발급 중...' : '임시 토큰 발급'}
                </button>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

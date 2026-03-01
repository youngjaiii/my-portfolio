/**
 * HLS 방송 리허설 페이지
 * 호스트가 OBS로 RTMP 연결 후 방송을 시작하는 준비 화면
 */

import { HlsVideoPlayer } from '@/components/features/stream/HlsVideoPlayer'
import { PcStreamGuide } from '@/components/features/stream/PcStreamGuide'
import { MobileStreamGuide } from '@/components/features/stream/MobileStreamGuide'
import { Button } from '@/components/ui/Button'
import { Typography } from '@/components/ui/Typography'
import { useAuth } from '@/hooks/useAuth'
import { getHlsUrlByPartner, useRoomHlsUrl } from '@/hooks/useHlsStream'
import { useVoiceRoom } from '@/hooks/useVoiceRoom'
import { edgeApi } from '@/lib/edgeApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Radio,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/stream/video/hls-rehearsal/$roomId')({
  component: HlsRehearsalPage,
})

function HlsRehearsalPage() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // 방 정보 조회
  const { room, isLoading: isRoomLoading, isHost, joinRoom } = useVoiceRoom(roomId)

  // HLS URL 조회 (RTMP 연결 상태 확인용)
  const { data: hlsUrl, isLoading: isHlsLoading, refetch: refetchHls } = useRoomHlsUrl(roomId)

  // HLS 방송은 RTMP 서버에서 방송 상태를 관리하므로 하트비트 불필요

  // RTMP 연결 상태
  const [isRtmpConnected, setIsRtmpConnected] = useState(false)
  const [connectionCheckCount, setConnectionCheckCount] = useState(0)
  const [hasJoined, setHasJoined] = useState(false)

  // 방 입장 (호스트로)
  useEffect(() => {
    if (!room || hasJoined || !user || !isHost) return

    const autoJoin = async () => {
      try {
        await joinRoom(room.password || undefined)
        setHasJoined(true)
      } catch (err) {
        console.error('방 입장 실패:', err)
        toast.error('방 입장에 실패했습니다')
      }
    }

    autoJoin()
  }, [room, hasJoined, user, isHost, joinRoom])

  // 마지막으로 확인된 m3u8 파일 내용 (변경 감지용)
  const [lastM3u8Content, setLastM3u8Content] = useState<string | null>(null)
  // 연속으로 m3u8 내용이 동일한 횟수 (스트림 중단 감지)
  const [unchangedCount, setUnchangedCount] = useState(0)

  // RTMP 연결 상태 주기적 체크
  // m3u8 파일 내용이 실제로 변경되는지 확인하여 스트림 활성 상태 판단
  useEffect(() => {
    if (!room?.host_partner_id) return

    const checkConnection = async () => {
      try {
        // 파트너 ID 기반 HLS URL로 체크 (캐시 무효화)
        const testUrl = getHlsUrlByPartner(room.host_partner_id)
        const response = await fetch(`${testUrl}?_t=${Date.now()}`, { 
          method: 'GET',
          cache: 'no-store',
        })
        
        if (response.ok) {
          const content = await response.text()
          
          // m3u8 내용이 변경되었는지 확인
          if (lastM3u8Content === null) {
            // 첫 번째 체크: 파일이 존재하면 일단 연결 대기 상태
            setLastM3u8Content(content)
            setUnchangedCount(0)
            // 첫 체크에서는 연결됨으로 표시하지 않음 (다음 체크에서 변경 확인 필요)
          } else if (content !== lastM3u8Content) {
            // 내용이 변경됨 = 스트림이 활성 상태
            setLastM3u8Content(content)
            setUnchangedCount(0)
            setIsRtmpConnected(true)
            refetchHls()
          } else {
            // 내용이 동일함 = 스트림이 중단되었을 가능성
            setUnchangedCount(prev => prev + 1)
            // 연속 3회(15초) 동안 변경 없으면 연결 해제로 판단
            if (unchangedCount >= 2) {
              setIsRtmpConnected(false)
            }
          }
        } else {
          // 파일이 없음 = 스트림이 시작되지 않음
          setIsRtmpConnected(false)
          setLastM3u8Content(null)
          setUnchangedCount(0)
        }
      } catch {
        setIsRtmpConnected(false)
        setLastM3u8Content(null)
        setUnchangedCount(0)
      }
      setConnectionCheckCount(prev => prev + 1)
    }

    // 초기 체크
    checkConnection()

    // 5초마다 체크
    const interval = setInterval(checkConnection, 5000)
    return () => clearInterval(interval)
  }, [room?.host_partner_id, refetchHls, lastM3u8Content, unchangedCount])

  // 방송 시작 mutation
  const startBroadcast = useMutation({
    mutationFn: async () => {
      const response = await edgeApi.stream.startBroadcast(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방송 시작에 실패했습니다')
      }
      return response.data
    },
    onSuccess: () => {
      toast.success('방송이 시작되었습니다!')
      queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
      navigate({ to: '/stream/video/$roomId', params: { roomId } })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '방송 시작에 실패했습니다')
    },
  })

  // 방송 취소 (종료)
  const cancelBroadcast = useMutation({
    mutationFn: async () => {
      const response = await edgeApi.stream.endRoom(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방송 취소에 실패했습니다')
      }
      return response.data
    },
    onSuccess: () => {
      toast.success('방송이 취소되었습니다')
      navigate({ to: '/stream/live' })
    },
  })


  // 로딩 상태
  if (isRoomLoading) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
      </div>
    )
  }

  // 방이 없거나 호스트가 아닌 경우
  if (!room) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex flex-col items-center justify-center text-white">
        <Typography variant="h4">방을 찾을 수 없습니다</Typography>
        <Button className="mt-4" onClick={() => navigate({ to: '/stream/live' })}>
          방송 목록으로
        </Button>
      </div>
    )
  }

  if (!isHost) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex flex-col items-center justify-center text-white">
        <Typography variant="h4">호스트만 접근할 수 있습니다</Typography>
        <Button className="mt-4" onClick={() => navigate({ to: '/stream/video/$roomId', params: { roomId } })}>
          시청자로 입장
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#110f1a] text-white">
      {/* 상단 헤더 */}
      <div className="sticky top-0 z-50 bg-[#110f1a]/95 backdrop-blur border-b border-white/10">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: '/stream/live' })}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold">{room.title}</h1>
              <span className="text-sm text-white/60">리허설 모드</span>
            </div>
          </div>
          <button
            onClick={() => cancelBroadcast.mutate()}
            disabled={cancelBroadcast.isPending}
            className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/30"
          >
            <X className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* 연결 상태 표시 */}
        <div className={`p-4 rounded-xl border ${isRtmpConnected 
          ? 'bg-green-500/10 border-green-500/30' 
          : 'bg-yellow-500/10 border-yellow-500/30'}`}
        >
          <div className="flex items-center gap-3">
            {isRtmpConnected ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-green-400" />
                <div>
                  <Typography variant="body1" className="font-medium text-green-400">
                    OBS 연결됨
                  </Typography>
                  <Typography variant="body2" className="text-green-400/70">
                    방송을 시작할 준비가 되었습니다
                  </Typography>
                </div>
              </>
            ) : (
              <>
                <WifiOff className="w-6 h-6 text-yellow-400 animate-pulse" />
                <div className="flex-1">
                  <Typography variant="body1" className="font-medium text-yellow-400">
                    OBS 연결 대기 중...
                  </Typography>
                  <Typography variant="body2" className="text-yellow-400/70">
                    아래 설정으로 OBS에서 방송을 시작해주세요
                  </Typography>
                </div>
                <RefreshCw className={`w-4 h-4 text-yellow-400 ${connectionCheckCount > 0 ? 'animate-spin' : ''}`} />
              </>
            )}
          </div>
        </div>

        {/* HLS 프리뷰 (연결된 경우) */}
        {isRtmpConnected && hlsUrl && (
          <div className="aspect-video rounded-xl overflow-hidden bg-black">
            <HlsVideoPlayer
              hlsUrl={hlsUrl}
              roomTitle={room.title}
              hostName={room.host_partner?.member?.name}
              hostInitial={room.host_partner?.member?.name?.charAt(0)}
              autoPlay
              lowLatency
            />
          </div>
        )}

        {/* PC 방송 가이드 (OBS / PRISM) */}
        <div className="bg-white/5 rounded-xl p-4">
          <PcStreamGuide 
            showStreamKeySection={true}
            defaultExpanded={!isRtmpConnected}
            className="text-white [&_*]:text-white [&_.text-gray-600]:text-white/70 [&_.text-gray-500]:text-white/60 [&_.text-gray-400]:text-white/50 [&_.bg-gray-50]:bg-white/5 [&_.bg-gray-100]:bg-white/10 [&_.border-gray-200]:border-white/10 [&_.bg-white]:bg-white/10 [&_.text-\\[\\#110f1a\\]]:text-white"
          />
        </div>

        {/* 모바일 방송 가이드 (WebRTC 브라우저 방송 옵션 포함) */}
        <div className="bg-white/5 rounded-xl p-4">
          <MobileStreamGuide 
            roomId={roomId}
            showStreamKeySection={true}
            showWebRTCOption={true}
            defaultExpanded={false}
            className="text-white [&_*]:text-white [&_.text-gray-600]:text-white/70 [&_.text-gray-500]:text-white/60 [&_.text-gray-400]:text-white/50 [&_.bg-gray-50]:bg-white/5 [&_.bg-gray-100]:bg-white/10 [&_.border-gray-200]:border-white/10 [&_.bg-white]:bg-white/10 [&_.text-\\[\\#110f1a\\]]:text-white [&_.bg-pink-50]:bg-pink-500/10 [&_.border-pink-200]:border-pink-500/30 [&_.text-pink-900]:text-pink-300 [&_.text-pink-700]:text-pink-400"
          />
        </div>

        <div className="p-4 bg-white/5 rounded-xl">
          <Typography variant="body2" className="text-white/60">
            💡 방송 프로그램에서 "방송 시작"을 누르면 위 상태가 "연결됨"으로 바뀝니다.
          </Typography>
        </div>

        {/* 방송 시작 버튼 */}
        <div className="sticky bottom-4">
          <Button
            variant="primary"
            size="lg"
            className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600"
            onClick={() => startBroadcast.mutate()}
            disabled={!isRtmpConnected || startBroadcast.isPending}
          >
            {startBroadcast.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                방송 시작 중...
              </>
            ) : (
              <>
                <Radio className="w-5 h-5 mr-2" />
                {isRtmpConnected ? '방송 시작하기' : 'OBS 연결 후 시작 가능'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

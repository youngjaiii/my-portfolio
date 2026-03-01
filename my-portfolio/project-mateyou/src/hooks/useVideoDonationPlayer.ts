/**
 * 영상 도네이션 재생 훅
 * - Supabase Realtime으로 영상 재생 이벤트 브로드캐스트
 * - 모든 참여자가 동시에 영상 시청
 */

import type { StreamDonation } from '@/components/features/stream/donation/types'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

/** 영상 재생 정보 */
export interface VideoPlayInfo {
  donationId: number
  videoId: string
  videoUrl: string
  videoTitle: string | null
  videoThumbnail: string | null
  donorName: string
  donorProfileImage: string | null
  amount: number
  startTime: number // 재생 시작 시간 (초)
  duration: number // 재생 시간 (초, 기본 10초)
  startedAt: number // 브로드캐스트 시작 시간 (timestamp)
}

interface UseVideoDonationPlayerOptions {
  roomId: string | undefined
  enabled?: boolean
}

interface UseVideoDonationPlayerReturn {
  /** 현재 재생 중인 영상 정보 */
  currentVideo: VideoPlayInfo | null
  /** 영상 재생 시작 (호스트용) */
  playVideo: (donation: StreamDonation, startTime?: number) => Promise<boolean>
  /** 영상 재생 중지 */
  stopVideo: () => void
  /** 재생 중 여부 */
  isPlaying: boolean
  /** 남은 시간 (초) */
  remainingTime: number
}

// 유튜브 URL에서 비디오 ID 추출
function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// 유튜브 URL에서 시작 시간 추출 (초 단위)
// 지원 형식: ?t=30, &t=30, ?t=1m30s, ?start=30, youtu.be/xxx?t=30
function extractYoutubeStartTime(url: string): number {
  // t 파라미터 (초 또는 시분초 형식)
  const tMatch = url.match(/[?&]t=(\d+[hms]?\d*[ms]?\d*s?)/i)
  if (tMatch) {
    const timeStr = tMatch[1]
    
    // 숫자만 있는 경우 (초)
    if (/^\d+$/.test(timeStr)) {
      return parseInt(timeStr, 10)
    }
    
    // 시분초 형식 파싱 (예: 1h2m30s, 2m30s, 30s)
    let seconds = 0
    const hoursMatch = timeStr.match(/(\d+)h/i)
    const minutesMatch = timeStr.match(/(\d+)m/i)
    const secondsMatch = timeStr.match(/(\d+)s/i)
    
    if (hoursMatch) seconds += parseInt(hoursMatch[1], 10) * 3600
    if (minutesMatch) seconds += parseInt(minutesMatch[1], 10) * 60
    if (secondsMatch) seconds += parseInt(secondsMatch[1], 10)
    
    return seconds
  }
  
  // start 파라미터
  const startMatch = url.match(/[?&]start=(\d+)/i)
  if (startMatch) {
    return parseInt(startMatch[1], 10)
  }
  
  return 0
}

export function useVideoDonationPlayer({
  roomId,
  enabled = true,
}: UseVideoDonationPlayerOptions): UseVideoDonationPlayerReturn {
  const [currentVideo, setCurrentVideo] = useState<VideoPlayInfo | null>(null)
  const [remainingTime, setRemainingTime] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const isSubscribedRef = useRef(false)

  // 채널 초기화 및 구독
  useEffect(() => {
    if (!roomId || !enabled) return

    const channelName = `video-donation-${roomId}`
    const channel = supabase.channel(channelName)

    // 이벤트 핸들러 등록
    channel.on('broadcast', { event: 'play-video' }, (payload) => {
      const playInfo = payload.payload as VideoPlayInfo
      console.log('🎬 영상 도네 재생 수신:', playInfo)

      // 브로드캐스트 시점과 현재 시점 차이 계산
      const elapsed = Math.floor((Date.now() - playInfo.startedAt) / 1000)
      const adjustedDuration = Math.max(0, playInfo.duration - elapsed)

      if (adjustedDuration > 0) {
        setCurrentVideo({
          ...playInfo,
          startTime: playInfo.startTime + elapsed,
        })
        setRemainingTime(adjustedDuration)
      }
    })

    channel.on('broadcast', { event: 'stop-video' }, () => {
      console.log('🛑 영상 도네 중지 수신')
      setCurrentVideo(null)
      setRemainingTime(0)
    })

    // 구독 시작
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ 영상 도네 채널 구독 완료:', channelName)
        isSubscribedRef.current = true
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ 영상 도네 채널 구독 실패:', channelName)
        isSubscribedRef.current = false
      }
    })

    channelRef.current = channel

    return () => {
      isSubscribedRef.current = false
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [roomId, enabled])

  // 영상 재생 시작 (호스트가 브로드캐스트)
  const playVideo = useCallback(
    async (donation: StreamDonation, startTime?: number): Promise<boolean> => {
      if (!roomId || !donation.video_url) return false

      const videoId = extractYoutubeVideoId(donation.video_url)
      if (!videoId) {
        console.error('유튜브 비디오 ID를 추출할 수 없습니다:', donation.video_url)
        return false
      }

      // 시작 시간: 파라미터 > URL에서 추출 > 0
      const effectiveStartTime = startTime ?? extractYoutubeStartTime(donation.video_url)

      const playInfo: VideoPlayInfo = {
        donationId: donation.id,
        videoId,
        videoUrl: donation.video_url,
        videoTitle: donation.video_title,
        videoThumbnail: donation.video_thumbnail,
        donorName: donation.donor?.name || '익명',
        donorProfileImage: donation.donor?.profile_image || null,
        amount: donation.amount,
        startTime: effectiveStartTime,
        duration: 10, // 10초 재생
        startedAt: Date.now(),
      }

      try {
        const channel = channelRef.current

        // 채널이 구독되어 있지 않으면 대기
        if (!channel || !isSubscribedRef.current) {
          // 최대 3초 대기
          let waited = 0
          while ((!channelRef.current || !isSubscribedRef.current) && waited < 3000) {
            await new Promise((r) => setTimeout(r, 100))
            waited += 100
          }

          if (!channelRef.current || !isSubscribedRef.current) {
            throw new Error('채널이 준비되지 않았습니다')
          }
        }

        // 브로드캐스트 전송
        await channelRef.current.send({
          type: 'broadcast',
          event: 'play-video',
          payload: playInfo,
        })

        console.log('🎬 영상 도네 재생 브로드캐스트 전송:', playInfo)

        // 호스트도 로컬에서 재생
        setCurrentVideo(playInfo)
        setRemainingTime(playInfo.duration)

        return true
      } catch (error) {
        console.error('영상 도네 브로드캐스트 실패:', error)
        return false
      }
    },
    [roomId]
  )

  // 영상 재생 중지 (브로드캐스트 포함)
  const stopVideo = useCallback(async () => {
    setCurrentVideo(null)
    setRemainingTime(0)

    // 다른 참여자에게도 중지 알림
    if (channelRef.current && isSubscribedRef.current) {
      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'stop-video',
          payload: {},
        })
        console.log('🛑 영상 도네 중지 브로드캐스트 전송')
      } catch (error) {
        console.error('영상 중지 브로드캐스트 실패:', error)
      }
    }
  }, [])

  // 남은 시간 카운트다운
  useEffect(() => {
    if (!currentVideo || remainingTime <= 0) return

    const timer = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          setCurrentVideo(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [currentVideo, remainingTime])

  return {
    currentVideo,
    playVideo,
    stopVideo,
    isPlaying: !!currentVideo,
    remainingTime,
  }
}

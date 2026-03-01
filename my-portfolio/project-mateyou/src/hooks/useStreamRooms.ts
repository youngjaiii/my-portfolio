import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// DB 스키마 기반 타입 정의
export type StreamType = 'live' | 'radio' | 'review'
export type CanView = 'subscribers' | 'all' | 'locked'

export interface StreamHost {
  userProfile: string
  userName: string
  partnerId: string
}

export type BroadcastType = 'webrtc' | 'hls' | 'hybrid'

export interface StreamRoom {
  id: string
  title: string
  description: string | null
  viewerCount: number
  whenStart: string
  category: string
  categorySlug: string
  streamType: StreamType
  streamThumbnail: string | null
  canView: CanView
  hostList: StreamHost[]
  // scheduled = 리허설 상태 (비디오 방송 시작 전 대기)
  status: 'scheduled' | 'live' | 'ended'
  tags: string[]
  // 방송 기술 타입 (HLS/WebRTC)
  broadcastType: BroadcastType | null
}

// DB access_type → 프론트엔드 canView 변환
const mapAccessType = (accessType: string): CanView => {
  switch (accessType) {
    case 'subscriber':
      return 'subscribers'
    case 'private':
      return 'locked'
    case 'public':
    default:
      return 'all'
  }
}

// DB stream_type + status → 프론트엔드 streamType 변환
const mapStreamType = (dbStreamType: string, status: string): StreamType => {
  if (status === 'ended') return 'review'
  if (dbStreamType === 'audio') return 'radio'
  return 'live'
}

interface UseStreamRoomsOptions {
  status?: 'live' | 'scheduled' | 'ended' | 'all'
  streamType?: 'video' | 'audio' | 'all'
  limit?: number
  enabled?: boolean
}

export function useStreamRooms(options: UseStreamRoomsOptions = {}) {
  const { 
    status = 'all', 
    streamType = 'all', 
    limit = 20, 
    enabled = true 
  } = options

  return useQuery({
    queryKey: ['stream-rooms', status, streamType, limit],
    queryFn: async (): Promise<StreamRoom[]> => {
      // 기본 쿼리 빌드
      let query = supabase
        .from('stream_rooms')
        .select(`
          id,
          title,
          description,
          stream_type,
          broadcast_type,
          thumbnail_url,
          access_type,
          viewer_count,
          total_viewers,
          status,
          tags,
          scheduled_at,
          started_at,
          ended_at,
          created_at,
          category:stream_categories(id, name, slug),
          host_partner:partners!stream_rooms_host_partner_id_fkey(
            id,
            partner_name,
            member:members(id, name, profile_image)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      // 상태 필터
      // scheduled 상태(리허설)는 호스트 전용이므로 목록에서 제외
      if (status !== 'all') {
        query = query.eq('status', status)
      } else {
        // 'all' 조회 시 scheduled(리허설) 상태는 제외 - live와 ended만 표시
        query = query.in('status', ['live', 'ended'])
      }

      // 스트림 타입 필터
      if (streamType !== 'all') {
        query = query.eq('stream_type', streamType)
      }

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch stream rooms:', error)
        throw new Error('스트림 목록을 불러오는데 실패했습니다.')
      }

      if (!data) return []

      // 데이터 변환
      return data.map((room: any) => {
        const hostPartner = room.host_partner
        const category = room.category

        const hostList: StreamHost[] = hostPartner ? [{
          userProfile: hostPartner.member?.profile_image || '/default-avatar.png',
          userName: hostPartner.partner_name || hostPartner.member?.name || '알 수 없음',
          partnerId: hostPartner.id
        }] : []

        return {
          id: room.id,
          title: room.title,
          description: room.description,
          viewerCount: room.viewer_count || 0,
          whenStart: room.started_at || room.scheduled_at || room.created_at,
          category: category?.name || '기타',
          categorySlug: category?.slug || 'etc',
          streamType: mapStreamType(room.stream_type, room.status),
          streamThumbnail: room.thumbnail_url,
          canView: mapAccessType(room.access_type),
          hostList,
          status: room.status,
          tags: room.tags || [],
          broadcastType: room.broadcast_type as BroadcastType | null,
        }
      })
    },
    enabled,
    staleTime: 1000 * 30, // 30초
    gcTime: 1000 * 60 * 5, // 5분
  })
}

// 라이브 스트림만 가져오기
export function useLiveStreams(limit?: number) {
  return useStreamRooms({ status: 'live', limit })
}

// 라디오(오디오) 스트림만 가져오기
export function useRadioStreams(limit?: number) {
  return useStreamRooms({ status: 'live', streamType: 'audio', limit })
}

// 다시보기(종료된) 스트림만 가져오기
export function useReplayStreams(limit?: number) {
  return useStreamRooms({ status: 'ended', limit })
}


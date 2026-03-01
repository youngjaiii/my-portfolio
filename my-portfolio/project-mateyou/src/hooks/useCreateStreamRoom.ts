/**
 * useCreateStreamRoom - 스트림 방 생성 공통 훅
 * 
 * 폼 상태 관리, 유효성 검증, 방 생성 로직을 통합
 * CreateStreamSheet와 voice 페이지에서 공통으로 사용
 * 
 * Edge Function API를 통해 방 생성 (RLS 우회, 호스트 자동 등록)
 */

import { useVoiceRoomConnection } from '@/contexts/VoiceRoomProvider';
import { useAuth } from '@/hooks/useAuth';
import type { AccessType, StreamType } from '@/hooks/useVoiceRoom';
import { useStreamCategories, useVoiceRoom } from '@/hooks/useVoiceRoom';
import { edgeApi } from '@/lib/edgeApi';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

// 폼 상태 타입
export interface CreateStreamFormState {
  title: string
  description: string
  streamType: StreamType
  accessType: AccessType
  password: string
  maxParticipants: number
  categoryId: string | null
  thumbnailUrl: string | null
}

// 초기 상태
const initialFormState: CreateStreamFormState = {
  title: '',
  description: '',
  streamType: 'audio',
  accessType: 'public',
  password: '',
  maxParticipants: 10,
  categoryId: null,
  thumbnailUrl: null,
}

interface UseCreateStreamRoomOptions {
  /** 시트가 열려있는지 여부 (카테고리 쿼리 활성화용) */
  isOpen?: boolean
  /** 방 생성 후 콜백 */
  onSuccess?: () => void
  /** WebRTC 모바일 라이브 모드 (방 생성 후 WebRTC 방송 페이지로 이동) */
  isWebRTCMode?: boolean
}

export function useCreateStreamRoom(options: UseCreateStreamRoomOptions = {}) {
  const { isOpen = true, onSuccess, isWebRTCMode = false } = options
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // 폼 상태
  const [formState, setFormState] = useState<CreateStreamFormState>(initialFormState)
  const [error, setError] = useState<string | null>(null)
  
  // 이전 썸네일 로드 완료 여부
  const thumbnailLoadedRef = useRef(false)

  // 서버에서 이전 썸네일 불러오기
  const { data: savedThumbnail } = useQuery({
    queryKey: ['stream-user-thumbnail', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error: queryError } = await supabase
        .from('stream_user_thumbnails')
        .select('thumbnail_url')
        .eq('member_id', user.id)
        .maybeSingle()
      
      if (queryError) {
        console.error('이전 썸네일 조회 실패:', queryError)
        return null
      }
      return data?.thumbnail_url || null
    },
    enabled: !!user?.id && isOpen,
    staleTime: 1000 * 60 * 5, // 5분간 캐시
  })

  // 이전 썸네일을 폼에 적용 (한 번만)
  useEffect(() => {
    if (savedThumbnail && !thumbnailLoadedRef.current && !formState.thumbnailUrl) {
      thumbnailLoadedRef.current = true
      setFormState(prev => ({ ...prev, thumbnailUrl: savedThumbnail }))
    }
  }, [savedThumbnail, formState.thumbnailUrl])

  // 현재 연결된 보이스룸 확인 (호스트 중복 방지용)
  const { currentRoomId, isConnected } = useVoiceRoomConnection()
  const { isHost: isCurrentRoomHost } = useVoiceRoom(currentRoomId || undefined)
  
  // 호스트가 진행중인 방이 있는지 확인
  const hasActiveHostingRoom = isConnected && currentRoomId && isCurrentRoomHost

  // 카테고리 목록
  const { data: categories = [] } = useStreamCategories()

  // 파트너 정보 조회
  const { data: partnerData, isLoading: isLoadingPartner } = useQuery<{ id: string; partner_status: string } | null>({
    queryKey: ['my-partner', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error: queryError } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .maybeSingle()

      if (queryError) throw queryError
      return data
    },
    enabled: !!user?.id && isOpen,
  })

  // 파트너 여부
  const isPartner = partnerData?.partner_status === 'approved'

  // 일반 유저일 때 accessType을 자동으로 'private'로 설정, streamType은 'audio'로 고정
  useEffect(() => {
    if (!isLoadingPartner && !isPartner) {
      if (formState.accessType !== 'private') {
        setFormState(prev => ({ ...prev, accessType: 'private' }))
      }
      if (formState.streamType !== 'audio') {
        setFormState(prev => ({ ...prev, streamType: 'audio' }))
      }
    }
  }, [isLoadingPartner, isPartner, formState.accessType, formState.streamType])

  // 썸네일 저장 뮤테이션 (서버에 저장)
  const saveThumbnailMutation = useMutation({
    mutationFn: async (thumbnailUrl: string) => {
      if (!user?.id) throw new Error('로그인이 필요합니다')
      
      // upsert: 있으면 업데이트, 없으면 삽입
      const { error: upsertError } = await supabase
        .from('stream_user_thumbnails')
        .upsert({
          member_id: user.id,
          thumbnail_url: thumbnailUrl,
        }, {
          onConflict: 'member_id',
        })
      
      if (upsertError) throw upsertError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-user-thumbnail', user?.id] })
    },
  })

  // 썸네일 URL 변경 시 서버에 저장 (디바운스)
  const thumbnailSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (!formState.thumbnailUrl || !user?.id) return
    
    // 기존 타이머 취소
    if (thumbnailSaveTimeoutRef.current) {
      clearTimeout(thumbnailSaveTimeoutRef.current)
    }
    
    // 1초 후 저장 (디바운스)
    thumbnailSaveTimeoutRef.current = setTimeout(() => {
      saveThumbnailMutation.mutate(formState.thumbnailUrl!)
    }, 1000)
    
    return () => {
      if (thumbnailSaveTimeoutRef.current) {
        clearTimeout(thumbnailSaveTimeoutRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.thumbnailUrl, user?.id]);

  // 유효성 검증
  const validate = useCallback((): string | null => {
    // 호스트가 진행중인 방이 있으면 새 방 생성 불가
    if (hasActiveHostingRoom) {
      return '이미 진행 중인 방송이 있습니다. 방송을 종료한 후 새 방을 만들 수 있습니다.'
    }
    if (!formState.title.trim()) {
      return '방 제목을 입력해주세요'
    }
    // 파트너는 썸네일 필수
    if (isPartner && !formState.thumbnailUrl) {
      return '썸네일 이미지를 업로드해주세요'
    }
    // 라이브룸은 파트너만 생성 가능
    if (formState.streamType === 'video' && !isPartner) {
      return '비디오 방송은 파트너만 만들 수 있습니다'
    }
    if (formState.accessType === 'private' && formState.password.length < 4) {
      return '비공개방은 4자리 이상의 비밀번호가 필요합니다'
    }
    if (!isPartner && formState.accessType !== 'private') {
      return '일반 유저는 비공개 방만 만들 수 있습니다'
    }
    return null
  }, [formState, isPartner, hasActiveHostingRoom])

  // 제출 가능 여부 (호스트가 진행중인 방이 있으면 불가)
  const canSubmit = !hasActiveHostingRoom &&
    formState.title.trim().length > 0 && 
    (formState.streamType !== 'video' || isPartner) && // 비디오는 파트너만
    (formState.accessType !== 'private' || formState.password.length >= 4) &&
    (isPartner || formState.accessType === 'private') &&
    (!isPartner || !!formState.thumbnailUrl) // 파트너는 썸네일 필수

  // 방 생성 뮤테이션 - Edge Function API 사용 (RLS 우회, 호스트 자동 등록)
  const createMutation = useMutation({
    mutationFn: async () => {
      const validationError = validate()
      if (validationError) {
        throw new Error(validationError)
      }

      if (!user) {
        throw new Error('로그인이 필요합니다')
      }

      // Edge Function API 호출 (서버에서 방 생성 + 호스트 등록 처리)
      // 라이브룸은 max_participants가 1로 고정
      const maxParticipants = formState.streamType === 'video' ? 1 : formState.maxParticipants
      
      const response = await edgeApi.stream.createRoom({
        title: formState.title.trim(),
        description: formState.description.trim() || undefined,
        stream_type: formState.streamType,
        access_type: formState.accessType,
        password: formState.accessType === 'private' ? formState.password : undefined,
        max_participants: maxParticipants,
        category_id: formState.categoryId || undefined,
        thumbnail_url: formState.thumbnailUrl || undefined,
      })

      if (!response.success) {
        throw new Error(response.error?.message || '방 생성에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stream-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] })
      onSuccess?.()
      resetForm()
      // 생성된 방으로 이동
      const roomId = (data as { room_id: string }).room_id
      let route: string
      if (formState.streamType === 'video') {
        // 비디오: WebRTC 모드면 webrtc-broadcast, 아니면 HLS 리허설
        route = isWebRTCMode 
          ? '/stream/video/webrtc-broadcast/$roomId'  // 모바일 WebRTC 방송 페이지
          : '/stream/video/hls-rehearsal/$roomId'     // PC OBS 연결 대기 페이지
      } else {
        route = '/stream/chat/$roomId'  // 보이스 채팅방
      }
      navigate({ to: route, params: { roomId } })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '방 생성에 실패했습니다')
    },
  })

  // 폼 리셋 (썸네일은 유지)
  const resetForm = useCallback(() => {
    const resetState: CreateStreamFormState = {
      ...initialFormState,
      thumbnailUrl: savedThumbnail || formState.thumbnailUrl, // 이전 썸네일 유지
    }
    if (!isPartner) {
      resetState.accessType = 'private'
      resetState.streamType = 'audio'
    }
    setFormState(resetState)
    setError(null)
    thumbnailLoadedRef.current = false // 다음 오픈 시 다시 로드 가능하게
  }, [isPartner, savedThumbnail, formState.thumbnailUrl])

  // 폼 필드 업데이트 헬퍼
  const updateField = useCallback(<TKey extends keyof CreateStreamFormState>(
    field: TKey, 
    value: CreateStreamFormState[TKey]
  ) => {
    setFormState(prev => ({ ...prev, [field]: value }))
    setError(null)
  }, [])

  // 방 생성 실행
  const createRoom = useCallback(() => {
    createMutation.mutate()
  }, [createMutation])

  return {
    // 상태
    formState,
    error,
    isLoading: createMutation.isPending,
    isLoadingPartner,
    
    // 파생 값
    isPartner,
    canSubmit,
    categories,
    selectedCategory: categories.find(c => c.id === formState.categoryId),
    hasActiveHostingRoom,  // 호스트가 진행중인 방이 있는지
    currentRoomId,         // 현재 연결된 방 ID
    
    // 액션
    updateField,
    resetForm,
    createRoom,
    setError,
    
    // 전체 폼 상태 업데이트 (필요시)
    setFormState,
  }
}

export default useCreateStreamRoom


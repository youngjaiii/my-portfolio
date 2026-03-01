import { WebPlugin } from '@capacitor/core'
import type { LiveKitPlugin } from './LiveKit'
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  createLocalAudioTrack,
} from 'livekit-client'

export class LiveKitWeb extends WebPlugin implements LiveKitPlugin {
  private room: Room | null = null
  private localAudioTrack: any = null

  async connect(options: {
    url: string
    token: string
    roomName: string
  }): Promise<{ success: boolean; roomId: string }> {
    try {
      console.log('🔊 [LiveKit Web] Connecting to room:', options.roomName)

      // 새 Room 인스턴스 생성
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      })

      // 이벤트 리스너 설정
      this.setupRoomListeners()

      // 연결
      await this.room.connect(options.url, options.token)

      // 로컬 오디오 트랙 생성 및 퍼블리시
      this.localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      })
      await this.room.localParticipant.publishTrack(this.localAudioTrack)

      console.log('✅ [LiveKit Web] Connected successfully')

      return {
        success: true,
        roomId: this.room.name || options.roomName,
      }
    } catch (error: any) {
      console.error('❌ [LiveKit Web] Connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<{ success: boolean }> {
    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.stop()
        this.localAudioTrack = null
      }

      if (this.room) {
        await this.room.disconnect()
        this.room = null
      }

      console.log('✅ [LiveKit Web] Disconnected')
      return { success: true }
    } catch (error: any) {
      console.error('❌ [LiveKit Web] Disconnect failed:', error)
      return { success: false }
    }
  }

  async setMicrophoneEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }> {
    try {
      if (this.room?.localParticipant) {
        await this.room.localParticipant.setMicrophoneEnabled(options.enabled)
      }
      return { success: true, enabled: options.enabled }
    } catch (error) {
      console.error('❌ [LiveKit Web] setMicrophoneEnabled failed:', error)
      return { success: false, enabled: !options.enabled }
    }
  }

  async setSpeakerMode(options: { speaker: boolean }): Promise<{ success: boolean; speaker: boolean }> {
    // Web에서는 setSinkId로 출력 장치 변경 가능 (Chrome/Edge만 지원)
    console.log('🔊 [LiveKit Web] setSpeakerMode:', options.speaker)
    return { success: true, speaker: options.speaker }
  }

  async isConnected(): Promise<{ connected: boolean; roomName?: string }> {
    const connected = this.room?.state === 'connected'
    return {
      connected,
      roomName: connected ? this.room?.name : undefined,
    }
  }

  // ============ CallKit Methods (Web fallback) ============

  async startOutgoingCall(options: {
    callerName: string
    callUUID?: string
  }): Promise<{ success: boolean; callUUID: string }> {
    // Web에서는 CallKit 없음
    console.log('📞 [LiveKit Web] Start outgoing call:', options)
    const callUUID = options.callUUID || `web-${Date.now()}`
    return { success: true, callUUID }
  }

  async reportOutgoingCallConnected(): Promise<{ success: boolean }> {
    // Web에서는 CallKit 없음
    console.log('📞 [LiveKit Web] Report outgoing call connected')
    return { success: true }
  }

  async reportIncomingCall(options: {
    callerId: string
    callerName: string
    roomName: string
  }): Promise<{ success: boolean; callUUID: string }> {
    // Web에서는 CallKit 없음 - 단순히 이벤트 발생
    console.log('📞 [LiveKit Web] Incoming call:', options)
    const callUUID = `web-${Date.now()}`
    this.notifyListeners('callAnswered', { callUUID })
    return { success: true, callUUID }
  }

  async endCall(): Promise<{ success: boolean }> {
    await this.disconnect()
    return { success: true }
  }

  // ============ Dial Tone Methods (Web fallback) ============

  async startDialTone(): Promise<{ success: boolean }> {
    // Web에서는 다이얼톤 없음
    console.log('📞 [LiveKit Web] Dial tone not available on web')
    return { success: true }
  }

  async stopDialTone(): Promise<{ success: boolean }> {
    // Web에서는 다이얼톤 없음
    console.log('📞 [LiveKit Web] Dial tone stop not available on web')
    return { success: true }
  }

  // ============ PushKit VoIP Methods (Web fallback) ============

  async registerVoIPPush(): Promise<{ success: boolean; token: string | null }> {
    // Web에서는 PushKit 없음
    console.log('📞 [LiveKit Web] VoIP push not available on web')
    return { success: true, token: null }
  }

  async getVoIPToken(): Promise<{ token: string | null; apnsEnv?: string }> {
    // Web에서는 PushKit 없음
    return { token: null }
  }

  async getActiveCallState(): Promise<{ hasActiveCall: boolean; isConnected: boolean }> {
    // Web에서는 별도 상태 관리 없음
    return { hasActiveCall: false, isConnected: this.room?.state === 'connected' }
  }

  async clearActiveCallState(): Promise<{ success: boolean }> {
    return { success: true }
  }

  // ============ Native Video Views (not implemented for web) ============

  async showVideoViews(): Promise<{ success: boolean }> {
    console.log('[LiveKit Web] showVideoViews not implemented for web')
    return { success: true }
  }

  async hideVideoViews(): Promise<{ success: boolean }> {
    console.log('[LiveKit Web] hideVideoViews not implemented for web')
    return { success: true }
  }

  async setLocalVideoMirrored(): Promise<{ success: boolean }> {
    console.log('[LiveKit Web] setLocalVideoMirrored not implemented for web')
    return { success: true }
  }

  // ============ Private Methods ============

  private setupRoomListeners() {
    if (!this.room) return

    this.room.on(RoomEvent.Connected, () => {
      console.log('✅ [LiveKit] Room connected')
      this.notifyListeners('connected', { roomName: this.room?.name || '' })
    })

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('🔌 [LiveKit] Room disconnected:', reason)
      this.notifyListeners('disconnected', { reason: reason || 'unknown' })
    })

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('👤 [LiveKit] Participant connected:', participant.identity)
      this.notifyListeners('participantConnected', {
        participantId: participant.sid,
        participantName: participant.identity,
      })
    })

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('👤 [LiveKit] Participant disconnected:', participant.identity)
      this.notifyListeners('participantDisconnected', {
        participantId: participant.sid,
      })
    })

    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: any, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log('🎵 [LiveKit] Track subscribed:', track.kind, participant.identity)
        
        // 오디오 트랙이면 자동으로 재생
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach()
          document.body.appendChild(audioElement)
        }

        this.notifyListeners('trackSubscribed', {
          participantId: participant.sid,
          trackType: track.kind as 'audio' | 'video',
        })
      },
    )
  }
}

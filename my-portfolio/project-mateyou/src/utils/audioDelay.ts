/**
 * 음성 스트림에 딜레이를 추가하는 유틸리티
 */
export class AudioDelayProcessor {
  private audioContext: AudioContext | null = null
  private delayNode: DelayNode | null = null
  private gainNode: GainNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private destinationNode: MediaStreamAudioDestinationNode | null = null
  private isEnabled = false
  private delayTime = 1.0 // 기본 1초

  constructor(delayTimeSeconds: number = 1.0) {
    this.delayTime = delayTimeSeconds
  }

  /**
   * 딜레이 처리된 스트림 생성
   */
  async createDelayedStream(originalStream: MediaStream): Promise<MediaStream> {
    try {
      // AudioContext 생성
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)()

      // 원본 스트림의 오디오 트랙 가져오기
      const audioTracks = originalStream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks found in the stream')
      }

      // 소스 노드 생성
      this.sourceNode =
        this.audioContext.createMediaStreamSource(originalStream)

      // 딜레이 노드 생성 (최대 3초까지 설정 가능)
      this.delayNode = this.audioContext.createDelay(3.0)
      this.delayNode.delayTime.setValueAtTime(
        this.delayTime,
        this.audioContext.currentTime,
      )

      // 게인 노드 생성 (볼륨 조절용)
      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime)

      // 목적지 노드 생성 (새로운 스트림 출력용)
      this.destinationNode = this.audioContext.createMediaStreamDestination()

      // 노드들 연결: 소스 → 딜레이 → 게인 → 목적지
      this.sourceNode.connect(this.delayNode)
      this.delayNode.connect(this.gainNode)
      this.gainNode.connect(this.destinationNode)

      this.isEnabled = true

      // 비디오 트랙이 있다면 그대로 추가
      const videoTracks = originalStream.getVideoTracks()
      videoTracks.forEach((track) => {
        this.destinationNode?.stream.addTrack(track)
      })

      return this.destinationNode.stream
    } catch (error) {
      console.error('Failed to create delayed stream:', error)
      // 에러 시 원본 스트림 반환
      return originalStream
    }
  }

  /**
   * 딜레이 시간 변경
   */
  setDelayTime(seconds: number): void {
    this.delayTime = Math.max(0, Math.min(3.0, seconds)) // 0~3초 범위로 제한

    if (this.delayNode && this.audioContext) {
      this.delayNode.delayTime.setValueAtTime(
        this.delayTime,
        this.audioContext.currentTime,
      )
    }
  }

  /**
   * 딜레이 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled

    if (this.gainNode && this.audioContext) {
      // 딜레이 비활성화 시 게인을 0으로, 활성화 시 1로
      this.gainNode.gain.setValueAtTime(
        enabled ? 1.0 : 0.0,
        this.audioContext.currentTime,
      )
    }
  }

  /**
   * 현재 딜레이 시간 반환
   */
  getDelayTime(): number {
    return this.delayTime
  }

  /**
   * 딜레이 활성화 상태 반환
   */
  getIsEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.delayNode) {
      this.delayNode.disconnect()
      this.delayNode = null
    }

    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }

    if (this.destinationNode) {
      this.destinationNode.disconnect()
      this.destinationNode = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isEnabled = false
  }
}

/**
 * 간단한 딜레이 적용 함수
 */
export async function applyAudioDelay(
  stream: MediaStream,
  delaySeconds: number = 1.0,
): Promise<MediaStream> {
  const processor = new AudioDelayProcessor(delaySeconds)
  return processor.createDelayedStream(stream)
}

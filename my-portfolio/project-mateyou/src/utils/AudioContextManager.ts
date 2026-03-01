/**
 * AudioContextManager - AudioContext 싱글톤 관리
 *
 * 브라우저의 AudioContext 인스턴스 수 제한(약 6개)을 피하기 위해
 * 하나의 AudioContext를 전역적으로 재사용합니다.
 *
 * 사용 예:
 * const audioContext = AudioContextManager.getInstance()
 * await AudioContextManager.resume() // 사용자 제스처 후 호출
 */

class AudioContextManagerClass {
  private instance: AudioContext | null = null

  /**
   * 전역 AudioContext 인스턴스를 반환합니다.
   * 인스턴스가 없거나 닫힌 상태면 새로 생성합니다.
   */
  getInstance(): AudioContext {
    if (!this.instance || this.instance.state === 'closed') {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.instance = new AudioContextClass()
    }
    return this.instance
  }

  /**
   * AudioContext가 suspended 상태면 resume합니다.
   * 사용자 제스처(클릭, 터치 등) 이벤트 핸들러에서 호출해야 합니다.
   */
  async resume(): Promise<void> {
    const ctx = this.getInstance()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  }

  /**
   * AudioContext를 명시적으로 닫습니다.
   * 일반적으로 호출할 필요 없음 (앱 종료 시 자동 정리됨)
   */
  close(): void {
    if (this.instance && this.instance.state !== 'closed') {
      this.instance.close()
      this.instance = null
    }
  }

  /**
   * 현재 AudioContext 상태를 반환합니다.
   */
  getState(): AudioContextState | null {
    return this.instance?.state || null
  }
}

// 싱글톤 인스턴스 export
export const AudioContextManager = new AudioContextManagerClass()

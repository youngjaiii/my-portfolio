/**
 * 동영상 압축 유틸리티
 * 서버 FFmpeg API를 우선 사용하고, 실패 시 클라이언트 WASM 사용
 */

// Express 백엔드 URL
const BACKEND_URL = 'https://api.mateyou.me'

/**
 * 서버에서 동영상 압축
 * @param file - 압축할 동영상 파일
 * @param maxSizeMB - 최대 파일 크기 (MB, 기본값 15)
 * @param onProgress - 진행률 콜백 (0~100)
 * @returns 압축된 동영상 파일
 */
export async function compressVideo(
  file: File,
  maxSizeMB: number = 15,
  onProgress?: (progress: number) => void
): Promise<File> {
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  // 이미 용량이 작으면 그대로 반환
  if (file.size <= maxSizeBytes) {
    console.log(`✅ 이미 ${maxSizeMB}MB 이하, 압축 불필요`)
    return file
  }

  const originalSizeMB = (file.size / 1024 / 1024).toFixed(1)
  console.log(`📹 동영상 압축 시작: ${originalSizeMB}MB → 목표 ${maxSizeMB}MB`)

  // 진행률 초기화
  onProgress?.(0)

  try {
    // 서버 압축 API 호출
    const formData = new FormData()
    formData.append('video', file)
    formData.append('maxSizeMB', maxSizeMB.toString())

    // XMLHttpRequest로 진행률 추적
    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      
      // 업로드 진행률 (0~50%)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 50)
          onProgress?.(percent)
        }
      }

      // 다운로드 진행률 (50~100%)
      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = 50 + Math.round((e.loaded / e.total) * 50)
          onProgress?.(percent)
        }
      }

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(xhr.response)
        } else {
          reject(new Error(`서버 오류: ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('네트워크 오류'))
      xhr.ontimeout = () => reject(new Error('요청 시간 초과'))

      xhr.open('POST', `${BACKEND_URL}/api/video/compress`)
      xhr.responseType = 'blob'
      xhr.timeout = 300000 // 5분 타임아웃
      xhr.send(formData)
    })

    onProgress?.(100)

    const compressedSizeMB = (compressedBlob.size / 1024 / 1024).toFixed(1)
    const reduction = ((1 - compressedBlob.size / file.size) * 100).toFixed(0)
    console.log(`✅ 압축 완료: ${originalSizeMB}MB → ${compressedSizeMB}MB (${reduction}% 감소)`)

    return new File([compressedBlob], file.name.replace(/\.[^.]+$/, '.mp4'), {
      type: 'video/mp4',
      lastModified: Date.now(),
    })
  } catch (error) {
    console.error('❌ 서버 압축 실패:', error)
    throw new Error('동영상 압축에 실패했습니다. 더 작은 파일을 선택해주세요.')
  }
}

/**
 * 서버 FFmpeg 사용 가능 여부 확인
 */
export async function checkServerCompression(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/video/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await response.json()
    return data.status === 'ok' && data.ffmpeg !== null
  } catch {
    return false
  }
}

/**
 * 동영상 압축 지원 여부 확인
 * 서버 API가 있으면 항상 지원됨
 */
export function isVideoCompressionSupported(): boolean {
  return true // 서버 API 사용
}

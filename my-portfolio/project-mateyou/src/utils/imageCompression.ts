/**
 * 이미지 압축 유틸리티
 * Canvas API를 사용하여 브라우저에서 이미지 압축
 */

const MAX_IMAGE_SIZE = 15 * 1024 * 1024 // 15MB

/**
 * 이미지 압축 함수
 * @param file - 압축할 이미지 파일
 * @param maxSizeMB - 최대 파일 크기 (MB, 기본값 15)
 * @param onProgress - 진행률 콜백 (0~100)
 * @returns 압축된 이미지 파일
 */
export async function compressImage(
  file: File,
  maxSizeMB: number = 15,
  onProgress?: (progress: number) => void
): Promise<File> {
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  // 이미 용량이 작으면 그대로 반환
  if (file.size <= maxSizeBytes) {
    onProgress?.(100)
    return file
  }

  onProgress?.(10)

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Canvas context를 생성할 수 없습니다.'))
      return
    }

    img.onload = async () => {
      onProgress?.(30)

      let { width, height } = img
      let quality = 0.85
      let maxDimension = 2048

      // 압축 루프
      let compressedBlob: Blob | null = null
      let attempts = 0
      const maxAttempts = 5

      while (attempts < maxAttempts) {
        attempts++
        onProgress?.(30 + attempts * 10)

        // 크기 조정
        const ratio = Math.min(maxDimension / width, maxDimension / height, 1)
        const newWidth = Math.round(width * ratio)
        const newHeight = Math.round(height * ratio)

        canvas.width = newWidth
        canvas.height = newHeight

        // 이미지 그리기
        ctx.clearRect(0, 0, newWidth, newHeight)
        ctx.drawImage(img, 0, 0, newWidth, newHeight)

        // JPEG로 압축
        compressedBlob = await new Promise<Blob | null>((res) => {
          canvas.toBlob(res, 'image/jpeg', quality)
        })

        if (!compressedBlob) {
          reject(new Error('이미지 압축에 실패했습니다.'))
          return
        }

        console.log(`📸 압축 시도 ${attempts}: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB (품질: ${quality}, 크기: ${newWidth}x${newHeight})`)

        // 목표 크기 달성
        if (compressedBlob.size <= maxSizeBytes) {
          break
        }

        // 다음 압축을 위해 품질/크기 조정
        if (quality > 0.5) {
          quality -= 0.15
        } else {
          maxDimension = Math.round(maxDimension * 0.7)
          quality = 0.7
        }

        // 최소 크기 제한
        if (maxDimension < 512) {
          break
        }
      }

      onProgress?.(90)

      if (!compressedBlob) {
        reject(new Error('이미지 압축에 실패했습니다.'))
        return
      }

      // 압축 후에도 크면 경고
      if (compressedBlob.size > maxSizeBytes) {
        console.warn(`⚠️ 압축 후에도 ${(compressedBlob.size / 1024 / 1024).toFixed(1)}MB 입니다.`)
      }

      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^.]+$/, '.jpg'),
        {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }
      )

      onProgress?.(100)
      console.log(`✅ 이미지 압축 완료: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(1)}MB`)
      resolve(compressedFile)
    }

    img.onerror = () => {
      reject(new Error('이미지를 로드할 수 없습니다.'))
    }

    // 파일을 data URL로 변환
    const reader = new FileReader()
    reader.onload = (e) => {
      img.src = e.target?.result as string
    }
    reader.onerror = () => {
      reject(new Error('파일을 읽을 수 없습니다.'))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * 이미지 압축 지원 여부 확인
 */
export function isImageCompressionSupported(): boolean {
  return typeof document !== 'undefined' && !!document.createElement('canvas').getContext
}



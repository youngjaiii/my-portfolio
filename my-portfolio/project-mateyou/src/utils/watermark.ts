/**
 * 워터마크 유틸리티 (하위 호환용)
 */

export const WATERMARK_CONFIG = {
  FONT_SIZE: 20,
  SPACING_X: 160,
  SPACING_Y: 80,
  OPACITY: 0.22,
  ROTATION: -30,
} as const

export async function applyWatermark(imageUrl: string): Promise<string> {
  return imageUrl
}

export async function captureVideoWithWatermark(videoUrl: string): Promise<string> {
  return videoUrl
}

export function createWatermarkCanvas(): HTMLCanvasElement {
  return document.createElement('canvas')
}

export function clearWatermarkCache() {}
export function removeFromWatermarkCache() {}

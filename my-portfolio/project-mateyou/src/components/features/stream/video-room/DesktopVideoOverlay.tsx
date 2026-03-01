/**
 * DesktopVideoOverlay - PC 레이아웃 비디오 위 오버레이
 * 
 * 랭킹/미션은 사이드바로 이동 - 비디오 위에는 최소한의 UI만 표시
 */

interface DesktopVideoOverlayProps {
  roomId: string
  isHost: boolean
  rankings: any[]
  onOpenMissionPanel: () => void
}

export function DesktopVideoOverlay({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  roomId: _roomId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isHost: _isHost,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rankings: _rankings,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onOpenMissionPanel: _onOpenMissionPanel,
}: DesktopVideoOverlayProps) {
  // 랭킹/미션은 사이드바로 이동 - 비디오 영역은 깔끔하게 유지
  return null
}

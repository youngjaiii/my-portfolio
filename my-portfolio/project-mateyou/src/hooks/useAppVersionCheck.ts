import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { WEB_VERSION } from '@/constants/app'

interface VersionInfo {
  platform: string
  version: string
  force_update: boolean
  store_url: string | null
  release_notes: string | null
  min_version?: string
}

// 버전 비교 함수 (semver 형식: x.y.z)
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 < p2) return -1
    if (p1 > p2) return 1
  }
  return 0
}

export function useAppVersionCheck() {
  const [isChecking, setIsChecking] = useState(true)
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string>(WEB_VERSION)

  useEffect(() => {
    const checkVersion = async () => {
      // 웹은 제외
      if (!Capacitor.isNativePlatform()) {
        setIsChecking(false)
        return
      }

      try {
        // 네이티브 앱 버전 가져오기
        const appInfo = await App.getInfo()
        const appVersion = appInfo.version
        setCurrentVersion(appVersion)
        
        const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-app-version?platform=${platform}`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
            },
          }
        )

        const result = await response.json()
        console.log('📱 앱 버전 확인:', { current: appVersion, server: result.data?.version })
        
        if (result.success && result.data) {
          const serverVersion = result.data as VersionInfo
          setVersionInfo(serverVersion)

          let requiresUpdate = false
          
          // force_update가 true이고 현재 버전이 서버 버전보다 낮으면 업데이트 필요
          if (serverVersion.force_update) {
            const comparison = compareVersions(appVersion, serverVersion.version)
            if (comparison < 0) {
              requiresUpdate = true
            }
          }
          
          // min_version 체크 (최소 지원 버전보다 낮으면 강제 업데이트)
          if (serverVersion.min_version) {
            const minComparison = compareVersions(appVersion, serverVersion.min_version)
            if (minComparison < 0) {
              requiresUpdate = true
            }
          }
          
          if (requiresUpdate) {
            setNeedsUpdate(true)
            
            // 스플래시 숨기고 alert 표시
            await SplashScreen.hide().catch(() => {})
            
            // alert 표시 후 스토어로 이동
            window.alert('새로운 버전이 출시되었습니다.\n앱을 업데이트해 주세요.')
            
            if (serverVersion.store_url) {
              await App.openUrl({ url: serverVersion.store_url })
            }
          }
        }
      } catch (error: any) {
        const errorMsg = error?.message || JSON.stringify(error) || '알 수 없는 오류'
        console.error('앱 버전 확인 실패:', errorMsg)
      } finally {
        setIsChecking(false)
      }
    }

    checkVersion()
  }, [])

  return {
    isChecking,
    needsUpdate,
    versionInfo,
    currentVersion,
  }
}


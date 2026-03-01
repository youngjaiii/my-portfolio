import { useCallback, useState } from 'react'
import { mateYouApi } from '@/lib/apiClient'
import { generateUUID } from '@/lib/utils'

export function usePartnerRequests() {
  const [isAccepting, setIsAccepting] = useState(false)

  // 파트너 요청 수락
  const acceptRequest = useCallback(async (requestId: string) => {
    try {
      setIsAccepting(true)

      // 통화방 ID 생성 (UUID 형태)
      const callId = generateUUID()

      const response = await mateYouApi.partnerDashboard.updateRequestStatus(requestId, {
        status: 'in_progress',
        response_message: '의뢰를 수락했습니다! 음성 통화 버튼을 클릭하여 게임을 시작해주세요!',
        call_id: callId, // 통화방 ID 추가
      })

      // 응답 형식 처리
      const data = response.data.success ? response.data.data : response.data
      const requestData = data.request || data

      return { success: true, requestData }
    } catch (error) {
      throw error
    } finally {
      setIsAccepting(false)
    }
  }, [])

  // 파트너 요청 거절
  const rejectRequest = useCallback(
    async (requestId: string, reason?: string) => {
      try {
        setIsAccepting(true)

        const response = await mateYouApi.partnerDashboard.updateRequestStatus(requestId, {
          status: 'rejected',
          response_message: reason || '파트너가 의뢰를 거절했습니다.',
        })

        // 응답 형식 처리
        const data = response.data.success ? response.data.data : response.data
        const requestData = data.request || data

        return { success: true, requestData }
      } catch (error) {
        throw error
      } finally {
        setIsAccepting(false)
      }
    },
    [],
  )

  // 파트너 요청 완료
  const completeRequest = useCallback(async (requestId: string) => {
    try {
      setIsAccepting(true)

      const response = await mateYouApi.partnerDashboard.updateRequestStatus(requestId, {
        status: 'completed',
        response_message: '의뢰가 완료되었습니다! 수고하셨습니다.',
      })

      // 응답 형식 처리
      const data = response.data.success ? response.data.data : response.data
      const requestData = data.request || data

      return { success: true, requestData }
    } catch (error) {
      throw error
    } finally {
      setIsAccepting(false)
    }
  }, [])

  return {
    acceptRequest,
    rejectRequest,
    completeRequest,
    isAccepting,
  }
}

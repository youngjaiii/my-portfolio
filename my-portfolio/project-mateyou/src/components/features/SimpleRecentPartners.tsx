import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const SimpleRecentPartners: React.FC = () => {
  const [data, setData] = useState<Array<any>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('No user logged in')
        return
      }


      // 1. 가장 간단한 쿼리 - 완료된 요청만
      const { data: requests, error: requestsError } = await supabase
        .from('partner_requests')
        .select('*')
        .or(`client_id.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('status', 'completed')
        .limit(5)


      if (requestsError) {
        setError(`Requests error: ${requestsError.message}`)
        return
      }

      if (!requests || requests.length === 0) {
        setError('No completed requests found')
        return
      }

      // 2. 각 요청에 대해 상대방 정보 가져오기
      const results = []
      for (const request of requests) {
        const isClient = request.client_id === user.id
        const targetId = isClient ? request.partner_id : request.client_id


        // 상대방 정보 가져오기
        const { data: targetUser, error: userError } = await supabase
          .from('members')
          .select('id, name, profile_image')
          .eq('id', targetId)
          .single()


        results.push({
          requestId: request.id,
          requestType: request.request_type,
          completedAt: request.completed_at,
          isClient,
          targetId,
          targetUser,
          userError: userError?.message,
        })
      }

      setData(results)
    } catch (err) {
      console.error('🔍 Simple test error:', err)
      setError(
        `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-medium text-yellow-800 mb-2">
          🧪 Simple Test Loading...
        </h3>
      </div>
    )
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-yellow-800">
          🧪 Simple Recent Partners Test
        </h3>
        <button
          onClick={loadData}
          className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
        >
          다시 테스트
        </button>
      </div>

      {error ? (
        <div className="bg-red-100 border border-red-300 rounded p-3 mb-4">
          <p className="text-red-700 font-medium">❌ Error: {error}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-yellow-700 font-medium">
            ✅ Found {data.length} completed requests
          </p>
          {data.map((item, index) => (
            <div key={index} className="bg-white border rounded p-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">Request:</span> {item.requestId}
                </div>
                <div>
                  <span className="font-medium">Type:</span> {item.requestType}
                </div>
                <div>
                  <span className="font-medium">Role:</span>{' '}
                  {item.isClient ? 'Client' : 'Partner'}
                </div>
                <div>
                  <span className="font-medium">Target ID:</span>{' '}
                  {item.targetId}
                </div>
                <div className="col-span-2">
                  <span className="font-medium">Target User:</span>
                  {item.targetUser ? (
                    <span className="text-green-600 ml-1">
                      {item.targetUser.name} (ID: {item.targetUser.id})
                    </span>
                  ) : (
                    <span className="text-red-600 ml-1">
                      ❌ Not found {item.userError && `- ${item.userError}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

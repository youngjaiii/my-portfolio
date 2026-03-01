import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const DebugPartnerRequests: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const checkData = async () => {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setDebugInfo({ error: 'No user logged in' })
        return
      }


      // 1. 모든 partner_requests 확인
      const { data: allRequests, error: allError } = await supabase
        .from('partner_requests')
        .select('*')
        .order('created_at', { ascending: false })


      // 2. 내가 관련된 요청들
      const { data: myRequests, error: myError } = await supabase
        .from('partner_requests')
        .select('*')
        .or(`client_id.eq.${user.id},partner_id.eq.${user.id}`)
        .order('created_at', { ascending: false })


      // 3. 완료된 요청들
      const { data: completedRequests, error: completedError } = await supabase
        .from('partner_requests')
        .select('*')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })


      // 4. 내 완료된 요청들
      const { data: myCompletedRequests, error: myCompletedError } =
        await supabase
          .from('partner_requests')
          .select('*')
          .or(`client_id.eq.${user.id},partner_id.eq.${user.id}`)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })


      // 5. members 테이블 확인
      const { data: allMembers, error: membersError } = await supabase
        .from('members')
        .select('id, name, role')
        .order('created_at', { ascending: false })
        .limit(10)


      setDebugInfo({
        userId: user.id,
        totalRequests: allRequests?.length || 0,
        myRequests: myRequests?.length || 0,
        totalCompleted: completedRequests?.length || 0,
        myCompleted: myCompletedRequests?.length || 0,
        members: allMembers?.length || 0,
        data: {
          allRequests: allRequests?.slice(0, 5),
          myRequests,
          myCompletedRequests,
          allMembers: allMembers?.slice(0, 5),
        },
        errors: {
          allError,
          myError,
          completedError,
          myCompletedError,
          membersError,
        },
      })
    } catch (error) {
      console.error('Debug error:', error)
      setDebugInfo({
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkData()
  }, [])

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          🔍 Partner Requests 디버깅
        </h3>
        <button
          onClick={checkData}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '확인 중...' : '다시 확인'}
        </button>
      </div>

      {debugInfo && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-xs text-gray-500">User ID</div>
              <div className="font-mono text-xs truncate">
                {debugInfo.userId}
              </div>
            </div>
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-xs text-gray-500">총 요청</div>
              <div className="text-lg font-bold text-blue-600">
                {debugInfo.totalRequests}
              </div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-xs text-gray-500">내 요청</div>
              <div className="text-lg font-bold text-green-600">
                {debugInfo.myRequests}
              </div>
            </div>
            <div className="bg-purple-50 p-3 rounded">
              <div className="text-xs text-gray-500">완료된 요청</div>
              <div className="text-lg font-bold text-purple-600">
                {debugInfo.totalCompleted}
              </div>
            </div>
            <div className="bg-orange-50 p-3 rounded">
              <div className="text-xs text-gray-500">내 완료 요청</div>
              <div className="text-lg font-bold text-orange-600">
                {debugInfo.myCompleted}
              </div>
            </div>
          </div>

          <details className="bg-gray-50 p-4 rounded">
            <summary className="cursor-pointer font-medium text-gray-700 mb-2">
              📊 상세 데이터 보기
            </summary>
            <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}

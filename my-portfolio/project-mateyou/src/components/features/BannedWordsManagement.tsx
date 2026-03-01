import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Typography } from '@/components'
import { api } from '@/lib/apiClient'

// 금지어 타입
type BannedWord = {
  id: string
  word: string
  is_active: boolean
  created_at: string
  updated_at?: string
}

const BANNED_WORDS_PER_PAGE = 20

export function BannedWordsManagement() {
  // 금지어 관련 상태
  const [bannedWords, setBannedWords] = useState<Array<BannedWord>>([])
  const [isBannedWordsLoading, setIsBannedWordsLoading] = useState(false)
  const [bannedWordInput, setBannedWordInput] = useState('')
  const [editingBannedWord, setEditingBannedWord] = useState<BannedWord | null>(null)
  const [editingBannedWordInput, setEditingBannedWordInput] = useState('')
  const [bannedWordsSearch, setBannedWordsSearch] = useState('')
  const [bannedWordsSearchInput, setBannedWordsSearchInput] = useState('')
  const [bannedWordsPage, setBannedWordsPage] = useState(1)
  const [bannedWordsTotalPages, setBannedWordsTotalPages] = useState(1)
  const [bannedWordsTotal, setBannedWordsTotal] = useState(0)
  const [bannedWordsActiveFilter, setBannedWordsActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // 금지어 목록 가져오기
  const fetchBannedWords = useCallback(async (
    search: string = bannedWordsSearch,
    page: number = bannedWordsPage,
    activeFilter: 'all' | 'active' | 'inactive' = bannedWordsActiveFilter
  ) => {
    setIsBannedWordsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      params.append('page', String(page))
      params.append('limit', String(BANNED_WORDS_PER_PAGE))
      if (activeFilter !== 'all') {
        params.append('is_active', activeFilter === 'active' ? 'true' : 'false')
      }

      const response = await api.get(`/api/banned-words?${params.toString()}`)
      if (response.data?.success) {
        setBannedWords(response.data.data)
        if (response.data.meta) {
          setBannedWordsTotal(response.data.meta.total ?? 0)
          setBannedWordsTotalPages((response.data.meta as { total_pages?: number }).total_pages ?? 1)
        }
      }
    } catch (error) {
      console.error('금지어 목록 조회 실패:', error)
      toast.error('금지어 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsBannedWordsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannedWordsSearch, bannedWordsPage, bannedWordsActiveFilter])

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    fetchBannedWords()
  }, [fetchBannedWords])

  // 금지어 검색
  const handleBannedWordsSearch = () => {
    setBannedWordsSearch(bannedWordsSearchInput)
    setBannedWordsPage(1)
    fetchBannedWords(bannedWordsSearchInput, 1, bannedWordsActiveFilter)
  }

  // 금지어 필터 변경
  const handleBannedWordsFilterChange = (filter: 'all' | 'active' | 'inactive') => {
    setBannedWordsActiveFilter(filter)
    setBannedWordsPage(1)
    fetchBannedWords(bannedWordsSearch, 1, filter)
  }

  // 금지어 페이지 변경
  const handleBannedWordsPageChange = (page: number) => {
    setBannedWordsPage(page)
    fetchBannedWords(bannedWordsSearch, page, bannedWordsActiveFilter)
  }

  // 금지어 추가
  const handleAddBannedWord = async () => {
    const word = bannedWordInput.trim()
    if (!word) {
      toast.error('금지어를 입력해주세요.')
      return
    }

    try {
      const response = await api.post('/api/banned-words', { word })
      if (response.data?.success) {
        toast.success('금지어가 추가되었습니다.')
        setBannedWordInput('')
        fetchBannedWords()
      } else {
        toast.error(response.data?.error?.message || '금지어 추가에 실패했습니다.')
      }
    } catch (error: any) {
      console.error('금지어 추가 실패:', error)
      toast.error(error?.response?.data?.error?.message || '금지어 추가에 실패했습니다.')
    }
  }

  // 금지어 수정
  const handleUpdateBannedWord = async () => {
    if (!editingBannedWord) return

    const word = editingBannedWordInput.trim()
    if (!word) {
      toast.error('금지어를 입력해주세요.')
      return
    }

    try {
      const response = await api.put(`/api/banned-words/${editingBannedWord.id}`, { word })
      if (response.data?.success) {
        toast.success('금지어가 수정되었습니다.')
        setEditingBannedWord(null)
        setEditingBannedWordInput('')
        fetchBannedWords()
      } else {
        toast.error(response.data?.error?.message || '금지어 수정에 실패했습니다.')
      }
    } catch (error: any) {
      console.error('금지어 수정 실패:', error)
      toast.error(error?.response?.data?.error?.message || '금지어 수정에 실패했습니다.')
    }
  }

  // 금지어 활성화/비활성화 토글
  const handleToggleBannedWord = async (bannedWord: BannedWord) => {
    try {
      const response = await api.patch(`/api/banned-words/${bannedWord.id}/toggle`)
      if (response.data?.success) {
        toast.success(bannedWord.is_active ? '금지어가 비활성화되었습니다.' : '금지어가 활성화되었습니다.')
        fetchBannedWords()
      } else {
        toast.error(response.data?.error?.message || '금지어 상태 변경에 실패했습니다.')
      }
    } catch (error: any) {
      console.error('금지어 토글 실패:', error)
      toast.error(error?.response?.data?.error?.message || '금지어 상태 변경에 실패했습니다.')
    }
  }

  // 금지어 삭제
  const handleDeleteBannedWord = async (bannedWord: BannedWord) => {
    if (!confirm(`"${bannedWord.word}" 금지어를 삭제하시겠습니까?`)) {
      return
    }

    try {
      const response = await api.delete(`/api/banned-words/${bannedWord.id}`)
      if (response.data?.success) {
        toast.success('금지어가 삭제되었습니다.')
        fetchBannedWords()
      } else {
        toast.error(response.data?.error?.message || '금지어 삭제에 실패했습니다.')
      }
    } catch (error: any) {
      console.error('금지어 삭제 실패:', error)
      toast.error(error?.response?.data?.error?.message || '금지어 삭제에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Typography variant="h4">금지어 관리</Typography>
        <span className="text-sm text-gray-500">
          총 {bannedWordsTotal}개
        </span>
      </div>

      {/* 금지어 추가 폼 */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={bannedWordInput}
            onChange={(e) => setBannedWordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddBannedWord()
              }
            }}
            placeholder="금지어를 입력하세요"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            onClick={handleAddBannedWord}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            추가
          </Button>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* 검색 */}
          <div className="flex gap-2 flex-1">
            <input
              type="text"
              value={bannedWordsSearchInput}
              onChange={(e) => setBannedWordsSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleBannedWordsSearch()
                }
              }}
              placeholder="금지어 검색..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleBannedWordsSearch}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              검색
            </button>
            {bannedWordsSearch && (
              <button
                onClick={() => {
                  setBannedWordsSearch('')
                  setBannedWordsSearchInput('')
                  setBannedWordsPage(1)
                  fetchBannedWords('', 1, bannedWordsActiveFilter)
                }}
                className="px-3 py-2 text-gray-500 hover:text-gray-700"
              >
                초기화
              </button>
            )}
          </div>

          {/* 필터 */}
          <div className="flex gap-1">
            {[
              { value: 'all' as const, label: '전체' },
              { value: 'active' as const, label: '활성' },
              { value: 'inactive' as const, label: '비활성' },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => handleBannedWordsFilterChange(filter.value)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  bannedWordsActiveFilter === filter.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 금지어 목록 */}
      {isBannedWordsLoading ? (
        <div className="text-center py-8">
          <Typography variant="body1" color="text-secondary">
            로딩 중...
          </Typography>
        </div>
      ) : bannedWords.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg shadow-sm border">
          <Typography variant="body1" color="text-secondary">
            {bannedWordsSearch ? '검색 결과가 없습니다.' : '등록된 금지어가 없습니다.'}
          </Typography>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    금지어
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    상태
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    등록일
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bannedWords.map((bannedWord) => (
                  <tr key={bannedWord.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {editingBannedWord?.id === bannedWord.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingBannedWordInput}
                            onChange={(e) => setEditingBannedWordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateBannedWord()
                              } else if (e.key === 'Escape') {
                                setEditingBannedWord(null)
                                setEditingBannedWordInput('')
                              }
                            }}
                            className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <button
                            onClick={handleUpdateBannedWord}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => {
                              setEditingBannedWord(null)
                              setEditingBannedWordInput('')
                            }}
                            className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-gray-900">
                          {bannedWord.word}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleBannedWord(bannedWord)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                            bannedWord.is_active ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={bannedWord.is_active ? '클릭하여 비활성화' : '클릭하여 활성화'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              bannedWord.is_active ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className={`text-xs ${bannedWord.is_active ? 'text-green-600' : 'text-gray-500'}`}>
                          {bannedWord.is_active ? '활성' : '비활성'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(bannedWord.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingBannedWord(bannedWord)
                            setEditingBannedWordInput(bannedWord.word)
                          }}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                          title="수정"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBannedWord(bannedWord)}
                          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors"
                          title="삭제"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {bannedWordsTotalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border px-4 py-3">
              <div className="text-sm text-gray-500">
                {bannedWordsTotal}개 중 {(bannedWordsPage - 1) * BANNED_WORDS_PER_PAGE + 1}-{Math.min(bannedWordsPage * BANNED_WORDS_PER_PAGE, bannedWordsTotal)}개 표시
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleBannedWordsPageChange(1)}
                  disabled={bannedWordsPage === 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  처음
                </button>
                <button
                  onClick={() => handleBannedWordsPageChange(bannedWordsPage - 1)}
                  disabled={bannedWordsPage === 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  이전
                </button>
                <span className="px-3 py-1 text-sm">
                  {bannedWordsPage} / {bannedWordsTotalPages}
                </span>
                <button
                  onClick={() => handleBannedWordsPageChange(bannedWordsPage + 1)}
                  disabled={bannedWordsPage === bannedWordsTotalPages}
                  className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  다음
                </button>
                <button
                  onClick={() => handleBannedWordsPageChange(bannedWordsTotalPages)}
                  disabled={bannedWordsPage === bannedWordsTotalPages}
                  className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  마지막
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

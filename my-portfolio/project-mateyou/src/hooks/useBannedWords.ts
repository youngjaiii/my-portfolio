/**
 * 금지어 목록 조회 훅
 * - API에서 금지어 목록을 가져와 캐싱
 * - 앱 전역에서 사용 가능
 * - refetch 지원
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/apiClient'

/** 금지어 목록 쿼리 키 */
export const BANNED_WORDS_QUERY_KEY = ['banned-words']

/** 정규식 특수문자 이스케이프 */
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 금지어 목록 조회 훅
 */
export function useBannedWords() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: BANNED_WORDS_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/api/banned-words/words')

      if (!response.data?.success) {
        throw new Error('금지어 목록 조회 실패')
      }

      return response.data.data as Array<string>
    },
    staleTime: 5 * 60 * 1000, // 5분간 캐시 유지
    gcTime: 30 * 60 * 1000, // 30분간 가비지 컬렉션 방지
    refetchOnWindowFocus: false, // 윈도우 포커스 시 refetch 안함
    retry: 2, // 실패 시 2번 재시도
  })

  // 금지어 단어 목록
  const bannedWordList = query.data || []

  // 메시지에서 금지어 찾기 (기존 chatModeration.ts 로직과 동일)
  const findProhibitedWord = (
    message: string,
    bannedWords: Array<string> = bannedWordList,
  ): string | null => {
    if (!message || !Array.isArray(bannedWords) || bannedWords.length === 0) {
      return null
    }

    for (const rawWord of bannedWords) {
      const word = rawWord?.trim()
      if (!word) continue

      const pattern = new RegExp(escapeRegExp(word), 'i')
      if (pattern.test(message)) {
        return word
      }
    }

    return null
  }

  // 금지어 포함 여부 확인
  const containsProhibitedWord = (
    message: string,
    bannedWords: Array<string> = bannedWordList,
  ): boolean => {
    return findProhibitedWord(message, bannedWords) !== null
  }

  // 수동 refetch
  const refetchBannedWords = () => {
    return queryClient.invalidateQueries({ queryKey: BANNED_WORDS_QUERY_KEY })
  }

  return {
    // 금지어 목록
    bannedWordList,

    // 상태
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,

    // 유틸 함수
    findProhibitedWord,
    containsProhibitedWord,

    // refetch
    refetch: query.refetch,
    refetchBannedWords,
  }
}

/**
 * 금지어 목록 프리페치 (앱 시작 시 호출)
 */
export async function prefetchBannedWords(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.prefetchQuery({
    queryKey: BANNED_WORDS_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/api/banned-words/words')
      if (!response.data?.success) {
        throw new Error('금지어 목록 조회 실패')
      }
      return response.data.data as Array<string>
    },
    staleTime: 5 * 60 * 1000,
  })
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar, LoadingSpinner, Typography } from './index'

// 공통 아이템 인터페이스
export interface AutocompleteItem {
  id: string
  displayName: string
  subText?: string
  profileImage?: string
}

// API 응답 인터페이스
export interface AutocompleteApiResponse<T> {
  success: boolean
  data?: T[]
  error?: {
    code: string
    message: string
  }
}

interface BaseAutocompleteProps<T extends AutocompleteItem> {
  value?: string
  onChange: (id: string, item?: T) => void
  placeholder?: string
  className?: string
  // API 함수들
  searchFn: (query: string) => Promise<AutocompleteApiResponse<T>>
  getDetailsFn?: (id: string) => Promise<{ success: boolean; data?: T }>
  // 아이템 변환 함수
  formatItem: (item: T) => AutocompleteItem
  // 선택 시 표시할 텍스트
  getSelectedText: (item: T) => string
}

export function BaseAutocomplete<T extends AutocompleteItem>({
  value,
  onChange,
  placeholder = '검색하세요...',
  className = '',
  searchFn,
  getDetailsFn,
  formatItem,
  getSelectedText,
}: BaseAutocompleteProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<T | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const [hasInteracted, setHasInteracted] = useState(false)
  
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // 최신 요청 ID를 추적하여 race condition 방지
  const latestRequestIdRef = useRef(0)
  // searchFn을 ref로 저장하여 useEffect 의존성 문제 해결
  const searchFnRef = useRef(searchFn)
  searchFnRef.current = searchFn

  // 선택된 아이템 정보 로드
  useEffect(() => {
    if (value && !selectedItem && getDetailsFn) {
      loadItemById(value)
    }
  }, [value])

  // 디바운싱 및 검색 실행 (race condition 방지)
  useEffect(() => {
    if (!hasInteracted) return

    const currentRequestId = ++latestRequestIdRef.current
    const trimmedQuery = searchQuery.trim()

    // 디바운스 타이머
    const timer = setTimeout(async () => {
      // 다른 요청이 시작되었으면 이 요청은 무시
      if (currentRequestId !== latestRequestIdRef.current) return

      setIsLoading(true)
      try {
        const response = await searchFnRef.current(trimmedQuery)

        // 응답이 올 때 다른 요청이 시작되었으면 이 응답은 무시
        if (currentRequestId !== latestRequestIdRef.current) return

        if (response.success) {
          const results = response.data || []
          setItems(results)
          setIsOpen(true)
        } else {
          console.warn('⚠️ search: response.success is false', response)
          setItems([])
          setIsOpen(false)
        }
      } catch (error) {
        // 에러 발생 시에도 최신 요청인지 확인
        if (currentRequestId !== latestRequestIdRef.current) return
        
        console.error('❌ search error:', error)
        setItems([])
        setIsOpen(false)
      } finally {
        // 최신 요청인 경우에만 로딩 상태 해제
        if (currentRequestId === latestRequestIdRef.current) {
          setIsLoading(false)
        }
      }
    }, 150) // 디바운스 시간 150ms

    return () => clearTimeout(timer)
  }, [searchQuery, hasInteracted])

  // 드롭다운 위치 계산
  useEffect(() => {
    function updateDropdownPosition() {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect()
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        })
      }
    }

    if (isOpen && inputRef.current) {
      updateDropdownPosition()
      window.addEventListener('scroll', updateDropdownPosition, true)
      window.addEventListener('resize', updateDropdownPosition)

      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true)
        window.removeEventListener('resize', updateDropdownPosition)
      }
    }
  }, [isOpen, searchQuery, items])

  // 외부 클릭 감지 (Portal 사용 시)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  async function loadItemById(id: string) {
    if (!getDetailsFn) return
    try {
      const response = await getDetailsFn(id)
      if (response.success && response.data) {
        const item = response.data
        setSelectedItem(item)
        setSearchQuery(getSelectedText(item))
      }
    } catch (error) {
      console.error('❌ loadItemById error:', error)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const query = e.target.value
    setSearchQuery(query)
    setSelectedItem(null)
    setHasInteracted(true)
  }

  function handleSelectItem(item: T) {
    setSelectedItem(item)
    setSearchQuery(getSelectedText(item))
    setIsOpen(false)
    onChange(item.id, item)
  }

  function handleClear() {
    setSearchQuery('')
    setSelectedItem(null)
    setItems([])
    setIsOpen(false)
    onChange('')
    inputRef.current?.focus()
  }

  function handleFocus() {
    setHasInteracted(true)
    // 포커스 시 즉시 검색 실행 (빈 검색어로 전체 목록)
    if (items.length > 0) {
      setIsOpen(true)
    } else {
      // 즉시 검색 실행
      const currentRequestId = ++latestRequestIdRef.current
      setIsLoading(true)
      
      searchFnRef.current(searchQuery.trim())
        .then((response) => {
          if (currentRequestId !== latestRequestIdRef.current) return
          
          if (response.success) {
            setItems(response.data || [])
            setIsOpen(true)
          }
        })
        .catch((error) => {
          if (currentRequestId !== latestRequestIdRef.current) return
          console.error('❌ focus search error:', error)
        })
        .finally(() => {
          if (currentRequestId === latestRequestIdRef.current) {
            setIsLoading(false)
          }
        })
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {isOpen &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
          >
            {isLoading ? (
              <div className="p-4 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : items.length > 0 ? (
              <div className="py-1">
                {items.map((item) => {
                  const formatted = formatItem(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      {formatted.profileImage && (
                        <Avatar src={formatted.profileImage} alt={formatted.displayName} size="sm" />
                      )}
                      <div className="flex-1 min-w-0">
                        <Typography variant="body1" className="font-medium truncate">
                          {formatted.displayName}
                          {formatted.subText && (
                            <span className="text-gray-500 font-normal"> {formatted.subText}</span>
                          )}
                        </Typography>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                <Typography variant="caption">검색 결과가 없습니다.</Typography>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

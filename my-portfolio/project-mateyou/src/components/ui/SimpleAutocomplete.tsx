import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar, LoadingSpinner, Typography } from './index'

// 공통 아이템 인터페이스
export interface SimpleAutocompleteItem {
  id: string
  displayName: string
  subText?: string
  profileImage?: string
}

interface SimpleAutocompleteProps<T extends SimpleAutocompleteItem> {
  value?: string
  onChange: (id: string, item?: T) => void
  placeholder?: string
  className?: string
  // 전체 데이터
  items: T[]
  isLoading?: boolean
  // 아이템 변환 함수
  formatItem: (item: T) => SimpleAutocompleteItem
  // 선택 시 표시할 텍스트
  getSelectedText: (item: T) => string
  // 검색 필터 함수 (옵션)
  filterFn?: (item: T, query: string) => boolean
  // 이미 선택된 ID 목록 (체크 표시용)
  selectedIds?: string[]
  // 선택 시 프로필+정보 표시 여부
  showSelectedDisplay?: boolean
  // 선택 후 input 초기화 여부
  resetOnSelect?: boolean
  // 아이템에서 선택 비교에 사용할 ID를 반환 (기본: item.id)
  getItemSelectedId?: (item: T) => string
}

// 기본 필터 함수
function defaultFilter<T extends SimpleAutocompleteItem>(item: T, query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return (
    item.displayName.toLowerCase().includes(lowerQuery) ||
    (item.subText?.toLowerCase().includes(lowerQuery) ?? false)
  )
}

// 기본 getItemSelectedId 함수
function defaultGetItemSelectedId<T extends SimpleAutocompleteItem>(item: T): string {
  return item.id
}

export function SimpleAutocomplete<T extends SimpleAutocompleteItem>({
  value,
  onChange,
  placeholder = '검색하세요...',
  className = '',
  items,
  isLoading = false,
  formatItem,
  getSelectedText,
  filterFn = defaultFilter,
  selectedIds = [],
  showSelectedDisplay = false,
  resetOnSelect = false,
  getItemSelectedId = defaultGetItemSelectedId,
}: SimpleAutocompleteProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<T | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 프론트엔드 필터링 (디바운스 필요 없음)
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim()
    if (query.length === 0) return items
    return items.filter((item) => filterFn(item, query))
  }, [items, searchQuery, filterFn])

  // 선택된 아이템 정보 로드 (value prop 변경 시)
  useEffect(() => {
    if (value && !selectedItem) {
      // getItemSelectedId를 사용하여 value와 비교 (getItemSelectedId를 사용하는 경우 대응)
      const found = items.find((item) => getItemSelectedId(item) === value)
      if (found) {
        setSelectedItem(found)
        setSearchQuery(getSelectedText(found))
      }
    }
  }, [value, items, selectedItem, getSelectedText, getItemSelectedId])

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
  }, [isOpen, searchQuery, filteredItems])

  // 외부 클릭 감지
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

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const query = e.target.value
    setSearchQuery(query)
    setSelectedItem(null)
    setIsOpen(true)
  }

  function handleSelectItem(item: T) {
    if (resetOnSelect) {
      // 선택 후 input 초기화 (필터 추가 모드)
      setSelectedItem(null)
      setSearchQuery('')
    } else {
      setSelectedItem(item)
      setSearchQuery(getSelectedText(item))
    }
    setIsOpen(false)
    // getItemSelectedId를 사용하여 올바른 ID 전달
    const selectedId = getItemSelectedId(item)
    onChange(selectedId, item)
  }

  function handleClear() {
    setSearchQuery('')
    setSelectedItem(null)
    setIsOpen(false)
    onChange('')
    inputRef.current?.focus()
  }

  function handleFocus() {
    setIsOpen(true)
  }

  // showSelectedDisplay 모드에서 선택된 아이템의 포맷된 정보
  const selectedFormatted = selectedItem ? formatItem(selectedItem) : null

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {showSelectedDisplay && selectedItem && selectedFormatted ? (
        // 선택된 아이템을 프로필+정보로 표시
        <div className="flex items-center gap-3 px-4 py-2 border border-indigo-300 rounded-lg bg-indigo-50">
          {selectedFormatted.profileImage && (
            <Avatar src={selectedFormatted.profileImage} alt={selectedFormatted.displayName} size="sm" />
          )}
          <div className="flex-1 min-w-0">
            <Typography variant="body1" className="font-medium truncate">
              {selectedFormatted.displayName}
            </Typography>
            {selectedFormatted.subText && (
              <Typography variant="caption" className="text-gray-500 truncate block">
                {selectedFormatted.subText}
              </Typography>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 p-1"
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
        </div>
      ) : (
        // 기본 input 모드
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
      )}

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
            ) : filteredItems.length > 0 ? (
              <div className="py-1">
                {filteredItems.map((item) => {
                  const formatted = formatItem(item)
                  const itemSelectedId = getItemSelectedId(item)
                  const isAlreadySelected = selectedIds.includes(itemSelectedId)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-3 ${
                        isAlreadySelected ? 'bg-indigo-50' : ''
                      }`}
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
                      {isAlreadySelected && (
                        <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                      )}
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

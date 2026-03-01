import { partnerPlusSearchApi, type PartnerPlusSearchResult } from '@/lib/partnerPlusSearchApi'
import { useEffect, useState } from 'react'
import { SimpleAutocomplete, type SimpleAutocompleteItem } from './SimpleAutocomplete'

// 파트너 정보 기반 (partner_plus 역할 필터링됨)
interface PartnerPlus extends SimpleAutocompleteItem, PartnerPlusSearchResult {}

interface PartnerPlusAutocompleteProps {
  value?: string
  onChange: (partnerId: string, partnerPlus?: PartnerPlus) => void
  placeholder?: string
  className?: string
  // 이미 선택된 ID 목록 (체크 표시용)
  selectedIds?: string[]
  // 선택 후 input 초기화 여부
  resetOnSelect?: boolean
}

// PartnerPlus를 AutocompleteItem 형식으로 변환
function formatPartnerPlus(partnerPlus: PartnerPlus): SimpleAutocompleteItem {
  const subParts = []
  if (partnerPlus.member_code) subParts.push(`(${partnerPlus.member_code})`)
  if (partnerPlus.email) subParts.push(`- ${partnerPlus.email}`)

  return {
    id: partnerPlus.id,
    displayName: partnerPlus.partner_name || partnerPlus.name || '',
    subText: subParts.join(' '),
    profileImage: partnerPlus.profile_image,
  }
}

// 선택 시 표시할 텍스트
function getSelectedText(partnerPlus: PartnerPlus): string {
  return partnerPlus.partner_name || partnerPlus.name || partnerPlus.member_code || ''
}

// 검색 필터 함수
function filterPartnerPlus(partnerPlus: PartnerPlus, query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return (
    (partnerPlus.partner_name?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partnerPlus.name?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partnerPlus.member_code?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partnerPlus.email?.toLowerCase().includes(lowerQuery) ?? false)
  )
}

export function PartnerPlusAutocomplete({
  value,
  onChange,
  placeholder = '파트너+를 검색하세요...',
  className = '',
  selectedIds = [],
  resetOnSelect = false,
}: PartnerPlusAutocompleteProps) {
  const [partnerPlusList, setPartnerPlusList] = useState<PartnerPlus[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 초기 로드: 전체 파트너+ 목록 가져오기
  useEffect(() => {
    let isMounted = true

    async function loadPartnerPlusList() {
      setIsLoading(true)
      try {
        const response = await partnerPlusSearchApi.getAll()
        if (isMounted && response.success && response.data) {
          setPartnerPlusList(response.data.map((p: any) => ({ ...p, id: p.id })))
        }
      } catch (error) {
        console.error('❌ Failed to load partner plus list:', error)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadPartnerPlusList()
    return () => { isMounted = false }
  }, [])

  // selectedIds 비교 시 member_id 사용 (timesheet_attendance_records의 partner_plus_id는 member_id를 참조)
  const getItemSelectedId = (partnerPlus: PartnerPlus): string => {
    return partnerPlus.member_id || partnerPlus.id
  }

  return (
    <SimpleAutocomplete<PartnerPlus>
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      items={partnerPlusList}
      isLoading={isLoading}
      formatItem={formatPartnerPlus}
      getSelectedText={getSelectedText}
      filterFn={filterPartnerPlus}
      selectedIds={selectedIds}
      resetOnSelect={resetOnSelect}
      getItemSelectedId={getItemSelectedId}
    />
  )
}

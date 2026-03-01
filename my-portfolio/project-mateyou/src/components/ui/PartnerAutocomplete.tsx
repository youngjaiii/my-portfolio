import { partnerSearchApi } from '@/lib/partnerSearchApi'
import { useEffect, useState } from 'react'
import { SimpleAutocomplete, type SimpleAutocompleteItem } from './SimpleAutocomplete'

interface Partner extends SimpleAutocompleteItem {
  member_id: string
  partner_name?: string
  member_code?: string
  name?: string
  profile_image?: string
  email?: string
}

interface PartnerAutocompleteProps {
  value?: string
  onChange: (partnerId: string, partner?: Partner) => void
  placeholder?: string
  className?: string
  // 이미 선택된 ID 목록 (체크 표시용)
  selectedIds?: string[]
  // 선택 시 프로필+정보 표시 여부
  showSelectedDisplay?: boolean
}

// Partner를 AutocompleteItem 형식으로 변환
function formatPartner(partner: Partner): SimpleAutocompleteItem {
  const subParts = []
  if (partner.member_code) subParts.push(`(${partner.member_code})`)
  if (partner.email) subParts.push(`- ${partner.email}`)

  return {
    id: partner.id,
    displayName: partner.partner_name || partner.name || '',
    subText: subParts.join(' '),
    profileImage: partner.profile_image,
  }
}

// 선택 시 표시할 텍스트
function getSelectedText(partner: Partner): string {
  return partner.partner_name || partner.name || partner.member_code || ''
}

// 검색 필터 함수
function filterPartner(partner: Partner, query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return (
    (partner.partner_name?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.name?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.member_code?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.email?.toLowerCase().includes(lowerQuery) ?? false)
  )
}

// 선택 비교에 사용할 ID (member_id 기준)
function getPartnerSelectedId(partner: Partner): string {
  return partner.member_id
}

export function PartnerAutocomplete({
  value,
  onChange,
  placeholder = '파트너를 검색하세요...',
  className = '',
  selectedIds = [],
  showSelectedDisplay = false,
}: PartnerAutocompleteProps) {
  const [partners, setPartners] = useState<Partner[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 초기 로드: 전체 파트너 목록 가져오기
  useEffect(() => {
    let isMounted = true

    async function loadPartners() {
      setIsLoading(true)
      try {
        const response = await partnerSearchApi.getAll()
        if (isMounted && response.success && response.data) {
          setPartners(response.data.map((p: any) => ({ ...p, id: p.id })))
        }
      } catch (error) {
        console.error('❌ Failed to load partners:', error)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadPartners()
    return () => { isMounted = false }
  }, [])

  return (
    <SimpleAutocomplete<Partner>
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      items={partners}
      isLoading={isLoading}
      formatItem={formatPartner}
      getSelectedText={getSelectedText}
      filterFn={filterPartner}
      selectedIds={selectedIds}
      showSelectedDisplay={showSelectedDisplay}
      getItemSelectedId={getPartnerSelectedId}
    />
  )
}

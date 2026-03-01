import { memberSearchApi } from '@/lib/memberSearchApi'
import { useEffect, useState } from 'react'
import { SimpleAutocomplete, type SimpleAutocompleteItem } from './SimpleAutocomplete'

interface Member extends SimpleAutocompleteItem {
  name?: string
  member_code?: string
  profile_image?: string
  email?: string
  role?: string
}

interface MemberAutocompleteProps {
  value?: string
  onChange: (memberId: string, member?: Member) => void
  placeholder?: string
  filterRole?: 'partner' | 'admin' | 'normal'
  className?: string
  // 이미 선택된 ID 목록 (체크 표시용)
  selectedIds?: string[]
  // 선택 시 프로필+정보 표시 여부
  showSelectedDisplay?: boolean
}

// Member를 AutocompleteItem 형식으로 변환
function formatMember(member: Member): SimpleAutocompleteItem {
  const subParts = []
  if (member.member_code) subParts.push(`(${member.member_code})`)
  if (member.email) subParts.push(`- ${member.email}`)

  return {
    id: member.id,
    displayName: member.name || member.member_code || '',
    subText: subParts.join(' '),
    profileImage: member.profile_image,
  }
}

// 선택 시 표시할 텍스트
function getSelectedText(member: Member): string {
  return member.name || member.member_code || ''
}

// 검색 필터 함수
function filterMember(member: Member, query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return (
    (member.name?.toLowerCase().includes(lowerQuery) ?? false) ||
    (member.member_code?.toLowerCase().includes(lowerQuery) ?? false) ||
    (member.email?.toLowerCase().includes(lowerQuery) ?? false)
  )
}

export function MemberAutocomplete({
  value,
  onChange,
  placeholder = '회원을 검색하세요...',
  filterRole,
  className = '',
  selectedIds = [],
  showSelectedDisplay = false,
}: MemberAutocompleteProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 초기 로드: 전체 회원 목록 가져오기
  useEffect(() => {
    let isMounted = true

    async function loadMembers() {
      setIsLoading(true)
      try {
        const response = await memberSearchApi.getAll(filterRole)
        if (isMounted && response.success && response.data) {
          setMembers(response.data.map((m: any) => ({ ...m, id: m.id })))
        }
      } catch (error) {
        console.error('❌ Failed to load members:', error)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadMembers()
    return () => { isMounted = false }
  }, [filterRole])

  return (
    <SimpleAutocomplete<Member>
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      items={members}
      isLoading={isLoading}
      formatItem={formatMember}
      getSelectedText={getSelectedText}
      filterFn={filterMember}
      selectedIds={selectedIds}
      showSelectedDisplay={showSelectedDisplay}
    />
  )
}

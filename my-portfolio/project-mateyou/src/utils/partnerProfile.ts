import { supabase } from '@/lib/supabase'
import type { Member, PartnerWithMember } from '@/types/database'

const SUPABASE_PUBLIC_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/`
    : ''

export function resolveProfileImageUrl(raw?: string | null): string | undefined {
  if (!raw) {
    return undefined
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
    return raw
  }
  if (!SUPABASE_PUBLIC_BASE) {
    return undefined
  }
  const normalizedPath = raw.replace(/^\/+/, '')
  return `${SUPABASE_PUBLIC_BASE}${normalizedPath}`
}

export function normalizeFavoriteGames(games?: string | string[] | null): string[] {
  if (!games) {
    return []
  }

  if (Array.isArray(games)) {
    return games.filter(Boolean)
  }

  return games
    .split(',')
    .map((game) => game.trim())
    .filter(Boolean)
}

export async function hydrateProfileData(partners: PartnerWithMember[]): Promise<PartnerWithMember[]> {
  if (!partners.length) {
    return partners
  }

  // API 응답에서 members (복수형) 또는 member (단수형) 둘 다 체크
  const memberIds = Array.from(
    new Set(
      partners
        .map((partner) => {
          const memberData = partner.member || (partner as any).members
          return memberData?.id || partner.member_id
        })
        .filter((id): id is string => Boolean(id)),
    ),
  )

  if (!memberIds.length) {
    return partners.map((partner) => {
      const memberData = partner.member || (partner as any).members
      return memberData
        ? {
            ...partner,
            member: {
              ...memberData,
              profile_image: resolveProfileImageUrl(memberData.profile_image),
            },
          }
        : partner
    })
  }

  try {
    const { data, error } = await supabase
      .from('members')
      .select('id, member_code, name, profile_image, current_status, favorite_game, created_at')
      .in('id', memberIds)

    if (error) {
      console.warn('프로필 이미지 조회 실패:', error.message)
      return partners
    }

    const profileMap = new Map<
      string,
      {
        profile_image?: string | null
        current_status?: string | null
        favorite_game?: string[] | string | null
        member_code?: string | null
        name?: string | null
        created_at?: string
      }
    >((data ?? []).map((entry) => [entry.id, entry]))

    return partners.map((partner) => {
      // API 응답에서 members (복수형) 또는 member (단수형) 둘 다 체크
      const existingMember = partner.member || (partner as any).members
      const memberId = existingMember?.id || partner.member_id || ''
      
      if (!memberId) {
        return {
          ...partner,
          member: existingMember ?? {
            id: `unknown-${partner.id}`,
            member_code: partner.partner_name ?? 'unknown',
            name: partner.partner_name ?? '알 수 없음',
            profile_image: undefined,
            favorite_game: [],
            current_status: 'offline',
            created_at: partner.created_at || new Date().toISOString(),
          },
        }
      }

      const profileData = profileMap.get(memberId)

      const resolvedProfile = resolveProfileImageUrl(
        profileData?.profile_image ?? existingMember?.profile_image ?? undefined,
      )

      const baseGames =
        existingMember && existingMember.favorite_game
          ? Array.isArray(existingMember.favorite_game)
            ? existingMember.favorite_game
            : normalizeFavoriteGames(existingMember.favorite_game)
          : []

      const overrideGames =
        profileData && profileData.favorite_game !== undefined && profileData.favorite_game !== null
          ? Array.isArray(profileData.favorite_game)
            ? profileData.favorite_game
            : normalizeFavoriteGames(profileData.favorite_game)
          : baseGames

      const resolvedMember: Member = {
        id: existingMember?.id ?? memberId,
        member_code: existingMember?.member_code || profileData?.member_code || '',
        name: existingMember?.name || profileData?.name || partner.partner_name || '파트너',
        profile_image: resolvedProfile,
        favorite_game: overrideGames,
        current_status: existingMember?.current_status || profileData?.current_status || 'offline',
        created_at:
          existingMember?.created_at ||
          profileData?.created_at ||
          partner.created_at ||
          new Date().toISOString(),
      }

      return {
        ...partner,
        member: resolvedMember,
      }
    })
  } catch (fetchError) {
    console.warn('프로필 이미지 보강 중 오류:', fetchError)
    return partners
  }
}

export function getPartnerDisplayLabel(partner?: {
  partner_name?: string | null
  legal_name?: string | null
  member?: { member_code?: string | null; name?: string | null }
}): string {
  if (!partner) return '파트너'

  const partnerName = partner.partner_name?.trim()
  const legalName = (partner as { legal_name?: string | null }).legal_name?.trim()
  const memberName = partner.member?.name?.trim()
  const memberCode = partner.member?.member_code?.trim()

  // 우선순위: partner_name > member.name > memberCode > '파트너'
  if (partnerName && partnerName !== legalName) {
    return partnerName
  }

  if (memberName) {
    return memberName
  }

  return memberCode || '파트너'
}

export function getPartnerAvatarLabel(partner?: {
  partner_name?: string | null
  member?: { member_code?: string | null; name?: string | null }
}): string {
  if (!partner) return '파트너'

  const partnerName = partner.partner_name?.trim()
  const memberName = partner.member?.name?.trim()
  const memberCode = partner.member?.member_code?.trim()

  // 우선순위: partner_name > member.name > memberCode > '파트너'
  if (partnerName) {
    return partnerName
  }

  if (memberName) {
    return memberName
  }

  return memberCode || '파트너'
}

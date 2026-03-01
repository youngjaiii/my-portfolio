import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { AvatarWithFallback, OnlineIndicator, Typography } from '@/components'
import type { PartnerWithMember } from '@/types/database'
import { edgeApi } from '@/lib/edgeApi'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { useNavigate } from '@tanstack/react-router'

type PartnerListMode = 'subscriptions' | 'following'

interface PartnerListSheetProps {
  mode: PartnerListMode
  isOpen: boolean
  onClose: () => void
}

const titleMap: Record<PartnerListMode, string> = {
  subscriptions: '구독한 파트너',
  following: '팔로잉 중인 파트너',
}

const descriptionMap: Record<PartnerListMode, string> = {
  subscriptions: '구독한 파트너 목록입니다.',
  following: '팔로잉 중인 파트너를 확인하고 빠르게 소통해보세요.',
}

type PartnerListItem = {
  id: string
  partnerName: string
  partnerCode?: string
  profileImage?: string
  message?: string
  isOnline: boolean
  membershipName?: string
  membershipPrice?: number
  subscriptionId?: string
  autoRenewalEnabled?: boolean
}

export function PartnerListSheet({ mode, isOpen, onClose }: PartnerListSheetProps) {
  const [isMounted, setIsMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)
  const [partners, setPartners] = useState<PartnerListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const navigate = useNavigate()

  // 자동연장 토글 핸들러
  const handleToggleAutoRenewal = async (partner: PartnerListItem, event: React.MouseEvent) => {
    event.stopPropagation() // 클릭 이벤트 전파 방지
    
    if (!partner.subscriptionId || togglingIds.has(partner.subscriptionId)) return
    
    const subscriptionId = partner.subscriptionId
    const newValue = !partner.autoRenewalEnabled
    
    setTogglingIds(prev => new Set(prev).add(subscriptionId))
    
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) throw new Error('로그인이 필요합니다.')
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership-subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auto_renewal_enabled: newValue }),
      })
      
      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || '자동연장 설정 변경에 실패했습니다.')
      }
      
      // 로컬 상태 업데이트
      setPartners(prev => prev.map(p => 
        p.subscriptionId === subscriptionId 
          ? { ...p, autoRenewalEnabled: newValue }
          : p
      ))
    } catch (error: any) {
      console.error('자동연장 토글 실패:', error)
      alert(error?.message || '자동연장 설정 변경에 실패했습니다.')
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(subscriptionId)
        return next
      })
    }
  }

  const mapFromPartner = (partner: PartnerWithMember): PartnerListItem => {
    const partnerCode = partner?.member?.member_code ?? undefined
    const partnerName =
      partner.partner_name ||
      partner.member?.name ||
      partnerCode ||
      '파트너'

    return {
      id: partner.id,
      partnerName,
      partnerCode,
      profileImage: partner.member?.profile_image ?? undefined,
      message: partner.partner_message ?? undefined,
      isOnline: Boolean(partner.member?.current_status && partner.member.current_status !== 'offline'),
    }
  }

  const mapFromFollowResponse = (item: any, index: number): PartnerListItem => {
    // API 응답: { id, partner_name, profile_image, member_code, current_status, follow_count, is_followed }
    const partnerCode = item?.member_code || item?.partner_code || item?.member?.member_code || ''
    const id = item?.id || item?.partner_id || partnerCode || `follow-${index}`
    const partnerName = item?.partner_name || item?.name || partnerCode || '알 수 없음'
    const profileImage = item?.profile_image || item?.member?.profile_image || undefined
    const message = item?.partner_message || item?.greeting || item?.bio || undefined
    const isOnline =
      item?.current_status && item.current_status !== 'offline'
        ? true
        : typeof item?.is_online === 'boolean'
          ? item.is_online
          : Boolean(item?.member?.current_status && item.member.current_status !== 'offline')

    return {
      id,
      partnerName,
      partnerCode: partnerCode || undefined,
      profileImage,
      message,
      isOnline,
    }
  }

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let raf1: number | null = null
    let raf2: number | null = null

    if (isOpen) {
      setIsMounted(true)
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      timeoutId = setTimeout(() => setIsMounted(false), 340)
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let mounted = true
    const fetchPartners = async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          throw new Error('로그인이 필요합니다.')
        }
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

        if (mode === 'following') {
          const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-follow`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          })
          const result = await response.json()
          if (!response.ok || !result.success) {
            throw new Error(result.error || '팔로잉 목록을 불러오지 못했습니다.')
          }
          if (!mounted) return
          const followingList = Array.isArray(result.data) ? result.data : result.data?.following ?? []
          setPartners(followingList.map(mapFromFollowResponse))
          return
        }

        // subscriptions 모드: 구독한 멤버쉽 목록 조회
        const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership-subscriptions`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || '구독 목록을 불러오지 못했습니다.')
        }
        if (!mounted) return
        
        // 구독 멤버쉽에서 파트너 정보 추출
        const subscriptions = Array.isArray(result.data) ? result.data : []
        console.log('📋 구독 목록:', subscriptions)
        
        // 파트너별로 그룹화하여 중복 제거
        const partnerMap = new Map<string, PartnerListItem>()
        
        for (const sub of subscriptions) {
          const membership = sub.membership
          if (!membership) {
            console.log('⚠️ membership 없음:', sub)
            continue
          }
          
          // partner 정보가 있는 경우 (새 API)
          const partner = membership.partner
          
          if (partner) {
            const partnerId = partner.id
            if (partnerMap.has(partnerId)) continue
            
            const member = partner.member
            const partnerCode = member?.member_code || ''
            const partnerName = partner.partner_name || member?.name || '파트너'
            const profileImage = member?.profile_image || undefined
            const message = partner.partner_message || undefined
            const isOnline = Boolean(member?.current_status && member.current_status !== 'offline')
            
            partnerMap.set(partnerId, {
              id: partnerId,
              partnerName,
              partnerCode: partnerCode || undefined,
              profileImage,
              message,
              isOnline,
              membershipName: membership.name,
              membershipPrice: membership.monthly_price,
              subscriptionId: sub.id,
              autoRenewalEnabled: sub.auto_renewal_enabled ?? true,
            })
          } else if (membership.partner_id) {
            // partner 정보가 없지만 partner_id가 있는 경우 (이전 API 호환)
            const partnerId = membership.partner_id
            if (partnerMap.has(partnerId)) continue
            
            console.log('⚠️ partner 정보 없음, partner_id만 있음:', membership.partner_id)
            
            // 멤버쉽 정보만이라도 표시
            partnerMap.set(partnerId, {
              id: partnerId,
              partnerName: membership.name || '구독 멤버쉽',
              partnerCode: undefined,
              profileImage: undefined,
              message: membership.description || undefined,
              isOnline: false,
              membershipName: membership.name,
              membershipPrice: membership.monthly_price,
              subscriptionId: sub.id,
              autoRenewalEnabled: sub.auto_renewal_enabled ?? true,
            })
          }
        }
        
        console.log('👥 파트너 목록:', Array.from(partnerMap.values()))
        setPartners(Array.from(partnerMap.values()))
      } catch (error: any) {
        if (!mounted) return
        setPartners([])
        setErrorMessage(error?.message || '파트너 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }
    fetchPartners()
    return () => {
      mounted = false
    }
  }, [authAccessToken, authRefreshToken, isOpen, mode, syncSession])

  useEffect(() => {
    if (isMounted) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
    return
  }, [isMounted])

  const title = useMemo(() => titleMap[mode], [mode])
  const description = useMemo(() => descriptionMap[mode], [mode])

  if (!isMounted) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col bg-white shadow-2xl transition-transform duration-400 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: 'calc(100% - env(safe-area-inset-top, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <header className="relative border-b border-gray-100 px-6 py-4">
          <button
            className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full py-2 text-gray-500 transition hover:bg-gray-100"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
          <Typography variant="h5" className="text-center text-lg font-semibold text-[#110f1a]">
            {title}
          </Typography>
        </header>

        <div className="px-6 py-4">
          <Typography variant="body2" className="text-sm text-gray-500">
            {description}
          </Typography>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-10">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>목록을 불러오는 중입니다...</span>
            </div>
          ) : errorMessage ? (
            <div className="rounded-3xl border border-red-100 bg-red-50 px-4 py-10 text-center text-sm text-red-600 shadow-sm">
              {errorMessage}
            </div>
          ) : partners.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
              <span>{mode === 'following' ? '팔로우 중인 파트너가 없습니다.' : '구독 중인 파트너가 없습니다.'}</span>
              <span className="text-xs text-gray-300">
                {mode === 'following' ? '마음에 드는 파트너를 팔로우해보세요.' : '구독하고 새로운 콘텐츠를 만나보세요.'}
              </span>
            </div>
          ) : (
            <div className="pb-8">
              {partners.map((partner) => {
                const canNavigate = Boolean(partner.partnerCode)
                const handleNavigate = () => {
                  if (!canNavigate || !partner.partnerCode) return
                  navigate({
                    to: '/partners/$memberCode',
                    params: { memberCode: partner.partnerCode },
                  })
                  onClose()
                }

                return (
                  <div
                    key={partner.id}
                    role={canNavigate ? 'button' : undefined}
                    tabIndex={canNavigate ? 0 : -1}
                    onClick={handleNavigate}
                    onKeyDown={(event) => {
                      if (!canNavigate) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleNavigate()
                      }
                    }}
                    className={`flex items-center gap-3 py-3 transition-opacity ${
                      canNavigate ? 'cursor-pointer' : 'cursor-default opacity-80'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <AvatarWithFallback name={partner.partnerName} src={partner.profileImage} size="md" />
                      <div className="absolute -bottom-1 -right-1">
                        <OnlineIndicator isOnline={partner.isOnline} size="sm" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Typography variant="body1" className="truncate font-semibold text-[#110f1a]">
                        {partner.partnerName}
                      </Typography>
                      {mode === 'subscriptions' && partner.membershipName ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Typography variant="body2" className="truncate text-[#FE3A8F] font-medium">
                            {partner.membershipName}
                          </Typography>
                          {partner.membershipPrice && (
                            <Typography variant="caption" className="text-gray-500">
                              {partner.membershipPrice.toLocaleString()}P/월
                            </Typography>
                          )}
                        </div>
                      ) : partner.message ? (
                        <Typography variant="body2" className="mt-0.5 truncate text-gray-600">
                          {partner.message}
                        </Typography>
                      ) : null}
                    </div>
                    
                    {/* 자동연장 스위치 (구독 모드에서만) */}
                    {mode === 'subscriptions' && partner.subscriptionId && (
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Typography variant="caption" className="text-gray-500 text-[10px]">
                          자동연장
                        </Typography>
                        <button
                          onClick={(e) => handleToggleAutoRenewal(partner, e)}
                          disabled={togglingIds.has(partner.subscriptionId!)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                            partner.autoRenewalEnabled ? 'bg-[#FE3A8F]' : 'bg-gray-300'
                          } ${togglingIds.has(partner.subscriptionId!) ? 'opacity-50' : ''}`}
                          aria-label={partner.autoRenewalEnabled ? '자동연장 끄기' : '자동연장 켜기'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                              partner.autoRenewalEnabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}


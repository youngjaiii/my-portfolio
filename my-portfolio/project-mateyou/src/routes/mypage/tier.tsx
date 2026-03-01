import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Swiper, SwiperSlide } from 'swiper/react'
import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { AvatarWithFallback, Typography } from '@/components'

export const Route = createFileRoute('/mypage/tier')({
  component: TierPage,
})

// 로직용 (diamond=0 = 최상위)
const TIER_ORDER = ['diamond', 'platinum', 'gold', 'silver', 'bronze'] as const
type TierCode = (typeof TIER_ORDER)[number]

// 화면 표시용 (bronze→diamond, 낮은→높은)
const TIER_DISPLAY = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const

const TIER_LABEL: Record<string, string> = {
  diamond: '다이아',
  platinum: '플래티넘',
  gold: '골드',
  silver: '실버',
  bronze: '브론즈',
}

const TIER_RING: Record<string, string> = {
  diamond: 'ring-cyan-400/60',
  platinum: 'ring-slate-400/60',
  gold: 'ring-amber-400/60',
  silver: 'ring-gray-400/60',
  bronze: 'ring-amber-700/60',
}

const TIER_ICON: Record<string, string> = {
  diamond: '/icon/tier/tier_diamond.png',
  platinum: '/icon/tier/tier_platinum.png',
  gold: '/icon/tier/tier_gold.png',
  silver: '/icon/tier/tier_silver.png',
  bronze: '/icon/tier/tier_bronze.png',
}

type LeaderboardRow = {
  partner_id: string
  tier_code: string
  tier_frozen: boolean | null
  total_score: number | null
  snapshot_date: string | null
  member_id: string
  member_name: string | null
  member_profile_image: string | null
  member_code: string | null
}

type TierBaseline = {
  tier_code: string
  rank_in_tier: number
  snapshot_date: string | null
}

function getBaseline(partnerId: string): TierBaseline | null {
  try {
    const raw = localStorage.getItem(`tier_baseline_${partnerId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveBaseline(partnerId: string, baseline: TierBaseline) {
  try {
    localStorage.setItem(`tier_baseline_${partnerId}`, JSON.stringify(baseline))
  } catch { /* noop */ }
}

function tierIndex(code: string): number {
  const idx = TIER_ORDER.indexOf(code as TierCode)
  return idx === -1 ? TIER_ORDER.length : idx
}

function TierPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [myPartnerId, setMyPartnerId] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const swiperRef = useRef<SwiperType | null>(null)
  const [tierChange, setTierChange] = useState<'up' | 'down' | null>(null)
  const [animReady, setAnimReady] = useState(false)
  const [showEntranceOverlay, setShowEntranceOverlay] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    const run = async () => {
      const { data: partnerRow } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .eq('partner_status', 'approved')
        .maybeSingle()
      setMyPartnerId(partnerRow?.id ?? null)

      const { data: list, error } = await supabase
        .from('partner_tier_leaderboard')
        .select('partner_id, tier_code, tier_frozen, total_score, snapshot_date, member_id, member_name, member_profile_image, member_code')
      if (error) {
        console.error('tier leaderboard', error)
        setRows([])
      } else {
        setRows((list as LeaderboardRow[]) ?? [])
      }
      setLoading(false)
    }
    run()
  }, [user?.id])

  const { myRow, byTier } = useMemo(() => {
    const my = myPartnerId ? rows.find((r) => r.partner_id === myPartnerId) ?? null : null
    const map: Record<string, LeaderboardRow[]> = {}
    for (const t of TIER_ORDER) map[t] = []
    for (const r of rows) {
      const tier = String(r.tier_code)
      if (map[tier]) map[tier].push(r)
    }
    for (const t of TIER_ORDER) {
      map[t].sort((a, b) => (Number(b.total_score) ?? 0) - (Number(a.total_score) ?? 0))
    }
    return { myRow: my, byTier: map }
  }, [rows, myPartnerId])

  useEffect(() => {
    if (loading || !myRow || !myPartnerId) return

    const currentTier = myRow.tier_code
    const tierList = byTier[currentTier] ?? []
    const rankInTier = tierList.findIndex((r) => r.partner_id === myPartnerId) + 1

    const prev = getBaseline(myPartnerId)
    let didChange: 'up' | 'down' | null = null
    if (prev) {
      const prevIdx = tierIndex(prev.tier_code)
      const curIdx = tierIndex(currentTier)
      if (curIdx < prevIdx) didChange = 'up'
      else if (curIdx > prevIdx) didChange = 'down'
    }
    setTierChange(didChange)

    saveBaseline(myPartnerId, {
      tier_code: currentTier,
      rank_in_tier: rankInTier,
      snapshot_date: myRow.snapshot_date,
    })

    const displayIdx = TIER_DISPLAY.indexOf(currentTier as TierCode)
    if (displayIdx !== -1) {
      setActiveIndex(displayIdx)
      setTimeout(() => swiperRef.current?.slideTo(displayIdx, 0), 50)
    }

    if (didChange) {
      setShowEntranceOverlay(true)
      const timer = setTimeout(() => {
        setShowEntranceOverlay(false)
        setAnimReady(true)
      }, 2500)
      return () => clearTimeout(timer)
    }
    setAnimReady(true)
  }, [loading, myRow, myPartnerId, byTier])

  useEffect(() => {
    if (!loading && (!myRow || !myPartnerId)) {
      const timer = setTimeout(() => setAnimReady(true), 80)
      return () => clearTimeout(timer)
    }
  }, [loading, myRow, myPartnerId])

  const handleStripClick = useCallback((idx: number) => {
    setActiveIndex(idx)
    swiperRef.current?.slideTo(idx)
  }, [])

  if (!user) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex items-center justify-center p-4">
        <Typography variant="body2" className="text-gray-400">로그인이 필요합니다.</Typography>
      </div>
    )
  }

  if (!loading && user.role !== 'partner') {
    return (
      <div className="min-h-screen bg-[#110f1a]">
        <TierHeader />
        <div className="p-4">
          <Typography variant="body2" className="text-gray-400">파트너 전용 페이지입니다.</Typography>
        </div>
      </div>
    )
  }

  if (!loading && user.role === 'partner' && !myPartnerId) {
    return (
      <div className="min-h-screen bg-[#110f1a]">
        <TierHeader />
        <div className="p-4">
          <Typography variant="body2" className="text-gray-400">승인된 파트너만 티어를 확인할 수 있습니다.</Typography>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#110f1a] flex flex-col overflow-hidden">
      <TierHeader />
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-500 text-sm">불러오는 중...</span>
        </div>
      ) : (
        <>
          {/* 진입 오버레이: 뱃지 애니메이션 + 상승/하락 텍스트 */}
          <AnimatePresence>
            {showEntranceOverlay && myRow && tierChange && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#110f1a]"
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.15, 1], opacity: 1 }}
                  transition={{ duration: 0.6, times: [0, 0.7, 1] }}
                  className="w-32 h-32 flex items-center justify-center"
                >
                  <img
                    src={TIER_ICON[myRow.tier_code] ?? TIER_ICON.bronze}
                    alt={TIER_LABEL[myRow.tier_code] ?? ''}
                    className="w-full h-full object-contain drop-shadow-2xl"
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.35 }}
                  className={`flex items-center gap-2 mt-6 ${tierChange === 'up' ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {tierChange === 'up' ? <ArrowUp className="h-6 w-6" /> : <ArrowDown className="h-6 w-6" />}
                  <span className="text-xl font-semibold">
                    {tierChange === 'up' ? '티어가 상승했습니다' : '티어가 하락했습니다'}
                  </span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 티어 뱃지 strip - 액티브 뱃지 크게 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={animReady ? { opacity: 1 } : {}}
            transition={{ duration: 0.35, delay: tierChange ? 0.3 : 0.1 }}
            className="flex items-center justify-center gap-5 pt-3 pb-4 px-4 h-[120px]"
          >
            {TIER_DISPLAY.map((t, idx) => {
              const isActive = idx === activeIndex
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleStripClick(idx)}
                  className="flex flex-col items-center gap-1 w-[56px]"
                >
                  <div className="h-[76px] flex items-center justify-center">
                    <motion.div
                      animate={isActive
                        ? { width: 72, height: 72, opacity: 1 }
                        : { width: 40, height: 40, opacity: 0.45 }
                      }
                      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                      className={`flex items-center justify-center ${isActive ? `ring-2 rounded-full ${TIER_RING[t]}` : ''}`}
                    >
                      <img src={TIER_ICON[t]} alt={TIER_LABEL[t]} className="w-full h-full object-contain" />
                    </motion.div>
                  </div>
                  <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-600'}`}>
                    {TIER_LABEL[t]}
                  </span>
                </button>
              )
            })}
          </motion.div>

          {/* 내 티어 + 점수 (슬라이드 밖 고정) */}
          {myRow && (
            <div className="flex items-center gap-2 mx-4 mb-1 px-3 py-2 rounded-lg bg-white/[0.06]">
              <img src={TIER_ICON[myRow.tier_code]} alt="" className="w-5 h-5 object-contain" />
              <span className="text-gray-300 text-xs font-medium">
                내 티어: {TIER_LABEL[myRow.tier_code]}
              </span>
              <span className="text-gray-500 text-xs">|</span>
              <span className="text-gray-400 text-xs font-semibold tabular-nums">
                {`${Math.round(Number(myRow.total_score ?? 0))}점`}
              </span>
              {myRow.tier_frozen && <span className="text-red-400 text-[10px]">(동결)</span>}
            </div>
          )}
          <div className="px-4 py-2 flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-gray-500 animate-pulse" />
            <span className="text-xs text-gray-500">티어 수수료는 티어에 따라 차등 적용됩니다</span>
          </div>

          {/* Swiper - 한 슬라이드 = 한 티어 랭킹 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={animReady ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: tierChange ? 0.5 : 0.3 }}
            className="flex-1 min-h-0 overflow-hidden"
          >
            <Swiper
              onSwiper={(sw) => { swiperRef.current = sw }}
              onSlideChange={(sw) => setActiveIndex(sw.activeIndex)}
              slidesPerView={1}
              spaceBetween={0}
              className="h-full"
            >
              {TIER_DISPLAY.map((tier) => {
                const list = byTier[tier] ?? []
                return (
                  <SwiperSlide key={tier} className="!h-full !overflow-y-auto">
                    <div className="px-4 pt-2 pb-8">
                      <div className="flex items-center gap-2 mb-3">
                        <img src={TIER_ICON[tier]} alt={TIER_LABEL[tier]} className="w-6 h-6 object-contain" />
                        <span className="text-white font-semibold text-sm">{TIER_LABEL[tier]}</span>
                        <span className="text-gray-500 text-xs">({list.length}명)</span>
                      </div>

                      {list.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-8">아직 소속된 파트너가 없습니다.</p>
                      ) : (
                        <ul className="space-y-1">
                          {list.map((r, idx) => {
                            const isMe = r.partner_id === myPartnerId
                            return (
                              <li
                                key={r.partner_id}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isMe ? 'bg-white/10' : 'bg-white/[0.04]'}`}
                              >
                                <span className="w-5 text-xs text-gray-500 font-medium tabular-nums text-right">{idx + 1}</span>
                                <AvatarWithFallback
                                  src={r.member_profile_image ?? undefined}
                                  alt={r.member_name ?? ''}
                                  className="h-8 w-8 rounded-full flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className={`text-sm font-medium truncate block ${isMe ? 'text-[#FE3A8F]' : 'text-gray-200'}`}>
                                    {r.member_name || '이름 없음'}
                                    {isMe && <span className="ml-1 text-xs">(나)</span>}
                                  </span>
                                  {r.member_code && (
                                    <span className="text-xs text-gray-500 block">@{r.member_code}</span>
                                  )}
                                </div>
                                <span className="text-xs font-semibold text-gray-400 tabular-nums">
                                  {`${Math.round(Number(r.total_score ?? 0))}점`}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </SwiperSlide>
                )
              })}
            </Swiper>
          </motion.div>
        </>
      )}
    </div>
  )
}

function TierHeader() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-10 bg-[#110f1a]/90 backdrop-blur border-b border-white/10 flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={() => navigate({ to: '/mypage' })}
        className="p-2 -ml-1 rounded-full hover:bg-white/10"
        aria-label="뒤로"
      >
        <ChevronLeft className="h-6 w-6 text-gray-300" />
      </button>
      <span className="flex-1 text-white font-semibold text-base">티어</span>
    </header>
  )
}

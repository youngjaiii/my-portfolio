import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Bold, Eye, EyeOff, GripVertical, Highlighter, Image as ImageIcon, Italic, Link as LinkIcon, List, MessageCircle, Palette, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import type { Database } from '@/types/database'
import {
    AvatarWithFallback,
    BannedWordsManagement,
    BannerModal,
    Button,
    DatePicker,
    Flex,
    Grid,
    Modal,
    ToastContainer,
    Typography,
} from '@/components'
import { Swiper, SwiperSlide } from 'swiper/react'
import type { Swiper as SwiperType } from 'swiper'
import { Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import { AdminRouletteManagement } from '@/components/features/admin'
import { ImageUpload } from '@/components/forms/ImageUpload'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'
import { api, mateYouApi } from '@/lib/apiClient'
import { edgeApi } from '@/lib/edgeApi'
import { getStatusLabel } from '@/utils/statusUtils'
import { exportPointsLogsToExcel } from '@/utils/exportExcel'
import {
    createBanner,
    deleteBanner,
    getAllBanners,
    toggleBannerStatus,
    updateBanner,
} from '@/lib/bannerApi'
import { supabase } from '@/lib/supabase'
import {
    maskAccountNumber,
    maskEmail,
    maskName,
    maskPhoneNumber,
} from '@/utils/maskId'

type AdminTab = 'overview' | 'partners' | 'withdrawals' | 'payouts' | 'members' | 'banners' | 'logs' | 'notices' | 'banned-words' | 'explorer' | 'store' | 'roulette' | 'partner-revenue' | 'test'
type AdminCategory = 'dashboard' | 'users' | 'settlement' | 'content'

const ADMIN_TAB_GROUPS: { category: AdminCategory; label: string; tabs: { id: AdminTab; label: string }[] }[] = [
  { category: 'dashboard', label: '대시보드', tabs: [{ id: 'overview', label: '개요' }] },
  { category: 'users', label: '사용자', tabs: [{ id: 'members', label: '회원' }, { id: 'partners', label: '파트너' }] },
  { category: 'settlement', label: '정산', tabs: [{ id: 'withdrawals', label: '출금 요청' }, { id: 'payouts', label: '토스 지급대행' }, { id: 'logs', label: '포인트 로그' }, { id: 'partner-revenue', label: '파트너 전체 수익' }] },
  { category: 'content', label: '콘텐츠', tabs: [{ id: 'banners', label: '배너' }, { id: 'notices', label: '공지사항' }, { id: 'banned-words', label: '금지어' }, { id: 'explorer', label: '탐색' }, { id: 'store', label: '스토어' }, { id: 'roulette', label: '룰렛 관리' }] },
]

const getCategoryByTab = (tab: AdminTab): AdminCategory => {
  for (const group of ADMIN_TAB_GROUPS) {
    if (group.tabs.some(t => t.id === tab)) return group.category
  }
  return 'dashboard'
}

type MemberData = Database['public']['Tables']['members']['Row']
type PartnerData = Database['public']['Tables']['partners']['Row']
type PartnerBusinessInfo = {
  id?: number
  partner_id: string
  tax?: number | null
  legal_name?: string | null
  legal_email?: string | null
  legal_phone?: string | null
  payout_bank_code?: string | null
  payout_bank_name?: string | null
  payout_account_number?: string | null
  payout_account_holder?: string | null
  business_type?: string | null
  default_distribution_rate?: number | null
  collaboration_distribution_rate?: number | null
  created_at?: string
  updated_at?: string
}
type PartnerWithMember = PartnerData & { member: MemberData; partner_business_info?: PartnerBusinessInfo | null }
type WithdrawalType = 'total_points' | 'store_points' | 'collaboration_store_points'
type WithdrawalRequest =
  Database['public']['Tables']['partner_withdrawals']['Row'] & {
    partner: PartnerData & { member: MemberData; business_info?: PartnerBusinessInfo | null }
    withdrawal_type?: WithdrawalType | null
    tier_code?: string | null
    rate_type?: string | null
    applicable_rate?: number | null
  }

const TIER_BADGE_STYLE: Record<string, { bg: string; label: string }> = {
  diamond:  { bg: 'bg-cyan-100 text-cyan-800', label: '다이아' },
  platinum: { bg: 'bg-slate-100 text-slate-800', label: '플래티넘' },
  gold:     { bg: 'bg-yellow-100 text-yellow-800', label: '골드' },
  silver:   { bg: 'bg-gray-100 text-gray-800', label: '실버' },
  bronze:   { bg: 'bg-amber-100 text-amber-800', label: '브론즈' },
}

function getTierBadge(tierCode?: string | null) {
  const tier = TIER_BADGE_STYLE[tierCode || 'bronze'] || TIER_BADGE_STYLE.bronze
  return tier
}

function getRateLabel(rateType?: string | null): string {
  if (!rateType) return '일반'
  if (rateType.startsWith('tier_')) {
    const tierCode = rateType.replace('tier_', '')
    const tier = TIER_BADGE_STYLE[tierCode]
    return tier ? `${tier.label} 티어` : '티어'
  }
  if (rateType === 'default_distribution_rate') return '스토어 배분'
  if (rateType === 'full_payout') return '전액 지급'
  if (rateType === 'collaboration') return '협업'
  return '일반'
}
type AdminWithdrawalStats = {
  byType: {
    total_points: { total: number; pending: number; approved: number; completed: number; rejected: number }
    store_points: { total: number; pending: number; approved: number; completed: number; rejected: number }
    collaboration_store_points: { total: number; pending: number; approved: number; completed: number; rejected: number }
  }
}
type Banner = Database['public']['Tables']['ad_banners']['Row']
type MemberPointsLog = Database['public']['Tables']['member_points_logs']['Row']
type PartnerPointsLog = Database['public']['Tables']['partner_points_logs']['Row']

type MemberPointsLogWithMember = MemberPointsLog & { member_name?: string; member_code?: string }
type PartnerPointsLogWithPartner = PartnerPointsLog & { partner_name?: string }

type PartnerRevenueRow = {
  id: string
  client_id?: string
  client_name?: string | null
  client_code?: string | null
  total_coins?: number
  requested_at?: string
  completed_at?: string | null
  job_count?: number
  coins_per_job?: number | null
}
type PartnerRevenueMembershipRow = {
  id: string
  user_id: string
  subscriber_name: string | null
  subscriber_code: string | null
  started_at: string | null
  expired_at: string | null
  membership_name: string | null
  months: number
  price_per_month: number
  total_amount: number
}
type PartnerRevenuePostUnlockRow = {
  id: string
  user_id: string
  post_id: string
  point_price: number
  purchased_at: string | null
  post_title: string | null
}
type PartnerRevenueDonationRow = {
  id: number
  donor_id: string
  donor_name: string | null
  donor_code: string | null
  amount: number
  created_at: string
  description: string | null
}
type PartnerRevenueData = {
  quest: PartnerRevenueRow[]
  membership: PartnerRevenueMembershipRow[]
  postUnlocks: PartnerRevenuePostUnlockRow[]
  donations: PartnerRevenueDonationRow[]
  totals: { quest: number; membership: number; postUnlocks: number; donations: number; total: number }
}

// 토스 지급대행(Payout) 타입
type TossPayoutItem = {
  id: string  // FPA_xxxxx
  refPayoutId: string
  destination: string  // 셀러 ID
  scheduleType: 'NOW' | 'SCHEDULED'
  payoutDate: string  // YYYY-MM-DD
  amount: {
    currency: string
    value: number
  }
  transactionDescription: string
  requestedAt: string  // ISO 8601
  status: 'REQUESTED' | 'COMPLETED' | 'FAILED' | 'CANCELED'
  error: { code: string; message: string } | null
  metadata: Record<string, string>
  partnerInfo?: {
    partnerId: string
    partnerName: string
    memberName: string
    memberCode: string
  }
  withdrawalInfo?: {
    withdrawalType: WithdrawalType | null
    requestedAmount?: number
    rateType: 'default' | 'collaboration' | 'tax' | null
    applicableRate: number | null
  }
}

// 공지사항 타입
type NoticeItem = {
  id: string
  title: string
  content: string
  category: 'general' | 'update' | 'event' | 'maintenance'
  is_pinned: boolean
  view_count: number
  created_at: string
  updated_at: string
  author_id?: string
  author_name?: string
}

// 탐색 카테고리 타입
type ExplorerCategory = {
  id: string
  name: string
  hashtag: string | null
  is_pinned: boolean
  sort_order: number
  partner_category_id: number | null
  section_type: string | null
  created_at: string
  updated_at: string
}

const PARTNER_CATEGORY_OPTIONS = [
  { id: 1, label: '메이트' },
  { id: 2, label: '샐럽/모델' },
  { id: 3, label: '메이드' },
  { id: 4, label: '지하돌' },
  { id: 5, label: '코스어' },
]

// 탐색 카테고리 파트너 타입
type ExplorerCategoryPartner = {
  id: string
  explore_category_id: string
  partner_id: string
  banners: string | null
  sort_order: number
  created_at: string
  updated_at: string
  partner?: {
    id: string
    partner_name: string | null
    partner_message: string | null
    member?: {
      id: string
      name: string | null
      member_code: string | null
      profile_image: string | null
    }
  }
}

// 스토어 배너 타입
type StoreBanner = {
  id: string
  banner: string
  sort_order: number
  created_at: string
}

// 스토어 추천 파트너 타입
type StoreRecommended = {
  id: string
  partner_id: string
  sort_order: number
  created_at: string
  partner?: {
    id: string
    partner_name: string | null
    member?: {
      id: string
      name: string | null
      profile_image: string | null
      member_code: string | null
    }
  }
}

// 카테고리 라벨 및 색상
const NOTICE_CATEGORY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  general: { label: '일반', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  update: { label: '업데이트', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  event: { label: '이벤트', color: 'text-[#FE3A8F]', bgColor: 'bg-pink-100' },
  maintenance: { label: '점검', color: 'text-orange-700', bgColor: 'bg-orange-100' },
}

const SUPABASE_PUBLIC_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/`
  : ''

function resolveImageUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  if (!SUPABASE_PUBLIC_BASE) return undefined
  return `${SUPABASE_PUBLIC_BASE}${raw.replace(/^\/+/, '')}`
}

export const Route = createFileRoute('/dashboard/admin')({
  component: AdminDashboardPage,
})

function AdminDashboardPage() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const tab = urlParams.get('tab') || 'overview'
      if (['overview', 'partners', 'withdrawals', 'payouts', 'members', 'banners', 'logs', 'notices', 'banned-words', 'explorer', 'store', 'roulette', 'partner-revenue', 'test'].includes(tab)) {
        return tab as AdminTab
      }
    } catch (error) {
      // URL parsing 실패 시 기본값
    }
    return 'overview'
  })

  const [selectedCategory, setSelectedCategory] = useState<AdminCategory>(() => getCategoryByTab(activeTab))

  const handleTabChange = (tab: AdminTab) => {
    // 같은 탭을 클릭하면 초기화하지 않음
    if (tab === activeTab) return

    setActiveTab(tab)
    setSelectedCategory(getCategoryByTab(tab))

    // 탭 변경 시 페이지/검색/필터 상태 초기화
    // 회원 관련 상태 초기화
    setMemberPage(1)
    setMemberSearch('')
    setMemberSearchInput('')
    setMemberFilter('all')

    // 파트너 관련 상태 초기화
    setPartnerPage(1)
    setPartnerSearch('')
    setPartnerSearchInput('')
    setPartnerStatusFilter('all')

    // 로그 관련 상태 초기화
    setLogsPage(1)
    setLogsSearch('')
    setLogsSearchInput('')
    setLogsTypeFilter('all')

    // 탐색 관련 상태 초기화
    setSelectedExplorerCategory(null)
    setExplorerCategoryPartners([])

    setSelectedRevenuePartnerId(null)
    setPartnerRevenueData(null)
    setRevenuePartnerSearch('')

    // URL 파라미터 초기화 (tab만 유지)
    const url = new URL(window.location.href)
    // 검색/페이지/필터 관련 파라미터 제거
    url.searchParams.delete('page')
    url.searchParams.delete('search')
    url.searchParams.delete('filter')
    url.searchParams.delete('partnerPage')
    url.searchParams.delete('partnerSearch')
    url.searchParams.delete('partnerStatus')
    url.searchParams.delete('logsPage')
    url.searchParams.delete('logsSearch')
    url.searchParams.delete('logsType')
    url.searchParams.set('tab', tab)
    window.history.pushState({}, '', url.toString())
  }
  const [pendingPartners, setPendingPartners] = useState<
    Array<PartnerWithMember>
  >([])
  const [approvedPartners, setApprovedPartners] = useState<
    Array<PartnerWithMember>
  >([])
  const [rejectedPartners, setRejectedPartners] = useState<
    Array<PartnerWithMember>
  >([])
  // 파트너 페이지네이션 및 검색 상태
  const [partnerPage, setPartnerPage] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const page = parseInt(urlParams.get('partnerPage') || '1')
      return page > 0 ? page : 1
    } catch (error) {}
    return 1
  })
  const [partnerTotalCount, setPartnerTotalCount] = useState(0)
  const [partnerStatusCounts, setPartnerStatusCounts] = useState<{
    all: number
    pending: number
    approved: number
    rejected: number
  }>({ all: 0, pending: 0, approved: 0, rejected: 0 })
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [partnerSearch, setPartnerSearch] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('partnerSearch') || ''
    } catch (error) {}
    return ''
  })
  const [partnerSearchInput, setPartnerSearchInput] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('partnerSearch') || ''
    } catch (error) {}
    return ''
  })
  const [partnerStatusFilter, setPartnerStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const status = urlParams.get('partnerStatus')
      if (status && ['all', 'pending', 'approved', 'rejected'].includes(status)) {
        return status as 'all' | 'pending' | 'approved' | 'rejected'
      }
    } catch (error) {}
    return 'all'
  })
  const PARTNERS_PER_PAGE = 12

  const [withdrawalRequests, setWithdrawalRequests] = useState<
    Array<WithdrawalRequest>
  >([])
  const [withdrawalTypeFilter, setWithdrawalTypeFilter] = useState<'all' | WithdrawalType>('all')
  const [withdrawalStats, setWithdrawalStats] = useState<AdminWithdrawalStats | null>(null)

  // 토스 지급대행 관련 상태
  const [payouts, setPayouts] = useState<Array<TossPayoutItem>>([])
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<'all' | 'REQUESTED' | 'COMPLETED' | 'FAILED' | 'CANCELED'>('all')
  const [selectedPayout, setSelectedPayout] = useState<TossPayoutItem | null>(null)
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false)
  const [payoutDateFrom, setPayoutDateFrom] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }) // 시작일 (YYYY-MM-DD)
  const [payoutDateTo, setPayoutDateTo] = useState<string>(() => {
    const today = new Date()
    today.setDate(today.getDate() + 7)
    return today.toISOString().split('T')[0]
  }) // 종료일 (YYYY-MM-DD)

  const [selectedRevenuePartnerId, setSelectedRevenuePartnerId] = useState<string | null>(null)
  const [partnerRevenueData, setPartnerRevenueData] = useState<PartnerRevenueData | null>(null)
  const [partnerRevenueLoading, setPartnerRevenueLoading] = useState(false)
  const [revenuePartnersList, setRevenuePartnersList] = useState<PartnerWithMember[]>([])
  const [revenuePartnerSearch, setRevenuePartnerSearch] = useState('')
  const [revenueQuestSort, setRevenueQuestSort] = useState<'asc' | 'desc'>('desc')
  const [revenueMembershipSort, setRevenueMembershipSort] = useState<'asc' | 'desc'>('desc')
  const [revenuePostUnlocksSort, setRevenuePostUnlocksSort] = useState<'asc' | 'desc'>('desc')
  const [revenueDonationsSort, setRevenueDonationsSort] = useState<'asc' | 'desc'>('desc')

  const [allMembers, setAllMembers] = useState<Array<MemberData>>([])
  const [banners, setBanners] = useState<Array<Banner>>([])
  const [bannersLoading, setBannersLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPartner, setSelectedPartner] =
    useState<PartnerWithMember | null>(null)
  const [isLoadingPartnerDetail, setIsLoadingPartnerDetail] = useState(false)
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false)
  const [partnerDetailTabIndex, setPartnerDetailTabIndex] = useState(0)
  const partnerDetailSwiperRef = useRef<SwiperType | null>(null)
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false)
  const [partnerToReject, setPartnerToReject] =
    useState<PartnerWithMember | null>(null)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null)
  const [memberPointsLogs, setMemberPointsLogs] = useState<Array<MemberPointsLog>>([])
  const [partnerPointsLogsForMember, setPartnerPointsLogsForMember] = useState<Array<PartnerPointsLog>>([])
  const [isLoadingPointsLogs, setIsLoadingPointsLogs] = useState(false)
  const [memberFilter, setMemberFilter] = useState<
    'all' | 'normal' | 'partner' | 'admin'
  >(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const filter = urlParams.get('filter')
      if (filter && ['all', 'normal', 'partner', 'admin'].includes(filter)) {
        return filter as 'all' | 'normal' | 'partner' | 'admin'
      }
    } catch (error) {}
    return 'all'
  })
  // 회원 페이지네이션 및 검색 상태
  const [memberPage, setMemberPage] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const page = parseInt(urlParams.get('page') || '1')
      return page > 0 ? page : 1
    } catch (error) {}
    return 1
  })
  const [memberTotalCount, setMemberTotalCount] = useState(0)
  const [memberRoleCounts, setMemberRoleCounts] = useState<{
    all: number
    normal: number
    partner: number
    admin: number
  }>({ all: 0, normal: 0, partner: 0, admin: 0 })
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('search') || ''
    } catch (error) {}
    return ''
  })
  const [memberSearchInput, setMemberSearchInput] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('search') || ''
    } catch (error) {}
    return ''
  })
  const MEMBERS_PER_PAGE = 12

  // 로그 관련 상태
  const [logsTab, setLogsTab] = useState<'member' | 'partner'>('member')
  const [memberPointsLogsList, setMemberPointsLogsList] = useState<Array<MemberPointsLogWithMember>>([])
  const [partnerPointsLogsList, setPartnerPointsLogsList] = useState<Array<PartnerPointsLogWithPartner>>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const page = parseInt(urlParams.get('logsPage') || '1')
      return page > 0 ? page : 1
    } catch (error) {}
    return 1
  })
  const [logsTotalCount, setLogsTotalCount] = useState(0)
  const [logsTypeFilter, setLogsTypeFilter] = useState<'all' | 'earn' | 'spend'>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const type = urlParams.get('logsType')
      if (type && ['all', 'earn', 'spend'].includes(type)) {
        return type as 'all' | 'earn' | 'spend'
      }
    } catch (error) {}
    return 'all'
  })
  const [logsSearch, setLogsSearch] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('logsSearch') || ''
    } catch (error) {}
    return ''
  })
  const [logsSearchInput, setLogsSearchInput] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('logsSearch') || ''
    } catch (error) {}
    return ''
  })
  const LOGS_PER_PAGE = 20

  // 엑셀 내보내기 관련 상태
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportStartDate, setExportStartDate] = useState<Date | null>(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return date
  })
  const [exportEndDate, setExportEndDate] = useState<Date | null>(new Date())
  const [exportLimit, setExportLimit] = useState<100 | 500 | 1000>(1000)
  const [isExporting, setIsExporting] = useState(false)

  // 공지사항 관련 상태
  const [notices, setNotices] = useState<Array<NoticeItem>>([])
  const [isLoadingNotices, setIsLoadingNotices] = useState(false)
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null)
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false)
  const [selectedNoticeIds, setSelectedNoticeIds] = useState<Set<string>>(new Set())
  const [isNoticeEditMode, setIsNoticeEditMode] = useState(false)
  const noticeEditorRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)

  // 선택 영역 저장
  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
    }
  }

  // 선택 영역 복원
  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedSelectionRef.current)
      }
    }
  }

  // 에디터 명령 실행 (선택 영역 복원 후)
  const execEditorCommand = (command: string, value?: string) => {
    noticeEditorRef.current?.focus()
    restoreSelection()
    document.execCommand(command, false, value)
  }
  const [noticeForm, setNoticeForm] = useState({
    title: '',
    content: '',
    category: 'general' as NoticeItem['category'],
    is_pinned: false,
    image_url: '' as string,
    image_file: null as File | null,
    start_date: '',
    end_date: '',
  })
  const [isSubmittingNotice, setIsSubmittingNotice] = useState(false)

  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | undefined>()
  const [editingTax, setEditingTax] = useState<number | null>(null)

  // 탐색 관리 관련 상태
  const [explorerCategories, setExplorerCategories] = useState<ExplorerCategory[]>([])
  const [selectedExplorerCategory, setSelectedExplorerCategory] = useState<ExplorerCategory | null>(null)
  const [explorerCategoryPartners, setExplorerCategoryPartners] = useState<ExplorerCategoryPartner[]>([])
  const [isExplorerLoading, setIsExplorerLoading] = useState(false)
  const [isExplorerCategoryModalOpen, setIsExplorerCategoryModalOpen] = useState(false)
  const [editingExplorerCategory, setEditingExplorerCategory] = useState<ExplorerCategory | null>(null)
  const [explorerCategoryForm, setExplorerCategoryForm] = useState({ name: '', hashtag: '', is_pinned: false, partner_category_id: 1 as number | null })
  const [isExplorerPartnerModalOpen, setIsExplorerPartnerModalOpen] = useState(false)
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('')
  const [partnerSearchResults, setPartnerSearchResults] = useState<Array<{ id: string; partner_name: string; name?: string; member_code?: string; profile_image?: string | null }>>([])
  const [selectedPartnerForExplorer, setSelectedPartnerForExplorer] = useState<{ id: string; partner_name: string; name?: string; member_code?: string; profile_image?: string | null } | null>(null)
  const [explorerPartnerBannerUrl, setExplorerPartnerBannerUrl] = useState('')

  // 스토어 관리 상태
  const [storeBanners, setStoreBanners] = useState<StoreBanner[]>([])
  const [isStoreBannerLoading, setIsStoreBannerLoading] = useState(false)
  const [isStoreBannerModalOpen, setIsStoreBannerModalOpen] = useState(false)
  const [editingStoreBanner, setEditingStoreBanner] = useState<StoreBanner | null>(null)
  const [storeBannerForm, setStoreBannerForm] = useState({ banner: '' })
  const [storeRecommended, setStoreRecommended] = useState<StoreRecommended[]>([])
  const [isStoreRecommendedLoading, setIsStoreRecommendedLoading] = useState(false)
  const [isStoreRecommendedModalOpen, setIsStoreRecommendedModalOpen] = useState(false)
  const [storePartnerSearchQuery, setStorePartnerSearchQuery] = useState('')
  const [storePartnerSearchResults, setStorePartnerSearchResults] = useState<Array<{ id: string; partner_name: string; name?: string; member_code?: string; profile_image?: string | null }>>([])
  const [selectedStorePartner, setSelectedStorePartner] = useState<{ id: string; partner_name: string; name?: string; member_code?: string; profile_image?: string | null } | null>(null)

  const [isEditingTax, setIsEditingTax] = useState(false)
  const [isEditingDistributionRate, setIsEditingDistributionRate] = useState(false)
  const [editingDefaultRate, setEditingDefaultRate] = useState<number>(85)
  const [editingCollabRate, setEditingCollabRate] = useState<number>(85)
  const [isUpdatingDistributionRate, setIsUpdatingDistributionRate] = useState(false)
  const [hoveredWithdrawalId, setHoveredWithdrawalId] = useState<string | null>(null)
  const { toasts, addToast, removeToast } = useToast()
  const { chatRooms, refreshChatRooms } = useGlobalRealtime()
  const csUnreadCount = chatRooms.filter(r => r.isCsRoom).reduce((sum, r) => sum + (r.unreadCount || 0), 0)
  const csRoomCount = chatRooms.filter(r => r.isCsRoom).length

  // 관리자 권한 체크
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        addToast('로그인이 필요합니다.', 'error')
        navigate({ to: '/login' })
        return
      }

      if (user.role !== 'admin') {
        addToast('관리자 권한이 필요합니다.', 'error')
        navigate({ to: '/' })
        return
      }
    }
  }, [user?.id, user?.role, authLoading, navigate, addToast])

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchData(activeTab)
    }
  }, [user?.id, user?.role, activeTab])

  // 파트너 목록 가져오기 (페이지네이션 및 검색 지원)
  const fetchPartners = useCallback(async (page: number = 1, status?: string, search?: string) => {
    try {
      setPartnersLoading(true)
      const partnersResponse = await mateYouApi.admin.getPartners({
        page,
        limit: PARTNERS_PER_PAGE,
        status: status && status !== 'all' ? status as 'pending' | 'approved' : undefined,
        search: search || undefined,
      }).catch(err => {
        console.error('Failed to fetch partners:', err)
        return { data: { success: false, data: [], total: 0, error: { message: err.message } } }
      })

      if (partnersResponse.data.success) {
        const allPartners = partnersResponse.data.data || []
        const meta = (partnersResponse.data as any).meta
        // 상태별로 분류
        const pending = allPartners.filter((p: any) => p.partner_status === 'pending')
        const approved = allPartners.filter((p: any) => p.partner_status === 'approved')
        const rejected = allPartners.filter((p: any) => p.partner_status === 'rejected')

        setPendingPartners(pending)
        setApprovedPartners(approved)
        setRejectedPartners(rejected)
        const total = meta?.total ?? (partnersResponse.data as any).total ?? allPartners.length
        setPartnerTotalCount(total)
        // statusCounts 저장
        if (meta?.statusCounts) {
          setPartnerStatusCounts(meta.statusCounts)
        }
      } else {
        setPendingPartners([])
        setApprovedPartners([])
        setRejectedPartners([])
        setPartnerTotalCount(0)
      }
    } catch (error) {
      console.error('Fetch partners error:', error)
      setPendingPartners([])
      setApprovedPartners([])
      setRejectedPartners([])
      setPartnerTotalCount(0)
    } finally {
      setPartnersLoading(false)
    }
  }, [])

  // 파트너 필터/페이지/검색 변경 시 데이터 다시 가져오기
  useEffect(() => {
    if (user?.role === 'admin' && activeTab === 'partners') {
      fetchPartners(partnerPage, partnerStatusFilter, partnerSearch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerPage, partnerStatusFilter, partnerSearch, activeTab, user?.id])

  // 파트너 URL 업데이트 함수
  const updatePartnerQueryParams = (params: { page?: number; status?: string; search?: string }) => {
    const url = new URL(window.location.href)
    if (params.page !== undefined) {
      if (params.page === 1) {
        url.searchParams.delete('partnerPage')
      } else {
        url.searchParams.set('partnerPage', params.page.toString())
      }
    }
    if (params.status !== undefined) {
      if (params.status === 'all') {
        url.searchParams.delete('partnerStatus')
      } else {
        url.searchParams.set('partnerStatus', params.status)
      }
    }
    if (params.search !== undefined) {
      if (!params.search) {
        url.searchParams.delete('partnerSearch')
      } else {
        url.searchParams.set('partnerSearch', params.search)
      }
    }
    window.history.replaceState({}, '', url.toString())
  }

  // 파트너 상태 필터 변경 핸들러
  const handlePartnerStatusFilterChange = (status: 'all' | 'pending' | 'approved') => {
    setPartnerStatusFilter(status)
    setPartnerPage(1)
    updatePartnerQueryParams({ status, page: 1 })
  }

  // 파트너 페이지 변경 핸들러
  const handlePartnerPageChange = (page: number) => {
    setPartnerPage(page)
    updatePartnerQueryParams({ page })
  }

  // 파트너 검색 핸들러
  const handlePartnerSearch = () => {
    const searchTerm = partnerSearchInput.trim()
    setPartnerSearch(searchTerm)
    setPartnerPage(1)
    updatePartnerQueryParams({ search: searchTerm, page: 1 })
  }

  // 파트너 검색 초기화 핸들러
  const handlePartnerSearchClear = () => {
    setPartnerSearchInput('')
    setPartnerSearch('')
    setPartnerPage(1)
    updatePartnerQueryParams({ search: '', page: 1 })
  }

  // 파트너 총 페이지 수 계산
  const totalPartnerPages = Math.ceil(partnerTotalCount / PARTNERS_PER_PAGE)

  // 배너 목록 로드
  const loadBanners = async () => {
    setBannersLoading(true)
    try {
      const result = await getAllBanners()
      if (result.success && result.data) {
        setBanners(result.data)
      }
    } catch (error) {
      addToast('배너 목록을 불러오는 중 오류가 발생했습니다.', 'error')
    } finally {
      setBannersLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'banners') {
      loadBanners()
    }
  }, [activeTab])

  // 토스 지급대행 목록 로드
  const loadPayouts = async (dateFrom?: string, dateTo?: string) => {
    setPayoutsLoading(true)
    try {
      const params: {
        limit?: number
        payoutDateGte?: string
        payoutDateLte?: string
      } = {
        limit: 100, // 충분히 많이 가져오기
      }

      // 날짜 필터 적용
      if (dateFrom) {
        params.payoutDateGte = dateFrom
      }
      if (dateTo) {
        params.payoutDateLte = dateTo
      }

      const response = await mateYouApi.toss.getPayouts(params)
      if (response.data.success && response.data.data?.entityBody?.items) {
        setPayouts(response.data.data.entityBody.items)
      } else if (response.data.success && Array.isArray(response.data.data)) {
        // 다른 응답 형식 대응
        setPayouts(response.data.data)
      } else {
        setPayouts([])
      }
    } catch (error) {
      console.error('Failed to fetch payouts:', error)
      addToast('지급대행 내역을 불러오는 중 오류가 발생했습니다.', 'error')
      setPayouts([])
    } finally {
      setPayoutsLoading(false)
    }
  }

  // 날짜 필터로 검색
  const handlePayoutDateSearch = () => {
    loadPayouts(payoutDateFrom || undefined, payoutDateTo || undefined)
  }

  // 날짜 필터 초기화 (오늘 ~ +7일로 리셋)
  const handlePayoutDateReset = () => {
    const today = new Date()
    const fromDate = today.toISOString().split('T')[0]
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const toDate = nextWeek.toISOString().split('T')[0]
    setPayoutDateFrom(fromDate)
    setPayoutDateTo(toDate)
    loadPayouts(fromDate, toDate)
  }

  // 빠른 날짜 필터 함수
  const setPayoutQuickFilter = (type: 'today' | 'week' | 'month' | 'year') => {
    const today = new Date()
    const toDate = today.toISOString().split('T')[0]
    let fromDate: string

    switch (type) {
      case 'today':
        fromDate = toDate
        break
      case 'week': {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        fromDate = weekAgo.toISOString().split('T')[0]
        break
      }
      case 'month': {
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        fromDate = monthAgo.toISOString().split('T')[0]
        break
      }
      case 'year': {
        const yearAgo = new Date(today)
        yearAgo.setFullYear(yearAgo.getFullYear() - 1)
        fromDate = yearAgo.toISOString().split('T')[0]
        break
      }
    }

    setPayoutDateFrom(fromDate)
    setPayoutDateTo(toDate)
    loadPayouts(fromDate, toDate)
  }

  useEffect(() => {
    if (activeTab === 'payouts') {
      const today = new Date()
      const fromDate = today.toISOString().split('T')[0]
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)
      const toDate = nextWeek.toISOString().split('T')[0]
      loadPayouts(fromDate, toDate)
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'partner-revenue') {
      mateYouApi.admin.getPartners({ status: 'approved', limit: 500 }).then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setRevenuePartnersList(res.data.data)
        } else {
          setRevenuePartnersList([])
        }
      }).catch(() => setRevenuePartnersList([]))
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'partner-revenue' || !selectedRevenuePartnerId) {
      setPartnerRevenueData(null)
      return
    }
    setPartnerRevenueLoading(true)
    edgeApi.admin.getPartnerRevenue(selectedRevenuePartnerId)
      .then((res) => {
        if (res.success && res.data) {
          setPartnerRevenueData(res.data as PartnerRevenueData)
        } else {
          setPartnerRevenueData(null)
        }
      })
      .catch(() => setPartnerRevenueData(null))
      .finally(() => setPartnerRevenueLoading(false))
  }, [activeTab, selectedRevenuePartnerId])

  // 토스 지급대행 취소
  const [isCancelingPayout, setIsCancelingPayout] = useState(false)

  const handleCancelPayout = async (payoutId: string) => {
    if (!confirm('정말로 이 지급대행 요청을 취소하시겠습니까?')) {
      return
    }

    setIsCancelingPayout(true)
    try {
      const response = await mateYouApi.toss.cancelPayout(payoutId)
      if (response.data.success) {
        addToast('지급대행 요청이 취소되었습니다.', 'success')
        setIsPayoutModalOpen(false)
        setSelectedPayout(null)
        // 목록 새로고침
        loadPayouts()
      } else {
        addToast((response.data as any).message || '취소에 실패했습니다.', 'error')
      }
    } catch (error: any) {
      console.error('Failed to cancel payout:', error)
      const errorMessage = error.response?.data?.message || '취소 중 오류가 발생했습니다.'
      addToast(errorMessage, 'error')
    } finally {
      setIsCancelingPayout(false)
    }
  }

  // 회원 목록 가져오기 (페이지네이션 및 검색 지원)
  const fetchMembers = useCallback(async (page: number = 1, role?: string, search?: string) => {
    try {
      setMembersLoading(true)
      const membersResponse = await mateYouApi.admin.getMembers({
        page,
        limit: MEMBERS_PER_PAGE,
        role: role && role !== 'all' ? role : undefined,
        search: search || undefined,
      }).catch(err => {
        console.error('Failed to fetch members:', err)
        return { data: { success: false, data: [], meta: { total: 0 }, error: { message: err.message } } }
      })

      if (membersResponse.data.success) {
        setAllMembers(membersResponse.data.data || [])
        // 백엔드 응답 형식에 따라 meta.total 또는 직접 total 필드 사용
        const meta = (membersResponse.data as any).meta
        const total = meta?.total ?? (membersResponse.data as any).total ?? 0
        setMemberTotalCount(total)
        // role별 count 저장
        if (meta?.roleCounts) {
          setMemberRoleCounts(meta.roleCounts)
        }
      } else {
        setAllMembers([])
        setMemberTotalCount(0)
      }
    } catch (error) {
      console.error('Fetch members error:', error)
      setAllMembers([])
      setMemberTotalCount(0)
    } finally {
      setMembersLoading(false)
    }
  }, [])

  // 회원 필터/페이지/검색 변경 시 데이터 다시 가져오기
  useEffect(() => {
    if (user?.role === 'admin' && activeTab === 'members') {
      fetchMembers(memberPage, memberFilter, memberSearch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberPage, memberFilter, memberSearch, activeTab, user?.id])

  // URL 업데이트 함수
  const updateMemberQueryParams = (params: { page?: number; filter?: string; search?: string }) => {
    const url = new URL(window.location.href)
    if (params.page !== undefined) {
      if (params.page === 1) {
        url.searchParams.delete('page')
      } else {
        url.searchParams.set('page', params.page.toString())
      }
    }
    if (params.filter !== undefined) {
      if (params.filter === 'all') {
        url.searchParams.delete('filter')
      } else {
        url.searchParams.set('filter', params.filter)
      }
    }
    if (params.search !== undefined) {
      if (!params.search) {
        url.searchParams.delete('search')
      } else {
        url.searchParams.set('search', params.search)
      }
    }
    window.history.replaceState({}, '', url.toString())
  }

  // 필터 변경 시 페이지를 1로 리셋
  const handleMemberFilterChange = (filter: 'all' | 'normal' | 'partner' | 'admin') => {
    setMemberFilter(filter)
    setMemberPage(1)
    updateMemberQueryParams({ filter, page: 1 })
  }

  // 페이지 변경 핸들러
  const handleMemberPageChange = (page: number) => {
    setMemberPage(page)
    updateMemberQueryParams({ page })
  }

  // 검색 핸들러
  const handleMemberSearch = () => {
    const searchTerm = memberSearchInput.trim()
    setMemberSearch(searchTerm)
    setMemberPage(1)
    updateMemberQueryParams({ search: searchTerm, page: 1 })
  }

  // 검색 초기화 핸들러
  const handleMemberSearchClear = () => {
    setMemberSearchInput('')
    setMemberSearch('')
    setMemberPage(1)
    updateMemberQueryParams({ search: '', page: 1 })
  }

  // 총 페이지 수 계산
  const totalMemberPages = Math.ceil(memberTotalCount / MEMBERS_PER_PAGE)

  // 로그 fetch 함수
  const fetchLogs = useCallback(async (
    tab: 'member' | 'partner',
    page: number = 1,
    type?: string,
    search?: string
  ) => {
    try {
      setLogsLoading(true)
      const params = {
        page,
        limit: LOGS_PER_PAGE,
        type: type && type !== 'all' ? type as 'earn' | 'spend' : undefined,
        search: search || undefined,
      }

      if (tab === 'member') {
        const response = await mateYouApi.admin.getMemberPointsLogs(params).catch(err => {
          console.error('Failed to fetch member points logs:', err)
          return { data: { success: false, data: [], meta: { total: 0 } } }
        })
        if (response.data.success) {
          setMemberPointsLogsList(response.data.data || [])
          const meta = (response.data as any).meta
          setLogsTotalCount(meta?.total ?? (response.data as any).total ?? 0)
        } else {
          setMemberPointsLogsList([])
          setLogsTotalCount(0)
        }
      } else {
        const response = await mateYouApi.admin.getPartnerPointsLogs(params).catch(err => {
          console.error('Failed to fetch partner points logs:', err)
          return { data: { success: false, data: [], meta: { total: 0 } } }
        })
        if (response.data.success) {
          setPartnerPointsLogsList(response.data.data || [])
          const meta = (response.data as any).meta
          setLogsTotalCount(meta?.total ?? (response.data as any).total ?? 0)
        } else {
          setPartnerPointsLogsList([])
          setLogsTotalCount(0)
        }
      }
    } catch (error) {
      console.error('Fetch logs error:', error)
      if (tab === 'member') {
        setMemberPointsLogsList([])
      } else {
        setPartnerPointsLogsList([])
      }
      setLogsTotalCount(0)
    } finally {
      setLogsLoading(false)
    }
  }, [])

  // 로그 탭 변경 시 데이터 가져오기
  useEffect(() => {
    if (user?.role === 'admin' && activeTab === 'logs') {
      fetchLogs(logsTab, logsPage, logsTypeFilter, logsSearch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsTab, logsPage, logsTypeFilter, logsSearch, activeTab, user?.id])

  // 로그 URL 업데이트 함수
  const updateLogsQueryParams = (params: { page?: number; type?: string; search?: string; tab?: string }) => {
    const url = new URL(window.location.href)
    if (params.page !== undefined) {
      if (params.page === 1) {
        url.searchParams.delete('logsPage')
      } else {
        url.searchParams.set('logsPage', params.page.toString())
      }
    }
    if (params.type !== undefined) {
      if (params.type === 'all') {
        url.searchParams.delete('logsType')
      } else {
        url.searchParams.set('logsType', params.type)
      }
    }
    if (params.search !== undefined) {
      if (!params.search) {
        url.searchParams.delete('logsSearch')
      } else {
        url.searchParams.set('logsSearch', params.search)
      }
    }
    if (params.tab !== undefined) {
      url.searchParams.set('logsTab', params.tab)
    }
    window.history.replaceState({}, '', url.toString())
  }

  // 로그 타입 필터 변경 핸들러
  const handleLogsTypeFilterChange = (type: 'all' | 'earn' | 'spend') => {
    setLogsTypeFilter(type)
    setLogsPage(1)
    updateLogsQueryParams({ type, page: 1 })
  }

  // 로그 페이지 변경 핸들러
  const handleLogsPageChange = (page: number) => {
    setLogsPage(page)
    updateLogsQueryParams({ page })
  }

  // 로그 검색 핸들러
  const handleLogsSearch = () => {
    const searchTerm = logsSearchInput.trim()
    setLogsSearch(searchTerm)
    setLogsPage(1)
    updateLogsQueryParams({ search: searchTerm, page: 1 })
  }

  // 로그 검색 초기화 핸들러
  const handleLogsSearchClear = () => {
    setLogsSearchInput('')
    setLogsSearch('')
    setLogsPage(1)
    updateLogsQueryParams({ search: '', page: 1 })
  }

  // 엑셀 내보내기 핸들러
  const handleExportExcel = async () => {
    if (!exportStartDate || !exportEndDate) {
      toast.error('날짜 범위를 선택해주세요.')
      return
    }

    setIsExporting(true)
    try {
      const startDate = exportStartDate.toISOString().split('T')[0]
      const endDate = exportEndDate.toISOString().split('T')[0]

      const params = {
        page: 1,
        limit: exportLimit,
        type: logsTypeFilter !== 'all' ? logsTypeFilter as 'earn' | 'spend' : undefined,
        search: logsSearch || undefined,
        start_date: startDate,
        end_date: endDate,
      }

      if (logsTab === 'member') {
        const response = await mateYouApi.admin.getMemberPointsLogs(params)
        if (response.data.success && response.data.data) {
          exportPointsLogsToExcel({
            logs: response.data.data,
            logType: 'member',
            dateRange: { startDate, endDate },
            filters: { type: logsTypeFilter, search: logsSearch },
          })
          toast.success(`회원 포인트 로그 ${response.data.data.length}건을 내보냈습니다.`)
        } else {
          toast.error('데이터를 가져오는데 실패했습니다.')
        }
      } else {
        const response = await mateYouApi.admin.getPartnerPointsLogs(params)
        if (response.data.success && response.data.data) {
          exportPointsLogsToExcel({
            logs: response.data.data,
            logType: 'partner',
            dateRange: { startDate, endDate },
            filters: { type: logsTypeFilter, search: logsSearch },
          })
          toast.success(`파트너 포인트 로그 ${response.data.data.length}건을 내보냈습니다.`)
        } else {
          toast.error('데이터를 가져오는데 실패했습니다.')
        }
      }

      setIsExportModalOpen(false)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('엑셀 내보내기에 실패했습니다.')
    } finally {
      setIsExporting(false)
    }
  }

  // 로그 탭 변경 핸들러
  const handleLogsTabChange = (tab: 'member' | 'partner') => {
    setLogsTab(tab)
    setLogsPage(1)
    setLogsSearch('')
    setLogsSearchInput('')
    setLogsTypeFilter('all')
    updateLogsQueryParams({ tab, page: 1, search: '', type: 'all' })
  }

  // 로그 총 페이지 수 계산
  const totalLogsPages = Math.ceil(logsTotalCount / LOGS_PER_PAGE)

  // 공지사항 목록 가져오기
  const fetchNotices = useCallback(async () => {
    console.log('[Admin] Fetching notices...')
    setIsLoadingNotices(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        console.error('[Admin] No session for fetching notices')
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice?page=1`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      const result = await response.json()
      console.log('[Admin] Notices response:', result)
      if (result.success && Array.isArray(result.data)) {
        setNotices(result.data)
      } else {
        console.error('[Admin] Failed to fetch notices:', result)
      }
    } catch (error) {
      console.error('[Admin] Failed to fetch notices:', error)
      addToast('공지사항을 불러오는데 실패했습니다.', 'error')
    } finally {
      setIsLoadingNotices(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 공지사항 탭 활성화시 데이터 로드
  useEffect(() => {
    console.log('[Admin] activeTab changed:', activeTab)
    if (activeTab === 'notices') {
      fetchNotices()
    }
  }, [activeTab, fetchNotices])

  // 스토어 배너 목록 가져오기
  const fetchStoreBanners = useCallback(async () => {
    setIsStoreBannerLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-banners`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setStoreBanners(result.data)
      }
    } catch (error) {
      console.error('스토어 배너 조회 실패:', error)
      addToast('스토어 배너를 불러오는데 실패했습니다.', 'error')
    } finally {
      setIsStoreBannerLoading(false)
    }
  }, [addToast])

  // 추천 파트너 목록 가져오기
  const fetchStoreRecommended = useCallback(async () => {
    setIsStoreRecommendedLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-recommended`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setStoreRecommended(result.data)
      }
    } catch (error) {
      console.error('추천 파트너 조회 실패:', error)
      addToast('추천 파트너를 불러오는데 실패했습니다.', 'error')
    } finally {
      setIsStoreRecommendedLoading(false)
    }
  }, [addToast])

  // 스토어 배너 드래그 앤 드롭 정렬
  const handleStoreBannerDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = storeBanners.findIndex(b => b.id === active.id)
    const newIndex = storeBanners.findIndex(b => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(storeBanners, oldIndex, newIndex)
    const updates = reordered.map((item, index) => ({ id: item.id, sort_order: index }))

    setStoreBanners(reordered.map((b, i) => ({ ...b, sort_order: i })))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-banners/reorder`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ items: updates }),
        }
      )
    } catch (error) {
      console.error('배너 순서 변경 실패:', error)
      fetchStoreBanners()
    }
  }

  // 추천 파트너 드래그 앤 드롭 정렬
  const handleStoreRecommendedDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = storeRecommended.findIndex(r => r.id === active.id)
    const newIndex = storeRecommended.findIndex(r => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(storeRecommended, oldIndex, newIndex)
    const updates = reordered.map((item, index) => ({ id: item.id, sort_order: index }))

    setStoreRecommended(reordered.map((r, i) => ({ ...r, sort_order: i })))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-recommended/reorder`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ items: updates }),
        }
      )
    } catch (error) {
      console.error('추천 파트너 순서 변경 실패:', error)
      fetchStoreRecommended()
    }
  }

  // 스토어 배너 저장
  const handleSaveStoreBanner = async () => {
    if (!storeBannerForm.banner) {
      addToast('배너 이미지를 선택해주세요.', 'error')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const url = editingStoreBanner
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-banners/${editingStoreBanner.id}`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-banners`

      const response = await fetch(url, {
        method: editingStoreBanner ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ banner: storeBannerForm.banner }),
      })

      const result = await response.json()
      if (result.success) {
        addToast(editingStoreBanner ? '배너가 수정되었습니다.' : '배너가 추가되었습니다.', 'success')
        setIsStoreBannerModalOpen(false)
        setEditingStoreBanner(null)
        setStoreBannerForm({ banner: '' })
        fetchStoreBanners()
      } else {
        addToast(result.error?.message || '저장에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('배너 저장 실패:', error)
      addToast('배너 저장에 실패했습니다.', 'error')
    }
  }

  // 스토어 배너 삭제
  const handleDeleteStoreBanner = async (bannerId: string) => {
    if (!confirm('이 배너를 삭제하시겠습니까?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-banners/${bannerId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('배너가 삭제되었습니다.', 'success')
        fetchStoreBanners()
      } else {
        addToast(result.error?.message || '삭제에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('배너 삭제 실패:', error)
      addToast('배너 삭제에 실패했습니다.', 'error')
    }
  }

  // 스토어 파트너 검색
  const handleSearchStorePartners = async (query?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const searchQuery = query ?? storePartnerSearchQuery
      const url = searchQuery.trim()
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-partner-search?q=${encodeURIComponent(searchQuery)}&limit=50`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-partner-search?limit=50`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setStorePartnerSearchResults(result.data)
      }
    } catch (error) {
      console.error('파트너 검색 실패:', error)
    }
  }

  // 추천 파트너 추가
  const handleAddStoreRecommended = async () => {
    if (!selectedStorePartner) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-recommended`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ partner_id: selectedStorePartner.id }),
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('추천 파트너가 추가되었습니다.', 'success')
        setIsStoreRecommendedModalOpen(false)
        setSelectedStorePartner(null)
        setStorePartnerSearchQuery('')
        setStorePartnerSearchResults([])
        fetchStoreRecommended()
      } else {
        addToast(result.error?.message || '추가에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('추천 파트너 추가 실패:', error)
      addToast('추천 파트너 추가에 실패했습니다.', 'error')
    }
  }

  // 추천 파트너 삭제
  const handleDeleteStoreRecommended = async (id: string) => {
    if (!confirm('이 파트너를 추천 목록에서 제거하시겠습니까?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-store-recommended/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('추천 파트너가 제거되었습니다.', 'success')
        fetchStoreRecommended()
      } else {
        addToast(result.error?.message || '삭제에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('추천 파트너 삭제 실패:', error)
      addToast('추천 파트너 삭제에 실패했습니다.', 'error')
    }
  }

  // 탐색 카테고리 목록 가져오기
  const fetchExplorerCategories = useCallback(async () => {
    setIsExplorerLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-categories`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setExplorerCategories(result.data)
      }
    } catch (error) {
      console.error('탐색 카테고리 조회 실패:', error)
      addToast('탐색 카테고리를 불러오는데 실패했습니다.', 'error')
    } finally {
      setIsExplorerLoading(false)
    }
  }, [addToast])

  // 카테고리별 파트너 목록 가져오기
  const fetchExplorerCategoryPartners = useCallback(async (categoryId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-category-partners?category_id=${categoryId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setExplorerCategoryPartners(result.data)
      }
    } catch (error) {
      console.error('파트너 목록 조회 실패:', error)
    }
  }, [])

  // 탐색 탭 활성화시 데이터 로드
  useEffect(() => {
    if (activeTab === 'explorer') {
      fetchExplorerCategories()
    }
  }, [activeTab, fetchExplorerCategories])

  // 스토어 탭 활성화시 데이터 로드
  useEffect(() => {
    if (activeTab === 'store') {
      fetchStoreBanners()
      fetchStoreRecommended()
    }
  }, [activeTab, fetchStoreBanners, fetchStoreRecommended])

  // 카테고리 선택시 파트너 목록 로드
  useEffect(() => {
    if (selectedExplorerCategory) {
      fetchExplorerCategoryPartners(selectedExplorerCategory.id)
    }
  }, [selectedExplorerCategory, fetchExplorerCategoryPartners])

  // 카테고리 생성/수정
  const handleSaveExplorerCategory = async () => {
    if (!explorerCategoryForm.name.trim()) {
      addToast('카테고리 이름을 입력해주세요.', 'error')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const isEdit = !!editingExplorerCategory
      const url = isEdit
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-categories/${editingExplorerCategory.id}`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-categories`

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: explorerCategoryForm.name,
          hashtag: explorerCategoryForm.hashtag || null,
          is_pinned: explorerCategoryForm.is_pinned,
          partner_category_id: explorerCategoryForm.partner_category_id,
        }),
      })

      const result = await response.json()
      if (result.success) {
        addToast(isEdit ? '카테고리가 수정되었습니다.' : '카테고리가 생성되었습니다.', 'success')
        setIsExplorerCategoryModalOpen(false)
        setEditingExplorerCategory(null)
        setExplorerCategoryForm({ name: '', hashtag: '', is_pinned: false, partner_category_id: 1 })
        fetchExplorerCategories()
      } else {
        addToast(result.error?.message || '저장에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('카테고리 저장 실패:', error)
      addToast('카테고리 저장에 실패했습니다.', 'error')
    }
  }

  // 카테고리 삭제
  const handleDeleteExplorerCategory = async (categoryId: string) => {
    if (!confirm('이 카테고리를 삭제하시겠습니까? 할당된 파트너도 함께 삭제됩니다.')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-categories/${categoryId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('카테고리가 삭제되었습니다.', 'success')
        if (selectedExplorerCategory?.id === categoryId) {
          setSelectedExplorerCategory(null)
          setExplorerCategoryPartners([])
        }
        fetchExplorerCategories()
      } else {
        addToast(result.error?.message || '삭제에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('카테고리 삭제 실패:', error)
      addToast('카테고리 삭제에 실패했습니다.', 'error')
    }
  }

  // 카테고리 드래그 앤 드롭 정렬
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleExplorerCategoryDragEnd = async (event: DragEndEvent, isPinned: boolean) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const items = isPinned
      ? explorerCategories.filter(c => c.is_pinned)
      : explorerCategories.filter(c => !c.is_pinned)

    const oldIndex = items.findIndex(c => c.id === active.id)
    const newIndex = items.findIndex(c => c.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(items, oldIndex, newIndex)
    const updates = reordered.map((item, index) => ({ id: item.id, sort_order: index }))

    // 낙관적 업데이트
    const allCategories = isPinned
      ? [...reordered, ...explorerCategories.filter(c => !c.is_pinned)]
      : [...explorerCategories.filter(c => c.is_pinned), ...reordered]
    setExplorerCategories(allCategories.map((c, i) => ({ ...c, sort_order: isPinned ? (c.is_pinned ? updates.find(u => u.id === c.id)?.sort_order ?? i : c.sort_order) : (!c.is_pinned ? updates.find(u => u.id === c.id)?.sort_order ?? i : c.sort_order) })))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-categories/reorder`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ items: updates }),
        }
      )
    } catch (error) {
      console.error('순서 변경 실패:', error)
      fetchExplorerCategories() // 실패시 원복
    }
  }

  // 파트너 검색 (검색어 없으면 전체 조회)
  const handleSearchPartnersForExplorer = async (query?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const searchQuery = query ?? partnerSearchQuery
      const url = searchQuery.trim()
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-partner-search?q=${encodeURIComponent(searchQuery)}&limit=50`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-partner-search?limit=50`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setPartnerSearchResults(result.data)
      }
    } catch (error) {
      console.error('파트너 검색 실패:', error)
    }
  }

  // 파트너 할당
  const handleAddPartnerToCategory = async () => {
    if (!selectedExplorerCategory || !selectedPartnerForExplorer) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-category-partners`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            explore_category_id: selectedExplorerCategory.id,
            partner_id: selectedPartnerForExplorer.id,
            banners: explorerPartnerBannerUrl || null,
          }),
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('파트너가 할당되었습니다.', 'success')
        setIsExplorerPartnerModalOpen(false)
        setSelectedPartnerForExplorer(null)
        setPartnerSearchQuery('')
        setPartnerSearchResults([])
        setExplorerPartnerBannerUrl('')
        fetchExplorerCategoryPartners(selectedExplorerCategory.id)
      } else {
        addToast(result.error?.message || '파트너 할당에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('파트너 할당 실패:', error)
      addToast('파트너 할당에 실패했습니다.', 'error')
    }
  }

  // 파트너 할당 해제
  const handleRemovePartnerFromCategory = async (recordId: string) => {
    if (!confirm('이 파트너를 카테고리에서 제거하시겠습니까?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-category-partners/${recordId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('파트너가 제거되었습니다.', 'success')
        if (selectedExplorerCategory) {
          fetchExplorerCategoryPartners(selectedExplorerCategory.id)
        }
      } else {
        addToast(result.error?.message || '파트너 제거에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('파트너 제거 실패:', error)
      addToast('파트너 제거에 실패했습니다.', 'error')
    }
  }

  // 파트너 배너 업데이트
  const handleUpdatePartnerBanner = async (recordId: string, bannerUrl: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-explore-category-partners/${recordId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ banners: bannerUrl }),
        }
      )

      const result = await response.json()
      if (result.success) {
        addToast('배너가 업데이트되었습니다.', 'success')
        if (selectedExplorerCategory) {
          fetchExplorerCategoryPartners(selectedExplorerCategory.id)
        }
      }
    } catch (error) {
      console.error('배너 업데이트 실패:', error)
    }
  }

  // 공지사항 저장
  const handleSaveNotice = async () => {
    // 에디터에서 최신 내용 가져오기
    const editorContent = noticeEditorRef.current?.innerHTML || ''

    if (!noticeForm.title.trim() || !editorContent.trim()) {
      toast.error('제목과 내용을 입력해주세요.')
      return
    }

    setIsSubmittingNotice(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('로그인이 필요합니다.')
        return
      }

      const method = selectedNotice ? 'PUT' : 'POST'
      const url = selectedNotice
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice/${selectedNotice.id}`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice`

      // FormData 생성
      const formData = new FormData()
      formData.append('title', noticeForm.title)
      formData.append('content', editorContent)
      formData.append('category', noticeForm.category)
      formData.append('is_pinned', String(noticeForm.is_pinned))
      if (noticeForm.start_date) {
        formData.append('start_date', noticeForm.start_date)
      }
      if (noticeForm.end_date) {
        formData.append('end_date', noticeForm.end_date)
      }
      if (noticeForm.image_file) {
        formData.append('image', noticeForm.image_file)
      } else if (noticeForm.image_url) {
        // 기존 이미지 URL
        formData.append('image_url', noticeForm.image_url)
      }

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        toast.success(selectedNotice ? '공지사항이 수정되었습니다.' : '공지사항이 작성되었습니다.')
        setIsNoticeModalOpen(false)
        setSelectedNotice(null)
        setNoticeForm({ title: '', content: '', category: 'general', is_pinned: false, image_url: '', image_file: null, start_date: '', end_date: '' })
        fetchNotices()
      } else {
        toast.error(result.error?.message || '공지사항 저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to save notice:', error)
      toast.error('공지사항 저장에 실패했습니다.')
    } finally {
      setIsSubmittingNotice(false)
    }
  }

  // 공지사항 삭제
  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('로그인이 필요합니다.')
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice/${noticeId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json()

      if (result.success) {
        toast.success('공지사항이 삭제되었습니다.')
        setNotices(prev => prev.filter(n => n.id !== noticeId))
      } else {
        toast.error(result.error?.message || '공지사항 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to delete notice:', error)
      toast.error('공지사항 삭제에 실패했습니다.')
    }
  }

  // 공지사항 모달 열기 (보기/수정 통합)
  const openNoticeModal = async (notice?: NoticeItem, editMode: boolean = true) => {
    if (notice) {
      // 상세 정보 API 호출
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice/${notice.id}`,
          { method: 'GET', headers }
        )
        const result = await response.json()

        if (result.success && result.data) {
          const detailNotice = result.data
          setSelectedNotice(detailNotice)
          setNoticeForm({
            title: detailNotice.title,
            content: detailNotice.content,
            category: detailNotice.category,
            is_pinned: detailNotice.is_pinned,
            image_url: detailNotice.image_url || '',
            image_file: null,
            start_date: detailNotice.start_date || '',
            end_date: detailNotice.end_date || '',
          })
          setIsNoticeEditMode(editMode)
          // 에디터에 초기값 설정 (약간의 딜레이 필요)
          setTimeout(() => {
            if (noticeEditorRef.current) {
              noticeEditorRef.current.innerHTML = detailNotice.content || ''
            }
          }, 100)
          setIsNoticeModalOpen(true)
        } else {
          toast.error('공지사항을 불러오는데 실패했습니다.')
        }
      } catch (error) {
        console.error('Failed to fetch notice detail:', error)
        toast.error('공지사항을 불러오는데 실패했습니다.')
      }
    } else {
      setSelectedNotice(null)
      setNoticeForm({ title: '', content: '', category: 'general', is_pinned: false, image_url: '', image_file: null, start_date: '', end_date: '' })
      setIsNoticeEditMode(true) // 새 공지 작성은 항상 편집 모드
      // 에디터 초기화
      setTimeout(() => {
        if (noticeEditorRef.current) {
          noticeEditorRef.current.innerHTML = ''
        }
      }, 100)
      setIsNoticeModalOpen(true)
    }
  }

  // 공지사항 고정 토글
  const handleToggleNoticePin = async (noticeId: string, isPinned: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('로그인이 필요합니다.')
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice/${noticeId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ is_pinned: isPinned }),
        }
      )

      const result = await response.json()

      if (result.success) {
        toast.success(isPinned ? '공지사항이 고정되었습니다.' : '공지사항 고정이 해제되었습니다.')
        setNotices(prev => prev.map(n => n.id === noticeId ? { ...n, is_pinned: isPinned } : n))
      } else {
        toast.error(result.error?.message || '고정 상태 변경에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to toggle notice pin:', error)
      toast.error('고정 상태 변경에 실패했습니다.')
    }
  }

  // 공지사항 체크박스 토글
  const handleToggleNoticeSelection = (noticeId: string) => {
    setSelectedNoticeIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(noticeId)) {
        newSet.delete(noticeId)
      } else {
        newSet.add(noticeId)
      }
      return newSet
    })
  }

  // 공지사항 전체 선택/해제
  const handleToggleAllNotices = () => {
    if (selectedNoticeIds.size === notices.length) {
      setSelectedNoticeIds(new Set())
    } else {
      setSelectedNoticeIds(new Set(notices.map(n => n.id)))
    }
  }

  // 선택된 공지사항 일괄 삭제
  const handleDeleteSelectedNotices = async () => {
    if (selectedNoticeIds.size === 0) {
      toast.error('삭제할 공지사항을 선택해주세요.')
      return
    }

    if (!confirm(`선택한 ${selectedNoticeIds.size}개의 공지사항을 삭제하시겠습니까?`)) {
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('로그인이 필요합니다.')
        return
      }

      let successCount = 0
      let failCount = 0

      for (const noticeId of selectedNoticeIds) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-notice/${noticeId}`,
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          )
          const result = await response.json()
          if (result.success) {
            successCount++
          } else {
            failCount++
          }
        } catch {
          failCount++
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount}개의 공지사항이 삭제되었습니다.`)
        setSelectedNoticeIds(new Set())
        fetchNotices()
      }
      if (failCount > 0) {
        toast.error(`${failCount}개의 공지사항 삭제에 실패했습니다.`)
      }
    } catch (error) {
      console.error('Failed to delete notices:', error)
      toast.error('공지사항 삭제에 실패했습니다.')
    }
  }

  const fetchData = useCallback(async (currentTab?: string) => {
    try {
      setIsLoading(true)

      // Admin API를 통해 데이터 조회
      // 파트너 탭일 때는 파트너 데이터를 여기서 로드하지 않음 (fetchPartners에서 페이지네이션으로 로드)
      const shouldFetchPartners = currentTab !== 'partners'

      const [partnersResponse, withdrawalsResponse, statsResponse] = await Promise.all([
        shouldFetchPartners
          ? mateYouApi.admin.getPartnersPending().catch(err => {
              console.error('Failed to fetch pending partners:', err)
              if (err.message?.includes('Authentication required')) {
                addToast('인증이 필요합니다. 다시 로그인해주세요.', 'error')
              }
              return { data: { success: false, data: [], error: { message: err.message } } }
            })
          : Promise.resolve({ data: { success: true, data: [] } }), // 파트너 탭이면 스킵
        mateYouApi.admin.getWithdrawals({ status: 'pending' }).catch(err => {
          console.error('Failed to fetch withdrawals:', err)
          return { data: { success: false, data: [], error: { message: err.message } } }
        }),
        mateYouApi.admin.getStats().catch(err => {
          console.error('Failed to fetch stats:', err)
          return { data: { success: false, data: null, error: { message: err.message } } }
        }),
      ])

      // 파트너 탭이 아닐 때만 파트너 데이터 설정 (Overview용 - pending만 가져옴)
      if (shouldFetchPartners) {
        if (partnersResponse.data.success) {
          const pendingPartnersData = partnersResponse.data.data || []
          setPendingPartners(pendingPartnersData)
        } else {
          setPendingPartners([])
        }
      }

      if (withdrawalsResponse.data.success) {
        setWithdrawalRequests(withdrawalsResponse.data.data || [])
      } else {
        setWithdrawalRequests([])
      }

      if (statsResponse.data.success && statsResponse.data.data?.withdrawals?.byType) {
        setWithdrawalStats({ byType: statsResponse.data.data.withdrawals.byType })
      }
    } catch (error) {
      console.error('Fetch data error:', error)
      addToast('데이터 조회 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  // partnerId는 이제 members.id를 받습니다
  const handlePartnerApproval = async (memberId: string, approve: boolean) => {
    try {
      // updatePartnerStatus는 이제 members.id를 받습니다
      const response = await mateYouApi.admin.updatePartnerStatus(
        memberId,
        approve ? 'approved' : 'rejected',
      )

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to update partner status')
      }

      addToast(
        `파트너 신청이 ${approve ? '승인' : '거절'}되었습니다.`,
        'success',
      )
      setIsPartnerModalOpen(false)
      setSelectedPartner(null)
      await fetchData()
    } catch (error) {
      addToast('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const handlePartnerDetail = async (partner: PartnerWithMember) => {
    setIsPartnerModalOpen(true)
    setIsLoadingPartnerDetail(true)
    setSelectedPartner(partner) // 일단 기존 데이터로 표시

    try {
      // 새로운 데이터 fetch (partner_business_info 포함)
      const response = await mateYouApi.admin.getPartnerDetail(partner.member_id)
      if (response.data.success && response.data.data?.partner) {
        setSelectedPartner(response.data.data.partner)
      }
    } catch (error) {
      console.error('Failed to fetch partner detail:', error)
      // 에러 시 기존 데이터 유지
    } finally {
      setIsLoadingPartnerDetail(false)
    }
  }

  const handleMemberDetail = async (member: MemberData) => {
    console.log('[Admin] handleMemberDetail called:', member.id, member.nickname)
    setSelectedMember(member)
    // 이전 데이터 초기화
    setMemberPointsLogs([])
    setPartnerPointsLogsForMember([])
    setIsMemberModalOpen(true)
    // 포인트 로그 가져오기
    console.log('[Admin] Loading points logs...')
    await loadMemberPointsLogs(member.id)
    console.log('[Admin] Points logs loaded')
  }

  const loadMemberPointsLogs = async (memberId: string) => {
    setIsLoadingPointsLogs(true)
    // 로딩 시작 시 초기화
    setMemberPointsLogs([])
    setPartnerPointsLogsForMember([])
    try {
      // 멤버 포인트 로그 조회 (API 사용)
      const memberLogsResponse = await mateYouApi.admin.getMemberPointsLogs({
        member_id: memberId,
        limit: 50,
      })
      if (memberLogsResponse.data.success) {
        // API 응답을 기존 형식에 맞게 변환
        const logs = (memberLogsResponse.data.data || []).map((log: any) => ({
          id: log.id,
          member_id: memberId,
          type: log.type,
          amount: log.amount,
          description: log.description,
          created_at: log.created_at,
          log_id: log.log_id,
        }))
        setMemberPointsLogs(logs)
      } else {
        setMemberPointsLogs([])
      }

      // 파트너 ID 조회 (API 사용 - RLS 우회)
      const partnerResponse = await mateYouApi.admin.getPartners({ member_id: memberId })
      const partnerData = partnerResponse.data.success && partnerResponse.data.data?.length > 0
        ? partnerResponse.data.data[0]
        : null

      console.log('[Admin] Partner data for member:', memberId, partnerData)

      // 파트너인 경우 파트너 포인트 로그도 조회 (API 사용)
      if (partnerData?.id) {
        console.log('[Admin] Fetching partner points logs for partner_id:', partnerData.id)
        const partnerLogsResponse = await mateYouApi.admin.getPartnerPointsLogs({
          partner_id: partnerData.id,
          limit: 50,
        })
        console.log('[Admin] Partner logs response:', partnerLogsResponse.data)
        if (partnerLogsResponse.data.success) {
          const logs = (partnerLogsResponse.data.data || []).map((log: any) => ({
            id: log.id,
            partner_id: partnerData.id,
            type: log.type,
            amount: log.amount,
            description: log.description,
            created_at: log.created_at,
            log_id: log.log_id,
          }))
          console.log('[Admin] Setting partner points logs:', logs.length, 'logs')
          setPartnerPointsLogsForMember(logs)
        } else {
          console.log('[Admin] Partner logs response not success')
          setPartnerPointsLogsForMember([])
        }
      } else {
        console.log('[Admin] Not a partner, skipping partner logs')
        setPartnerPointsLogsForMember([])
      }
    } catch (error) {
      console.error('Failed to load points logs:', error)
      setMemberPointsLogs([])
      setPartnerPointsLogsForMember([])
    } finally {
      setIsLoadingPointsLogs(false)
    }
  }

  const handleResetToNormalMember = async (memberId: string) => {
    if (!confirm('이 회원을 일반 회원으로 전환하시겠습니까?')) {
      return
    }

    try {
      const response = await mateYouApi.admin.deletePartnerByMember(memberId)

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to reset member')
      }

      addToast('일반 회원으로 전환되었습니다.', 'success')
      setIsMemberModalOpen(false)
      setSelectedMember(null)
      await fetchData()
    } catch (error) {
      addToast('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const handlePartnerRejectionConfirm = (partner: PartnerWithMember) => {
    setPartnerToReject(partner)
    setIsRejectionModalOpen(true)
  }

  const handlePartnerRejection = async () => {
    if (!partnerToReject) return

    try {
      // updatePartnerStatus는 이제 members.id를 받습니다
      const response = await mateYouApi.admin.updatePartnerStatus(
        partnerToReject.member_id,
        'rejected',
      )

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to reject partner')
      }

      addToast('파트너가 거절 처리되었습니다.', 'success')
      setIsRejectionModalOpen(false)
      setPartnerToReject(null)
      setIsPartnerModalOpen(false)
      setSelectedPartner(null)
      await fetchData()
    } catch (error) {
      addToast('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  // 배너 관련 핸들러들
  const handleCreateBanner = async (bannerData: any) => {
    try {
      const result = await createBanner(bannerData)
      if (result.success) {
        addToast('배너가 성공적으로 생성되었습니다.', 'success')
        loadBanners()
        setIsBannerModalOpen(false)
      } else {
        addToast(result.message, 'error')
      }
    } catch (error) {
      addToast('배너 생성 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleUpdateBanner = async (bannerData: any) => {
    if (!editingBanner) return

    try {
      const result = await updateBanner(editingBanner.id, bannerData)
      if (result.success) {
        addToast('배너가 성공적으로 수정되었습니다.', 'success')
        loadBanners()
        setIsBannerModalOpen(false)
        setEditingBanner(undefined)
      } else {
        addToast(result.message, 'error')
      }
    } catch (error) {
      addToast('배너 수정 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('정말 이 배너를 삭제하시겠습니까?')) return

    try {
      const result = await deleteBanner(id)
      if (result.success) {
        addToast('배너가 성공적으로 삭제되었습니다.', 'success')
        loadBanners()
      } else {
        addToast(result.message, 'error')
      }
    } catch (error) {
      addToast('배너 삭제 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      const result = await toggleBannerStatus(id, !isActive)
      if (result.success) {
        addToast(result.message, 'success')
        loadBanners()
      } else {
        addToast(result.message, 'error')
      }
    } catch (error) {
      addToast('배너 상태 변경 중 오류가 발생했습니다.', 'error')
    }
  }

  const openCreateModal = () => {
    setEditingBanner(undefined)
    setIsBannerModalOpen(true)
  }

  const openEditModal = (banner: Banner) => {
    setEditingBanner(banner)
    setIsBannerModalOpen(true)
  }

  const handleWithdrawalApproval = async (
    withdrawalId: string,
    approve: boolean,
    withdrawal?: WithdrawalRequest,
  ) => {
    try {
      // 거절인 경우 바로 상태 변경
      if (!approve) {
        const response = await mateYouApi.admin.updateWithdrawalStatus(withdrawalId, {
          status: 'rejected',
          admin_notes: 'Admin rejected withdrawal',
        })

        if (!response.data.success) {
          // API 응답의 error.message를 그대로 토스트로 표시
          const errorMessage = response.data.error?.message || 'Failed to update withdrawal status'
          addToast(errorMessage, 'error')
          return
        }

        addToast('출금 요청이 거절되었습니다.', 'success')
        await fetchData()
        return
      }

      // 승인인 경우: 먼저 토스 payout API 호출
      const payoutResponse = await mateYouApi.toss.requestPayouts({
        withdrawalIds: [withdrawalId],
      })

      if (!payoutResponse.data.success) {
        // API 응답의 error.message를 그대로 사용
        const errorMessage = payoutResponse.data.error?.message || '토스 지급 요청에 실패했습니다.'
        addToast(errorMessage, 'error')
        return
      }

      console.log('✅ 토스 payout API 호출 성공')

      // 토스 payout 성공 후에만 상태를 'approved'로 변경
      const response = await mateYouApi.admin.updateWithdrawalStatus(withdrawalId, {
        status: 'approved',
        admin_notes: 'Admin approved withdrawal',
      })

      if (!response.data.success) {
        // API 응답의 error.message를 그대로 토스트로 표시
        const errorMessage = response.data.error?.message || 'Failed to update withdrawal status'
        addToast(errorMessage, 'error')
        return
      }

      addToast('출금 요청이 승인되었습니다.', 'success')
      await fetchData() // 데이터 새로고침
    } catch (error: any) {
      console.error('출금 승인 처리 오류:', error)
      
      // API 에러 메시지 그대로 추출 (error.response.data.error.message 우선)
      let errorMessage = '처리 중 오류가 발생했습니다.'
      
      if (error?.response?.data?.error?.message) {
        // Express API 응답 구조: { success: false, error: { message: "..." } }
        errorMessage = error.response.data.error.message
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error?.message) {
        errorMessage = error.message
      }
      
      addToast(errorMessage, 'error')
    }
  }

  // partnerId는 partners.id를 받습니다
  const handleTaxUpdate = async (partnerId: string, newTax: number) => {
    try {
      // updatePartnerTax는 partners.id를 받습니다
      const response = await mateYouApi.admin.updatePartnerTax(partnerId, newTax)

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to update partner tax')
      }

      addToast('세금 정보가 업데이트되었습니다.', 'success')
      setIsEditingTax(false)
      setEditingTax(null)
      await fetchData() // 데이터 새로고침
    } catch (error) {
      addToast('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const startTaxEdit = (currentTax: number | null) => {
    setEditingTax(currentTax || 0)
    setIsEditingTax(true)
  }

  const cancelTaxEdit = () => {
    setIsEditingTax(false)
    setEditingTax(null)
  }

  const startDistributionRateEdit = (defaultRate: number, collabRate: number) => {
    setEditingDefaultRate(defaultRate)
    setEditingCollabRate(collabRate)
    setIsEditingDistributionRate(true)
  }

  const cancelDistributionRateEdit = () => {
    setIsEditingDistributionRate(false)
  }

  const handleDistributionRateUpdate = async (partnerId: string) => {
    try {
      setIsUpdatingDistributionRate(true)
      const response = await edgeApi.storeCollaboration.updatePartnerDistributionRate({
        partner_id: partnerId,
        default_distribution_rate: editingDefaultRate,
        collaboration_distribution_rate: editingCollabRate,
      })

      if (response.success) {
        addToast('배분율이 수정되었습니다.', 'success')
        setIsEditingDistributionRate(false)
        // selectedPartner 업데이트
        if (selectedPartner) {
          setSelectedPartner({
            ...selectedPartner,
            partner_business_info: {
              ...selectedPartner.partner_business_info,
              partner_id: selectedPartner.id,
              default_distribution_rate: editingDefaultRate,
              collaboration_distribution_rate: editingCollabRate,
            },
          })
        }
        await fetchData()
      } else {
        addToast(response.error?.message || '배분율 수정에 실패했습니다.', 'error')
      }
    } catch (error: any) {
      addToast(error?.message || '배분율 수정 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsUpdatingDistributionRate(false)
    }
  }

  // 인증 로딩 중이거나 사용자가 없거나 관리자가 아닌 경우 처리
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <Typography variant="h3">로딩 중...</Typography>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Typography variant="h3" className="mb-2">로그인이 필요합니다</Typography>
              <Typography variant="body1" color="text-secondary">
                관리자 페이지에 접근하려면 로그인해주세요.
              </Typography>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Typography variant="h3" className="mb-2">접근 권한이 없습니다</Typography>
              <Typography variant="body1" color="text-secondary">
                관리자 권한이 필요합니다.
              </Typography>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      {/* Header */}
      {/* Navigation Tabs - 대분류 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1">
            {ADMIN_TAB_GROUPS.map((group) => (
              <button
                key={group.category}
                onClick={() => {
                  setSelectedCategory(group.category)
                  handleTabChange(group.tabs[0].id)
                }}
                className={`py-3 px-4 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors duration-200 rounded-t-lg ${
                  selectedCategory === group.category
                    ? 'bg-pink-200 text-[#FE3A8F] font-bold'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {group.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Navigation Tabs - 중분류 */}
      {ADMIN_TAB_GROUPS.find(g => g.category === selectedCategory)?.tabs && 
       ADMIN_TAB_GROUPS.find(g => g.category === selectedCategory)!.tabs.length > 1 && (
        <div className="bg-gray-100 border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 py-2">
              {ADMIN_TAB_GROUPS.find(g => g.category === selectedCategory)?.tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`py-2 px-4 font-medium text-sm whitespace-nowrap cursor-pointer transition-colors duration-200 rounded-lg ${
                    activeTab === tab.id
                      ? 'bg-white text-[#FE3A8F] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* 관리자 채팅 CS - 최상단 고정 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Typography variant="h4">관리자 채팅 CS</Typography>
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${csUnreadCount > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                  {csUnreadCount > 0 ? `미확인 ${csUnreadCount}건` : csRoomCount > 0 ? `${csRoomCount}개 문의` : '문의 없음'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  refreshChatRooms()
                  navigate({ to: '/chat' })
                }}
                className="w-full flex items-center gap-4 p-6 bg-white rounded-lg shadow-sm border hover:shadow-md hover:border-[#FE3A8F]/30 transition-all text-left"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#FE3A8F]/10 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-[#FE3A8F]" />
                </div>
                <div className="flex-1 min-w-0">
                  <Typography variant="h6" className="mb-1">CS 문의 채팅 바로가기</Typography>
                  <Typography variant="body2" color="text-secondary">
                    {csUnreadCount > 0
                      ? `확인하지 않은 문의가 ${csUnreadCount}건 있습니다.`
                      : '사용자 문의를 확인하고 답변하세요.'}
                  </Typography>
                </div>
                <span className="text-[#FE3A8F] font-medium text-sm">채팅 열기 →</span>
              </button>
            </div>

            {/* 새로운 파트너 요청 섹션 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Typography variant="h4">새로운 파트너 요청</Typography>
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-sm font-medium">
                  {pendingPartners.length}개
                </span>
              </div>

              {pendingPartners.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-lg shadow-sm border">
                  <Typography variant="body1" color="text-secondary">
                    새로운 파트너 요청이 없습니다.
                  </Typography>
                </div>
              ) : (
                <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
                  {pendingPartners.map((partner) => (
                    <div
                      key={partner.id}
                      className="bg-white p-6 rounded-lg shadow-sm border"
                    >
                      <Flex align="center" gap={3} className="mb-4">
                        <AvatarWithFallback
                          name={
                            partner.partner_name ||
                            partner.member.name ||
                            partner.member.member_code ||
                            'Unknown'
                          }
                          size="md"
                          src={partner.member.profile_image || undefined}
                        />
                        <div className="flex-1">
                          <Typography variant="h5" className="mb-1">
                            {partner.partner_name ||
                              partner.member.name ||
                              partner.member.member_code ||
                              'Unknown'}
                          </Typography>
                          <Typography variant="body2" color="text-secondary">
                            {partner.member.favorite_game || '게임 정보 없음'}
                          </Typography>
                        </div>
                      </Flex>

                      {partner.partner_message && (
                        <Typography
                          variant="body2"
                          className="mb-4 text-gray-600"
                        >
                          {partner.partner_message}
                        </Typography>
                      )}

                      <div className="mb-4 space-y-1">
                        <Typography
                          variant="caption"
                          color="text-secondary"
                          className="block"
                        >
                          신청일:{' '}
                          {partner.partner_applied_at
                            ? new Date(
                                partner.partner_applied_at,
                              ).toLocaleDateString('ko-KR')
                            : '정보 없음'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text-secondary"
                          className="block"
                        >
                          실명: {partner.partner_business_info?.legal_name || '정보 없음'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text-secondary"
                          className="block"
                        >
                          이메일: {partner.partner_business_info?.legal_email || '정보 없음'}
                        </Typography>
                        <div className="flex gap-2 mt-1">
                          <Typography
                            variant="caption"
                            className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded"
                          >
                            일반 {partner.partner_business_info?.default_distribution_rate ?? 85}%
                          </Typography>
                          <Typography
                            variant="caption"
                            className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded"
                          >
                            협업 {partner.partner_business_info?.collaboration_distribution_rate ?? 85}%
                          </Typography>
                        </div>
                      </div>

                      <Flex gap={2}>
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          onClick={() => handlePartnerDetail(partner)}
                        >
                          상세보기
                        </Button>
                      </Flex>
                    </div>
                  ))}
                </Grid>
              )}
            </div>

            {/* 포인트 출금 요청 섹션 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Typography variant="h4">포인트 출금 요청</Typography>
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-sm font-medium">
                  {withdrawalRequests.length}개
                </span>
              </div>

              {withdrawalRequests.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-lg shadow-sm border">
                  <Typography variant="body1" color="text-secondary">
                    출금 요청이 없습니다.
                  </Typography>
                </div>
              ) : (
                <>
                  <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
                    {withdrawalRequests.slice(0, 6).map((withdrawal) => (
                      <div
                        key={withdrawal.id}
                        className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                      >
                        <div className="space-y-4">
                          {/* 헤더 영역 */}
                          <Flex align="center" gap={3}>
                            <AvatarWithFallback
                              name={
                                withdrawal.partner.partner_name ||
                                withdrawal.partner.member.name ||
                                withdrawal.partner.member.member_code ||
                                'Unknown'
                              }
                              size="md"
                              src={
                                withdrawal.partner.member.profile_image ||
                                undefined
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <Typography
                                variant="h5"
                                className="mb-1 truncate"
                              >
                                {withdrawal.partner.partner_name ||
                                  withdrawal.partner.member.name ||
                                  withdrawal.partner.member.member_code ||
                                  'Unknown'}
                              </Typography>
                              <div className="flex gap-1.5 flex-wrap">
                                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
                                  출금 요청
                                </span>
                                {withdrawal.tier_code && (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTierBadge(withdrawal.tier_code).bg}`}>
                                    {getTierBadge(withdrawal.tier_code).label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </Flex>

                          {/* 출금 정보 */}
                          <div className="bg-orange-50 p-3 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <Typography
                                variant="body2"
                                className="font-medium"
                              >
                                💰 출금 요청 정보
                              </Typography>
                              <button
                                type="button"
                                onMouseEnter={() => setHoveredWithdrawalId(withdrawal.id)}
                                onMouseLeave={() => setHoveredWithdrawalId(null)}
                                className="p-1 rounded hover:bg-orange-100 transition-colors"
                                title={hoveredWithdrawalId === withdrawal.id ? '민감 정보 숨기기' : '민감 정보 보기'}
                              >
                                {hoveredWithdrawalId === withdrawal.id ? (
                                  <EyeOff className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <Eye className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                            </div>
                            <div className="text-sm space-y-1">
                              <div className="text-orange-600 font-bold">
                                출금 금액 :{' '}
                                {(withdrawal.requested_amount * (1 - (withdrawal.partner.business_info?.tax || 0) / 100)).toLocaleString() || '정보 없음'}P
                              </div>
                              <div className="font-medium text-gray-600 ">
                                요청 금액:{' '}
                                {withdrawal.requested_amount.toLocaleString()}P
                                <span className="text-gray-400 text-xs"> (수수료 {withdrawal.partner.business_info?.tax || 0}%) </span>
                              </div>
                              <div className="text-gray-600">
                                은행: {withdrawal.bank_name || '정보 없음'}
                              </div>
                              <div className="text-gray-600">
                                예금주:{' '}
                                {hoveredWithdrawalId === withdrawal.id
                                  ? withdrawal.bank_owner || '정보 없음'
                                  : maskName(withdrawal.bank_owner || '정보 없음')}
                              </div>
                              <div className="text-gray-600">
                                계좌번호:{' '}
                                {hoveredWithdrawalId === withdrawal.id
                                  ? withdrawal.bank_num || '정보 없음'
                                  : maskAccountNumber(withdrawal.bank_num || '정보 없음')}
                              </div>
                              <div className="text-gray-600">
                                요청일:{' '}
                                {new Date(
                                  withdrawal.requested_at,
                                ).toLocaleDateString('ko-KR')}
                              </div>
                              {withdrawal.applicable_rate != null && (
                                <div className="text-gray-600">
                                  정산율:{' '}
                                  <span className={`font-medium text-xs px-1.5 py-0.5 rounded ${
                                    withdrawal.tier_code
                                      ? getTierBadge(withdrawal.tier_code).bg
                                      : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {getRateLabel(withdrawal.rate_type)} {withdrawal.applicable_rate}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 액션 버튼 */}
                          <Flex gap={2}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                handleWithdrawalApproval(withdrawal.id, true, withdrawal)
                              }
                              className="flex-1"
                            >
                              승인
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                handleWithdrawalApproval(withdrawal.id, false, withdrawal)
                              }
                              className="flex-1"
                            >
                              거절
                            </Button>
                          </Flex>
                        </div>
                      </div>
                    ))}
                  </Grid>
                  {withdrawalRequests.length > 6 && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={() => handleTabChange('withdrawals')}
                        className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors"
                      >
                        {withdrawalRequests.length - 6}개 더 보기 →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'partners' && (
          <div className="space-y-8">
            {/* 파트너 관리 헤더 */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Typography variant="h4">파트너 관리</Typography>
                </div>
                <div className="flex items-center gap-4">
                  {/* 상태 필터 버튼들 */}
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    {[
                      { id: 'all', label: '전체' },
                      { id: 'pending', label: '대기중' },
                      { id: 'approved', label: '승인됨' },
                      { id: 'rejected', label: '거절됨' },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => handlePartnerStatusFilterChange(filter.id as any)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                          partnerStatusFilter === filter.id
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {filter.label} ({partnerStatusCounts[filter.id as keyof typeof partnerStatusCounts]})
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 검색 UI */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="파트너명, 회원명, Discord ID로 검색..."
                    value={partnerSearchInput}
                    onChange={(e) => setPartnerSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePartnerSearch()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handlePartnerSearch}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  검색
                </button>
                {partnerSearch && (
                  <button
                    onClick={handlePartnerSearchClear}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    초기화
                  </button>
                )}
                {partnerSearch && (
                  <span className="text-sm text-gray-500">
                    "{partnerSearch}" 검색 결과
                  </span>
                )}
              </div>
            </div>

            {partnersLoading ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  파트너 목록을 불러오는 중...
                </Typography>
              </div>
            ) : [...pendingPartners, ...approvedPartners, ...rejectedPartners].length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  {partnerStatusFilter === 'all'
                    ? '등록된 파트너가 없습니다.'
                    : partnerStatusFilter === 'pending'
                      ? '대기중인 파트너 요청이 없습니다.'
                      : partnerStatusFilter === 'approved'
                        ? '승인된 파트너가 없습니다.'
                        : '거절된 파트너가 없습니다.'}
                </Typography>
              </div>
            ) : (
            <>
              <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
                {[...pendingPartners, ...approvedPartners, ...rejectedPartners].map((partner) => {
                  const getStatusBadge = () => {
                    if (partner.partner_status === 'pending') {
                      return (
                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                          신청 대기
                        </span>
                      )
                    }
                    if (partner.partner_status === 'approved') {
                      return (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                          승인됨
                        </span>
                      )
                    }
                    if (partner.partner_status === 'rejected') {
                      return (
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                          거절됨
                        </span>
                      )
                    }
                    return null
                  }

                  const getActionButton = () => {
                    if (partner.partner_status === 'pending') {
                      return (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handlePartnerDetail(partner)}
                          className="w-full"
                        >
                          상세보기 및 승인
                        </Button>
                      )
                    }
                    return (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePartnerDetail(partner)}
                        className="w-full"
                      >
                        상세보기
                      </Button>
                    )
                  }

                  return (
                    <div
                      key={partner.id}
                      className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-4">
                        {/* 헤더 영역 */}
                        <Flex align="center" gap={3}>
                          <AvatarWithFallback
                            name={
                              partner.partner_name ||
                              partner.member.name ||
                              partner.member.member_code ||
                              'Unknown'
                            }
                            size="md"
                            src={partner.member.profile_image || undefined}
                          />
                          <div className="flex-1 min-w-0">
                            <Typography variant="h5" className="mb-1 truncate">
                              {partner.partner_name ||
                                partner.member.name ||
                                partner.member.member_code ||
                                'Unknown'}
                            </Typography>
                            {getStatusBadge()}
                          </div>
                        </Flex>

                        {/* 정보 영역 */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-1 text-sm text-gray-600">
                            <div>
                              {partner.partner_status === 'approved' ? '📅 가입: ' : '📅 신청일: '}
                              {partner.partner_status === 'approved'
                                ? new Date(partner.created_at).toLocaleDateString('ko-KR')
                                : partner.partner_applied_at
                                  ? new Date(partner.partner_applied_at).toLocaleDateString('ko-KR')
                                  : '정보 없음'}
                            </div>
                            <div>
                              🎮 선호 게임:{' '}
                              {partner.member.favorite_game || '게임 정보 없음'}
                            </div>
                            <div>
                              🟢 상태:{' '}
                              {getStatusLabel(partner.member.current_status || 'offline')}
                            </div>
                            <div>
                              👤 이름:{' '}
                              {partner.partner_name || partner.member.social_id || '미설정'}
                            </div>
                            <div>
                              📝 실명: {partner.partner_business_info?.legal_name || '정보 없음'}
                            </div>
                            <div>
                              📧 이메일: {partner.partner_business_info?.legal_email || '정보 없음'}
                            </div>
                            <div>
                              💸 수수료: {partner.partner_business_info?.tax || '정보 없음'}%
                            </div>
                          </div>

                          {/* 승인된 파트너의 포인트 정보 */}
                          {partner.partner_status === 'approved' && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <Typography variant="body2" className="font-medium mb-1">
                                💰 포인트 현황
                              </Typography>
                              <div className="text-sm">
                                총 포인트: {partner.total_points?.toLocaleString() || 0}P
                              </div>
                            </div>
                          )}

                          {/* 대기중인 파트너의 신청 메시지 */}
                          {partner.partner_status === 'pending' && partner.partner_message && (
                            <div className="bg-yellow-50 p-3 rounded-lg">
                              <Typography variant="body2" className="font-medium mb-1">
                                📝 신청 메시지
                              </Typography>
                              <Typography variant="body2" className="text-sm text-gray-600">
                                {partner.partner_message.length > 80
                                  ? partner.partner_message.slice(0, 80) + '...'
                                  : partner.partner_message}
                              </Typography>
                            </div>
                          )}

                          {/* 거절된 파트너의 거절 사유 */}
                          {partner.partner_status === 'rejected' && (partner as any).rejection_reason && (
                            <div className="bg-red-50 p-3 rounded-lg">
                              <Typography variant="body2" className="font-medium mb-1">
                                ❌ 거절 사유
                              </Typography>
                              <Typography variant="body2" className="text-sm text-gray-600">
                                {(partner as any).rejection_reason}
                              </Typography>
                            </div>
                          )}
                        </div>

                        {/* 액션 버튼 */}
                        <div className="pt-2">{getActionButton()}</div>
                      </div>
                    </div>
                  )
                })}
              </Grid>

            {/* 페이지네이션 UI */}
            {totalPartnerPages > 1 && (
              <div className="flex items-center justify-center gap-1 sm:gap-2 mt-6">
                <button
                  onClick={() => handlePartnerPageChange(1)}
                  disabled={partnerPage === 1}
                  className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="hidden sm:inline">처음</span>
                  <span className="sm:hidden">&lt;&lt;</span>
                </button>
                <button
                  onClick={() => handlePartnerPageChange(partnerPage - 1)}
                  disabled={partnerPage === 1}
                  className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="hidden sm:inline">이전</span>
                  <span className="sm:hidden">&lt;</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPartnerPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPartnerPages <= 5) {
                      pageNum = i + 1
                    } else if (partnerPage <= 3) {
                      pageNum = i + 1
                    } else if (partnerPage >= totalPartnerPages - 2) {
                      pageNum = totalPartnerPages - 4 + i
                    } else {
                      pageNum = partnerPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePartnerPageChange(pageNum)}
                        className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-md text-sm font-medium cursor-pointer ${
                          partnerPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => handlePartnerPageChange(partnerPage + 1)}
                  disabled={partnerPage === totalPartnerPages}
                  className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="hidden sm:inline">다음</span>
                  <span className="sm:hidden">&gt;</span>
                </button>
                <button
                  onClick={() => handlePartnerPageChange(totalPartnerPages)}
                  disabled={partnerPage === totalPartnerPages}
                  className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="hidden sm:inline">마지막</span>
                  <span className="sm:hidden">&gt;&gt;</span>
                </button>
              </div>
            )}
            </>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Typography variant="h4">전체 회원 관리</Typography>
              </div>
              <div className="flex items-center gap-4">
                {/* 필터 버튼들 */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                  {[
                    { id: 'all', label: '전체' },
                    { id: 'normal', label: '일반회원' },
                    { id: 'partner', label: '파트너' },
                    { id: 'admin', label: '관리자' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => handleMemberFilterChange(filter.id as any)}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                        memberFilter === filter.id
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {filter.label} ({memberRoleCounts[filter.id as keyof typeof memberRoleCounts]})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 검색 UI */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="이름, 회원코드, Discord ID로 검색..."
                  value={memberSearchInput}
                  onChange={(e) => setMemberSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMemberSearch()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleMemberSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-1 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                검색
              </button>
              {memberSearch && (
                <button
                  onClick={handleMemberSearchClear}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  초기화
                </button>
              )}
              {memberSearch && (
                <span className="text-sm text-gray-500">
                  "{memberSearch}" 검색 결과
                </span>
              )}
            </div>

            {membersLoading ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  회원 목록을 불러오는 중...
                </Typography>
              </div>
            ) : allMembers.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  {memberFilter === 'all'
                    ? '등록된 회원이 없습니다.'
                    : memberFilter === 'normal'
                      ? '일반 회원이 없습니다.'
                      : memberFilter === 'partner'
                        ? '파트너 관련 회원이 없습니다.'
                        : '관리자가 없습니다.'}
                </Typography>
              </div>
            ) : (
              <>
              <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
                {allMembers.map((member) => {
                  const getStatusBadge = () => {
                    if (member.role === 'admin') {
                      return (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                          관리자
                        </span>
                      )
                    }
                    if (member.role === 'partner') {
                      return (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                          파트너
                        </span>
                      )
                    }
                    return (
                      <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">
                        일반 회원
                      </span>
                    )
                  }

                  const getActionButton = () => {
                    if (member.role === 'partner') {
                      return (
                        <Flex gap={2} className="w-full">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMemberDetail(member)}
                            className="flex-1"
                          >
                            상세보기
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleResetToNormalMember(member.id)}
                            className="flex-1"
                          >
                            일반전환
                          </Button>
                        </Flex>
                      )
                    }
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMemberDetail(member)}
                        className="w-full"
                      >
                        상세보기
                      </Button>
                    )
                  }

                  return (
                    <div
                      key={member.id}
                      className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-4">
                        {/* 헤더 영역 */}
                        <Flex align="center" gap={3}>
                          <AvatarWithFallback
                            name={
                              member.name ||
                              member.name ||
                              member.member_code ||
                              'Unknown'
                            }
                            size="md"
                            src={member.profile_image || undefined}
                          />
                          <div className="flex-1 min-w-0">
                            <Typography variant="h5" className="mb-1 truncate">
                              {member.name || member.member_code || 'Unknown'}
                            </Typography>
                            {getStatusBadge()}
                          </div>
                        </Flex>

                        {/* 정보 영역 */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-1 text-sm text-gray-600">
                            <div>
                              📅 가입:{' '}
                              {new Date(member.created_at).toLocaleDateString(
                                'ko-KR',
                              )}
                            </div>
                            <div>
                              🟢 상태:{' '}
                              {getStatusLabel(
                                member.current_status || 'offline',
                              )}
                            </div>
                            <div>
                              💬 Discord: {member.social_id || '미연결'}
                            </div>
                            <div>
                              💰 현재 포인트 : {member.total_points.toLocaleString('ko-KR') || 0} P
                            </div>
                          </div>

                          {member.favorite_game && (
                            <div className="text-sm text-gray-600">
                              🎮 선호 게임: {member.favorite_game}
                            </div>
                          )}
                        </div>

                        {/* 액션 버튼 */}
                        <div className="pt-2">{getActionButton()}</div>
                      </div>
                    </div>
                  )
                })}
              </Grid>

              {/* 페이지네이션 UI */}
              {totalMemberPages > 1 && (
                <div className="flex items-center justify-center gap-1 sm:gap-2 mt-6">
                  <button
                    onClick={() => handleMemberPageChange(1)}
                    disabled={memberPage === 1}
                    className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span className="hidden sm:inline">처음</span>
                    <span className="sm:hidden">&lt;&lt;</span>
                  </button>
                  <button
                    onClick={() => handleMemberPageChange(memberPage - 1)}
                    disabled={memberPage === 1}
                    className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span className="hidden sm:inline">이전</span>
                    <span className="sm:hidden">&lt;</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalMemberPages) }, (_, i) => {
                      let pageNum: number
                      if (totalMemberPages <= 5) {
                        pageNum = i + 1
                      } else if (memberPage <= 3) {
                        pageNum = i + 1
                      } else if (memberPage >= totalMemberPages - 2) {
                        pageNum = totalMemberPages - 4 + i
                      } else {
                        pageNum = memberPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handleMemberPageChange(pageNum)}
                          className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-md text-sm font-medium cursor-pointer ${
                            memberPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => handleMemberPageChange(memberPage + 1)}
                    disabled={memberPage === totalMemberPages}
                    className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span className="hidden sm:inline">다음</span>
                    <span className="sm:hidden">&gt;</span>
                  </button>
                  <button
                    onClick={() => handleMemberPageChange(totalMemberPages)}
                    disabled={memberPage === totalMemberPages}
                    className="px-2 sm:px-3 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span className="hidden sm:inline">마지막</span>
                    <span className="sm:hidden">&gt;&gt;</span>
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Typography variant="h4">포인트 출금 요청</Typography>
              <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-sm font-medium">
                총 {withdrawalRequests.filter(w => withdrawalTypeFilter === 'all' || w.withdrawal_type === withdrawalTypeFilter).length}건
              </span>
            </div>

            <div className="flex gap-2 flex-wrap">
              {(['all', 'total_points', 'store_points', 'collaboration_store_points'] as const).map((type) => {
                const typeLabel = type === 'all' ? '전체' : 
                  type === 'total_points' ? '일반 포인트' :
                  type === 'store_points' ? '스토어 포인트' : '협업 포인트'
                const pendingCount = type === 'all' 
                  ? withdrawalRequests.length
                  : withdrawalStats?.byType[type]?.pending ?? 0
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setWithdrawalTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      withdrawalTypeFilter === type
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {typeLabel}{pendingCount > 0 && ` (${pendingCount})`}
                  </button>
                )
              })}
            </div>

            {withdrawalRequests.filter(w => withdrawalTypeFilter === 'all' || w.withdrawal_type === withdrawalTypeFilter).length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  출금 요청이 없습니다.
                </Typography>
              </div>
            ) : (
              <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
                {withdrawalRequests
                  .filter(w => withdrawalTypeFilter === 'all' || w.withdrawal_type === withdrawalTypeFilter)
                  .map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-4">
                      {/* 헤더 영역 */}
                      <Flex align="center" gap={3}>
                        <AvatarWithFallback
                          name={
                            withdrawal.partner.partner_name ||
                            withdrawal.partner.member.name ||
                            withdrawal.partner.member.member_code ||
                            'Unknown'
                          }
                          size="md"
                          src={
                            withdrawal.partner.member.profile_image || undefined
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <Typography variant="h5" className="mb-1 truncate">
                            {withdrawal.partner.partner_name ||
                              withdrawal.partner.member.name ||
                              withdrawal.partner.member.member_code ||
                              'Unknown'}
                          </Typography>
                          <div className="flex gap-1.5 flex-wrap">
                            <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
                              출금 요청
                            </span>
                            {withdrawal.withdrawal_type && (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                withdrawal.withdrawal_type === 'total_points' ? 'bg-blue-100 text-blue-800' :
                                withdrawal.withdrawal_type === 'store_points' ? 'bg-green-100 text-green-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {withdrawal.withdrawal_type === 'total_points' ? '일반 포인트' :
                                 withdrawal.withdrawal_type === 'store_points' ? '스토어 포인트' : '협업 포인트'}
                              </span>
                            )}
                            {withdrawal.tier_code && (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTierBadge(withdrawal.tier_code).bg}`}>
                                {getTierBadge(withdrawal.tier_code).label}
                              </span>
                            )}
                          </div>
                        </div>
                      </Flex>

                      {/* 출금 정보 */}
                      <div className="bg-orange-50 p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <Typography
                            variant="body2"
                            className="font-medium"
                          >
                            💰 출금 요청 정보
                          </Typography>
                          <button
                            type="button"
                            onMouseEnter={() => setHoveredWithdrawalId(withdrawal.id)}
                            onMouseLeave={() => setHoveredWithdrawalId(null)}
                            className="p-1 rounded hover:bg-orange-100 transition-colors"
                            title={hoveredWithdrawalId === withdrawal.id ? '민감 정보 숨기기' : '민감 정보 보기'}
                          >
                            {hoveredWithdrawalId === withdrawal.id ? (
                              <EyeOff className="w-4 h-4 text-gray-400" />
                            ) : (
                              <Eye className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">
                              요청 금액
                            </span>
                            <span className="font-medium text-orange-600 text-lg">
                              {withdrawal.requested_amount?.toLocaleString()}P
                            </span>
                          </div>
                          {withdrawal.applicable_rate != null && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">
                                정산율 ({getRateLabel(withdrawal.rate_type)})
                              </span>
                              <span className={`font-medium text-sm px-2 py-0.5 rounded ${
                                withdrawal.tier_code
                                  ? getTierBadge(withdrawal.tier_code).bg
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {withdrawal.applicable_rate}% 지급
                              </span>
                            </div>
                          )}
                          {withdrawal.partner.business_info?.tax != null && withdrawal.partner.business_info.tax > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">
                                실수령액 (수수료 {withdrawal.partner.business_info.tax}%)
                              </span>
                              <span className="font-medium text-green-600 text-lg">
                                {Math.floor(withdrawal.requested_amount * (1 - withdrawal.partner.business_info.tax / 100)).toLocaleString()}P
                              </span>
                            </div>
                          )}
                          <div className="pt-2 border-t border-orange-200">
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-600">은행</span>
                                <span className="font-medium">
                                  {withdrawal.bank_name || '정보 없음'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">예금주</span>
                                <span className="font-medium">
                                  {hoveredWithdrawalId === withdrawal.id
                                    ? withdrawal.bank_owner || '정보 없음'
                                    : maskName(withdrawal.bank_owner || '정보 없음')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">계좌번호</span>
                                <span className="font-medium">
                                  {hoveredWithdrawalId === withdrawal.id
                                    ? withdrawal.bank_num || '정보 없음'
                                    : maskAccountNumber(withdrawal.bank_num || '정보 없음')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">요청일</span>
                                <span className="font-medium">
                                  {new Date(
                                    withdrawal.requested_at,
                                  ).toLocaleDateString('ko-KR')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 추가 정보 */}
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>
                          🎮 선호 게임:{' '}
                          {withdrawal.partner.member.favorite_game || '없음'}
                        </div>
                        <div>
                          🟢 상태:{' '}
                          {getStatusLabel(
                            withdrawal.partner.member.current_status ||
                              'offline',
                          )}
                        </div>
                        <div>
                          💰 현재 보유 포인트:{' '}
                          {withdrawal.partner.total_points?.toLocaleString() ||
                            0}
                          P
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <Flex gap={2}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            handleWithdrawalApproval(withdrawal.id, true, withdrawal)
                          }
                          className="flex-1"
                        >
                          승인
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleWithdrawalApproval(withdrawal.id, false, withdrawal)
                          }
                          className="flex-1"
                        >
                          거절
                        </Button>
                      </Flex>
                    </div>
                  </div>
                ))}
              </Grid>
            )}
          </div>
        )}

        {activeTab === 'payouts' && (
          <div className="space-y-6">
            {/* 헤더 영역 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Typography variant="h4">토스 지급대행 조회</Typography>
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                  총 {payouts.length}건
                </span>
                <button
                  onClick={() => loadPayouts()}
                  disabled={payoutsLoading}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  title="새로고침"
                >
                  <svg
                    className={`w-5 h-5 ${payoutsLoading ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>

              {/* 상태 필터 */}
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: '전체' },
                  { value: 'REQUESTED', label: '요청됨' },
                  { value: 'COMPLETED', label: '완료' },
                  { value: 'FAILED', label: '실패' },
                  { value: 'CANCELED', label: '취소됨' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setPayoutStatusFilter(filter.value as any)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-colors ${
                      payoutStatusFilter === filter.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-500">
              기본값은 오늘부터 7일 후까지입니다. 빠른 필터(1주일/1달/1년)는 오늘 기준 과거 기간을 조회합니다. <br />
              추가적으로 하단에 보이는 리스트는 토스에서 제공해주는 순서입니다. 요청순 및 오래된 순으로 정렬되어 있습니다. <br />
              해당 부분은 검색 또한 지원하지 않습니다. 확인 시에는 꼭 날짜 필터를 활용해주세요.
            </p>
            {/* 날짜 필터 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Typography variant="body2" className="font-medium text-gray-700 whitespace-nowrap">
                  지급 예정일
                </Typography>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={payoutDateFrom}
                    onChange={(e) => setPayoutDateFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="시작일"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="date"
                    value={payoutDateTo}
                    onChange={(e) => setPayoutDateTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="종료일"
                  />
                  <button
                    onClick={handlePayoutDateSearch}
                    disabled={payoutsLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    검색
                  </button>
                  <button
                    onClick={handlePayoutDateReset}
                    disabled={payoutsLoading}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    초기화
                  </button>
                  <span className="text-gray-300 mx-1">|</span>
                  {[
                    { type: 'today' as const, label: '오늘만' },
                    { type: 'week' as const, label: '1주일' },
                    { type: 'month' as const, label: '1달' },
                    { type: 'year' as const, label: '1년' },
                  ].map((filter) => (
                    <button
                      key={filter.type}
                      onClick={() => setPayoutQuickFilter(filter.type)}
                      disabled={payoutsLoading}
                      className="px-3 py-2 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 hover:border-gray-300 disabled:opacity-50 transition-colors"
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 로딩 상태 */}
            {payoutsLoading && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <Typography variant="body1" color="text-secondary">
                  지급대행 내역을 불러오는 중...
                </Typography>
              </div>
            )}

            {/* 빈 상태 */}
            {!payoutsLoading && payouts.length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <div className="text-4xl mb-4">💳</div>
                <Typography variant="body1" color="text-secondary">
                  지급대행 내역이 없습니다.
                </Typography>
                <Typography variant="body2" color="text-secondary" className="mt-2">
                  포인트 출금 요청을 승인하면 여기에 표시됩니다.
                </Typography>
              </div>
            )}

            {/* 지급대행 목록 */}
            {!payoutsLoading && payouts.length > 0 && (
              <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
                {payouts
                  .filter((payout) => payoutStatusFilter === 'all' || payout.status === payoutStatusFilter)
                  .map((payout) => (
                    <div
                      key={payout.id}
                      className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedPayout(payout)
                        setIsPayoutModalOpen(true)
                      }}
                    >
                      <div className="space-y-4">
                        {/* 헤더 영역 */}
                        <Flex align="center" justify="between">
                          <div className="flex-1 min-w-0">
                            <Typography variant="h5" className="truncate">
                              {payout.partnerInfo?.partnerName || '알 수 없음'} - 출금
                            </Typography>
                            {payout.partnerInfo?.memberName && (
                              <Typography variant="caption" color="text-secondary">
                                {payout.partnerInfo.memberName}
                              </Typography>
                            )}
                          </div>
                          <div className="flex gap-1.5 flex-wrap ml-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              payout.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                              payout.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-800' :
                              payout.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                              payout.status === 'CANCELED' ? 'bg-gray-100 text-gray-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {payout.status === 'COMPLETED' ? '완료' :
                               payout.status === 'REQUESTED' ? '요청됨' :
                               payout.status === 'FAILED' ? '실패' :
                               payout.status === 'CANCELED' ? '취소됨' : payout.status}
                            </span>
                            {payout.withdrawalInfo?.withdrawalType && (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                                payout.withdrawalInfo.withdrawalType === 'total_points' ? 'bg-blue-100 text-blue-800' :
                                payout.withdrawalInfo.withdrawalType === 'store_points' ? 'bg-green-100 text-green-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {payout.withdrawalInfo.withdrawalType === 'total_points' ? '일반 포인트' :
                                 payout.withdrawalInfo.withdrawalType === 'store_points' ? '스토어 포인트' : '협업 포인트'}
                              </span>
                            )}
                          </div>
                        </Flex>

                        {/* 금액 정보 */}
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">지급 금액</span>
                            <span className="font-bold text-blue-600 text-xl">
                              {payout.amount.value.toLocaleString()}원
                            </span>
                          </div>
                          {payout.withdrawalInfo?.applicableRate != null && (
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200">
                              <span className="text-sm text-gray-600">
                                배분율 ({payout.withdrawalInfo.rateType === 'collaboration' ? '협업' : '일반'})
                              </span>
                              <span className={`font-medium text-sm px-2 py-0.5 rounded ${
                                payout.withdrawalInfo.rateType === 'collaboration'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {payout.withdrawalInfo.applicableRate}%
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 상세 정보 */}
                        <div className="text-sm text-gray-600 space-y-2">
                          <div className="flex justify-between">
                            <span>지급 예정일</span>
                            <span className="font-medium text-gray-900">{payout.payoutDate}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>요청 시간</span>
                            <span className="font-medium text-gray-900">
                              {new Date(payout.requestedAt).toLocaleString('ko-KR')}
                            </span>
                          </div>
                        </div>

                        {/* 에러 정보 (실패 시) */}
                        {payout.error && (
                          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <Typography variant="body2" className="text-red-800 font-medium">
                              ⚠️ {payout.error.code}
                            </Typography>
                            <Typography variant="caption" className="text-red-600 mt-1">
                              {payout.error.message}
                            </Typography>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </Grid>
            )}

            {/* 필터된 결과가 없을 때 */}
            {!payoutsLoading && payouts.length > 0 &&
             payouts.filter((payout) => payoutStatusFilter === 'all' || payout.status === payoutStatusFilter).length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  '{payoutStatusFilter === 'REQUESTED' ? '요청됨' :
                    payoutStatusFilter === 'COMPLETED' ? '완료' :
                    payoutStatusFilter === 'FAILED' ? '실패' :
                    payoutStatusFilter === 'CANCELED' ? '취소됨' : payoutStatusFilter}' 상태의 지급대행 내역이 없습니다.
                </Typography>
              </div>
            )}
          </div>
        )}

        {/* 지급대행 상세 모달 */}
        <Modal
          isOpen={isPayoutModalOpen}
          onClose={() => {
            setIsPayoutModalOpen(false)
            setSelectedPayout(null)
          }}
          title="지급대행 상세 정보"
          size="md"
        >
          {selectedPayout && (
            <div className="space-y-6">
              {/* 상태 배지 */}
              <div className="flex justify-center">
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${
                  selectedPayout.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                  selectedPayout.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-800' :
                  selectedPayout.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                  selectedPayout.status === 'CANCELED' ? 'bg-gray-100 text-gray-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {selectedPayout.status === 'COMPLETED' ? '✅ 완료' :
                   selectedPayout.status === 'REQUESTED' ? '⏳ 요청됨' :
                   selectedPayout.status === 'FAILED' ? '❌ 실패' :
                   selectedPayout.status === 'CANCELED' ? '🚫 취소됨' : selectedPayout.status}
                </span>
              </div>

              {/* 금액 정보 */}
              <div className="bg-blue-50 p-6 rounded-lg space-y-3">
                {/* 요청 금액 (메타데이터에 있을 경우) */}
                {selectedPayout.metadata?.requestedAmount && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">요청 금액</span>
                    <span className="font-medium text-gray-900">
                      {Number(selectedPayout.metadata.requestedAmount).toLocaleString()}원
                    </span>
                  </div>
                )}
                {/* 수수료 (메타데이터에 있을 경우) */}
                {selectedPayout.metadata?.tax && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">수수료</span>
                    <span className="font-medium text-orange-600">
                      {selectedPayout.metadata.tax}%
                    </span>
                  </div>
                )}
                {/* 배분율 정보 (withdrawalInfo) */}
                {selectedPayout.withdrawalInfo?.applicableRate != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">
                      배분율 ({selectedPayout.withdrawalInfo.rateType === 'collaboration' ? '협업' : '일반'})
                    </span>
                    <span className={`font-medium px-2 py-0.5 rounded ${
                      selectedPayout.withdrawalInfo.rateType === 'collaboration'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedPayout.withdrawalInfo.applicableRate}%
                    </span>
                  </div>
                )}
                {/* 실 지급 금액 */}
                <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                  <span className="text-gray-700 font-medium">실 지급 금액</span>
                  <span className="font-bold text-blue-600 text-xl">
                    {selectedPayout.amount.value.toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* 상세 정보 테이블 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">지급 ID</span>
                  <span className="font-medium font-mono text-sm">{selectedPayout.id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">셀러 ID</span>
                  <span className="font-medium">{selectedPayout.destination}</span>
                </div>
                {/* 파트너 정보 */}
                {selectedPayout.partnerInfo && (
                  <>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">파트너명</span>
                      <span className="font-medium">{selectedPayout.partnerInfo.partnerName}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">회원코드</span>
                      <span className="font-medium font-mono text-sm">{selectedPayout.partnerInfo.memberCode}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">지급 예정일</span>
                  <span className="font-medium">{selectedPayout.payoutDate}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">설명</span>
                  <span className="font-medium">{selectedPayout.transactionDescription || '-'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">요청 시간</span>
                  <span className="font-medium">
                    {new Date(selectedPayout.requestedAt).toLocaleString('ko-KR')}
                  </span>
                </div>
              </div>

              {/* 에러 정보 */}
              {selectedPayout.error && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <Typography variant="h6" className="text-red-800 mb-2">
                    ⚠️ 오류 정보
                  </Typography>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-red-600">에러 코드</span>
                      <span className="font-medium text-red-800">{selectedPayout.error.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">에러 메시지</span>
                      <span className="font-medium text-red-800">{selectedPayout.error.message}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 버튼 영역 */}
              <div className="flex justify-end gap-3">
                {/* REQUESTED 상태일 때만 취소 버튼 표시 */}
                {selectedPayout.status === 'REQUESTED' && (
                  <Button
                    variant="error"
                    onClick={() => handleCancelPayout(selectedPayout.id)}
                    disabled={isCancelingPayout}
                  >
                    {isCancelingPayout ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        취소 중...
                      </span>
                    ) : (
                      '지급 취소'
                    )}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsPayoutModalOpen(false)
                    setSelectedPayout(null)
                  }}
                >
                  닫기
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {activeTab === 'test' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <Typography variant="h3" className="mb-4">
                테스트 페이지
              </Typography>

              {/* Toss Balance API 테스트 */}
              <TossBalanceTest />
              
              {/* Toss Sellers API 테스트 */}
              <div className="mt-8 pt-8 border-t">
                <TossSellersTest />
              </div>

              {/* Toss 지급 대행 관리 */}
              <div className="mt-8 pt-8 border-t">
                <TossPayoutManagement />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <Typography variant="h4">포인트 로그</Typography>

            {/* 회원/파트너 탭 */}
            <div className="flex space-x-4 border-b">
              <button
                onClick={() => handleLogsTabChange('member')}
                className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  logsTab === 'member'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                회원 포인트 로그
              </button>
              <button
                onClick={() => handleLogsTabChange('partner')}
                className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  logsTab === 'partner'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                파트너 포인트 로그
              </button>
            </div>

            {/* 필터 및 검색 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* 타입 필터 */}
                <div className="flex gap-2">
                  {[
                    { value: 'all', label: '전체' },
                    { value: 'earn', label: '적립' },
                    { value: 'spend', label: '사용' },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => handleLogsTypeFilterChange(filter.value as 'all' | 'earn' | 'spend')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        logsTypeFilter === filter.value
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {/* 검색 */}
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={logsSearchInput}
                    onChange={(e) => setLogsSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogsSearch()}
                    placeholder="이름, 코드, 설명 검색..."
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button variant="primary" size="sm" onClick={handleLogsSearch}>
                    검색
                  </Button>
                  {logsSearch && (
                    <Button variant="secondary" size="sm" onClick={handleLogsSearchClear}>
                      초기화
                    </Button>
                  )}
                </div>

                {/* 엑셀 내보내기 버튼 */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsExportModalOpen(true)}
                  className="whitespace-nowrap"
                >
                  엑셀 내보내기
                </Button>
              </div>
            </div>

            {/* 로그 목록 */}
            {logsLoading ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1">로딩 중...</Typography>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {logsTab === 'member' ? '회원' : '파트너'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          타입
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          금액
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          설명
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          일시
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logsTab === 'member' ? (
                        memberPointsLogsList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                              로그가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          memberPointsLogsList.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {log.member_name || '알 수 없음'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {log.member_code}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  log.type === 'earn'
                                    ? 'bg-green-100 text-green-800'
                                    : log.type === 'spend'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {log.type === 'earn' ? '적립' : log.type === 'spend' ? '사용' : '출금'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`text-sm font-medium ${
                                  log.type === 'earn' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {log.type === 'earn' ? '+' : '-'}{log.amount.toLocaleString()}P
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-gray-600 max-w-xs truncate block">
                                  {log.description || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {new Date(log.created_at).toLocaleString('ko-KR')}
                              </td>
                            </tr>
                          ))
                        )
                      ) : (
                        partnerPointsLogsList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                              로그가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          partnerPointsLogsList.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {log.partner_name || '알 수 없음'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  log.type === 'earn'
                                    ? 'bg-green-100 text-green-800'
                                    : log.type === 'spend'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {log.type === 'earn' ? '적립' : log.type === 'spend' ? '사용' : '출금'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`text-sm font-medium ${
                                  log.type === 'earn' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {log.type === 'earn' ? '+' : '-'}{log.amount.toLocaleString()}P
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-gray-600 max-w-xs truncate block">
                                  {log.description || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {new Date(log.created_at).toLocaleString('ko-KR')}
                              </td>
                            </tr>
                          ))
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {totalLogsPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-500 hidden sm:block">
                      총 {logsTotalCount}개 중 {(logsPage - 1) * LOGS_PER_PAGE + 1}-{Math.min(logsPage * LOGS_PER_PAGE, logsTotalCount)}개
                    </div>
                    <div className="flex gap-1 w-full sm:w-auto justify-center sm:justify-end">
                      <button
                        onClick={() => handleLogsPageChange(1)}
                        disabled={logsPage === 1}
                        className="px-2 sm:px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <span className="hidden sm:inline">처음</span>
                        <span className="sm:hidden">&lt;&lt;</span>
                      </button>
                      <button
                        onClick={() => handleLogsPageChange(logsPage - 1)}
                        disabled={logsPage === 1}
                        className="px-2 sm:px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <span className="hidden sm:inline">이전</span>
                        <span className="sm:hidden">&lt;</span>
                      </button>
                      <span className="px-2 sm:px-3 py-1 text-sm">
                        {logsPage} / {totalLogsPages}
                      </span>
                      <button
                        onClick={() => handleLogsPageChange(logsPage + 1)}
                        disabled={logsPage === totalLogsPages}
                        className="px-2 sm:px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <span className="hidden sm:inline">다음</span>
                        <span className="sm:hidden">&gt;</span>
                      </button>
                      <button
                        onClick={() => handleLogsPageChange(totalLogsPages)}
                        disabled={logsPage === totalLogsPages}
                        className="px-2 sm:px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <span className="hidden sm:inline">마지막</span>
                        <span className="sm:hidden">&gt;&gt;</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 엑셀 내보내기 모달 */}
            <Modal
              isOpen={isExportModalOpen}
              onClose={() => setIsExportModalOpen(false)}
              title="엑셀 내보내기"
            >
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    날짜 범위
                  </label>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      value={exportStartDate?.toISOString().split('T')[0]}
                      onChange={(date) => setExportStartDate(date ? new Date(date) : null)}
                      placeholder="시작일"
                      className="flex-1"
                    />
                    <span className="text-gray-500">~</span>
                    <DatePicker
                      value={exportEndDate?.toISOString().split('T')[0]}
                      onChange={(date) => setExportEndDate(date ? new Date(date) : null)}
                      placeholder="종료일"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    최대 건수
                  </label>
                  <div className="flex gap-4">
                    {([100, 500, 1000] as const).map((limit) => (
                      <label key={limit} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="exportLimit"
                          checked={exportLimit === limit}
                          onChange={() => setExportLimit(limit)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm">{limit.toLocaleString()}건</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">대상:</span> {logsTab === 'member' ? '회원' : '파트너'} 포인트 로그
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">필터:</span>{' '}
                    {logsTypeFilter === 'all' ? '전체' : logsTypeFilter === 'earn' ? '적립' : '사용'}
                    {logsSearch && ` / 검색어: "${logsSearch}"`}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setIsExportModalOpen(false)}
                    disabled={isExporting}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleExportExcel}
                    disabled={isExporting || !exportStartDate || !exportEndDate}
                  >
                    {isExporting ? '내보내는 중...' : '내보내기'}
                  </Button>
                </div>
              </div>
            </Modal>
          </div>
        )}

        {activeTab === 'partner-revenue' && (
          <div className="space-y-6">
            <Typography variant="h4">파트너 전체 수익</Typography>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden max-w-lg">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <Typography variant="subtitle2" className="font-medium text-gray-700">파트너 선택</Typography>
                <p className="text-xs text-gray-500 mt-0.5">파트너명·회원명·회원코드로 검색 후 선택하세요</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={revenuePartnerSearch}
                    onChange={(e) => setRevenuePartnerSearch(e.target.value)}
                    placeholder="검색..."
                    className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/40 focus:border-[#FE3A8F]/50"
                  />
                  {revenuePartnerSearch && (
                    <button
                      type="button"
                      onClick={() => setRevenuePartnerSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      aria-label="검색어 지우기"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <select
                  value={selectedRevenuePartnerId ?? ''}
                  onChange={(e) => setSelectedRevenuePartnerId(e.target.value || null)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/40 focus:border-[#FE3A8F]/50 cursor-pointer"
                >
                    <option value="">선택하세요</option>
                    {(() => {
                      const filtered = revenuePartnersList.filter((p) => {
                        if (!revenuePartnerSearch.trim()) return true
                        const q = revenuePartnerSearch.trim().toLowerCase()
                        const name = (p.partner_name || p.member?.name || '').toLowerCase()
                        const code = (p.member?.member_code || '').toLowerCase()
                        return name.includes(q) || code.includes(q)
                      })
                      const selected = selectedRevenuePartnerId ? revenuePartnersList.find((p) => p.id === selectedRevenuePartnerId) : null
                      const options = selected && !filtered.some((p) => p.id === selected.id) ? [selected, ...filtered] : filtered
                      return options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.partner_name || p.member?.name || p.member?.member_code || p.id}
                        </option>
                      ))
                    })()}
                </select>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {revenuePartnerSearch.trim() ? (
                      revenuePartnersList.filter((p) => {
                        const q = revenuePartnerSearch.trim().toLowerCase()
                        const name = (p.partner_name || p.member?.name || '').toLowerCase()
                        const code = (p.member?.member_code || '').toLowerCase()
                        return name.includes(q) || code.includes(q)
                      }).length === 0 ? (
                      '검색 결과 없음'
                    ) : (
                      `검색 결과 ${revenuePartnersList.filter((p) => {
                        const q = revenuePartnerSearch.trim().toLowerCase()
                        const name = (p.partner_name || p.member?.name || '').toLowerCase()
                        const code = (p.member?.member_code || '').toLowerCase()
                        return name.includes(q) || code.includes(q)
                      }).length}명`
                    )
                    ) : (
                      `총 ${revenuePartnersList.length}명`
                    )}
                  </span>
                  {selectedRevenuePartnerId && (
                    <span className="text-[#FE3A8F] font-medium">선택됨</span>
                  )}
                </div>
              </div>
            </div>

            {!selectedRevenuePartnerId && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">파트너를 선택하면 퀘스트·멤버십·단건구매 수익 내역을 확인할 수 있습니다.</Typography>
              </div>
            )}

            {selectedRevenuePartnerId && partnerRevenueLoading && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1">로딩 중...</Typography>
              </div>
            )}

            {selectedRevenuePartnerId && !partnerRevenueLoading && partnerRevenueData && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <Typography variant="h6">퀘스트</Typography>
                    <button
                      type="button"
                      onClick={() => setRevenueQuestSort((v) => (v === 'desc' ? 'asc' : 'desc'))}
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      {revenueQuestSort === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                      날짜 {revenueQuestSort === 'desc' ? '내림차순' : '오름차순'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">의뢰일</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">완료일</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">클라이언트</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">건수</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">단가</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">수익(P)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {partnerRevenueData.quest.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">내역 없음</td></tr>
                        ) : (
                          [...partnerRevenueData.quest]
                            .sort((a, b) => {
                              const ta = a.requested_at ? new Date(a.requested_at).getTime() : 0
                              const tb = b.requested_at ? new Date(b.requested_at).getTime() : 0
                              return revenueQuestSort === 'desc' ? tb - ta : ta - tb
                            })
                            .map((r) => (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-600">{r.requested_at ? new Date(r.requested_at).toLocaleDateString('ko-KR') : '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{r.requested_at ? new Date(r.requested_at).toLocaleDateString('ko-KR') : '-'}</td>
                                <td className="px-4 py-2 text-sm">{r.client_name || r.client_code || '-'}</td>
                                <td className="px-4 py-2 text-sm text-right">{r.job_count ?? '-'}</td>
                                <td className="px-4 py-2 text-sm text-right">{(r.coins_per_job ?? 0).toLocaleString()}</td>
                                <td className="px-4 py-2 text-sm text-right font-medium">{(r.total_coins ?? 0).toLocaleString()}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {partnerRevenueData.quest.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t text-right text-sm font-medium">
                      합계: {(partnerRevenueData.totals.quest ?? 0).toLocaleString()}P
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <Typography variant="h6">멤버십</Typography>
                    <button
                      type="button"
                      onClick={() => setRevenueMembershipSort((v) => (v === 'desc' ? 'asc' : 'desc'))}
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      {revenueMembershipSort === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                      날짜 {revenueMembershipSort === 'desc' ? '내림차순' : '오름차순'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">구독자</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">멤버십명</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시작일</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">만료일</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">기간(개월)</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">월 단가</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">금액(P)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {partnerRevenueData.membership.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">내역 없음</td></tr>
                        ) : (
                          [...partnerRevenueData.membership]
                            .sort((a, b) => {
                              const ta = a.started_at ? new Date(a.started_at).getTime() : 0
                              const tb = b.started_at ? new Date(b.started_at).getTime() : 0
                              return revenueMembershipSort === 'desc' ? tb - ta : ta - tb
                            })
                            .map((s) => (
                              <tr key={s.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm">{s.subscriber_name || s.subscriber_code || (s.user_id?.slice(0, 8) ? `${s.user_id.slice(0, 8)}…` : '-')}</td>
                                <td className="px-4 py-2 text-sm">{s.membership_name || '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{s.started_at ? new Date(s.started_at).toLocaleDateString('ko-KR') : '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{s.expired_at ? new Date(s.expired_at).toLocaleDateString('ko-KR') : '-'}</td>
                                <td className="px-4 py-2 text-sm text-right">{s.months}</td>
                                <td className="px-4 py-2 text-sm text-right">{s.price_per_month.toLocaleString()}</td>
                                <td className="px-4 py-2 text-sm text-right font-medium">{s.total_amount.toLocaleString()}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {partnerRevenueData.membership.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t text-right text-sm font-medium">
                      합계: {(partnerRevenueData.totals.membership ?? 0).toLocaleString()}P
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <Typography variant="h6">단건구매</Typography>
                    <button
                      type="button"
                      onClick={() => setRevenuePostUnlocksSort((v) => (v === 'desc' ? 'asc' : 'desc'))}
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      {revenuePostUnlocksSort === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                      날짜 {revenuePostUnlocksSort === 'desc' ? '내림차순' : '오름차순'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">구매자</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">게시글</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">구매일</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">포인트(P)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {partnerRevenueData.postUnlocks.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">내역 없음</td></tr>
                        ) : (
                          [...partnerRevenueData.postUnlocks]
                            .sort((a, b) => {
                              const ta = a.purchased_at ? new Date(a.purchased_at).getTime() : 0
                              const tb = b.purchased_at ? new Date(b.purchased_at).getTime() : 0
                              return revenuePostUnlocksSort === 'desc' ? tb - ta : ta - tb
                            })
                            .map((u) => (
                              <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-600">{u.user_id.slice(0, 8)}…</td>
                                <td className="px-4 py-2 text-sm max-w-xs truncate">{u.post_title || u.post_id}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{u.purchased_at ? new Date(u.purchased_at).toLocaleString('ko-KR') : '-'}</td>
                                <td className="px-4 py-2 text-sm text-right font-medium">{u.point_price.toLocaleString()}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {partnerRevenueData.postUnlocks.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t text-right text-sm font-medium">
                      합계: {(partnerRevenueData.totals.postUnlocks ?? 0).toLocaleString()}P
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <Typography variant="h6">후원 (채팅 후원)</Typography>
                    <button
                      type="button"
                      onClick={() => setRevenueDonationsSort((v) => (v === 'desc' ? 'asc' : 'desc'))}
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      {revenueDonationsSort === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                      날짜 {revenueDonationsSort === 'desc' ? '내림차순' : '오름차순'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">일시</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">후원자</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">설명</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">금액(P)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(partnerRevenueData.donations ?? []).length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">내역 없음</td></tr>
                        ) : (
                          [...(partnerRevenueData.donations ?? [])]
                            .sort((a, b) => {
                              const ta = a.created_at ? new Date(a.created_at).getTime() : 0
                              const tb = b.created_at ? new Date(b.created_at).getTime() : 0
                              return revenueDonationsSort === 'desc' ? tb - ta : ta - tb
                            })
                            .map((d) => (
                              <tr key={d.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-600">{d.created_at ? new Date(d.created_at).toLocaleString('ko-KR') : '-'}</td>
                                <td className="px-4 py-2 text-sm">{d.donor_name || d.donor_code || d.donor_id?.slice(0, 8) || '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-600 max-w-xs truncate">{d.description || '-'}</td>
                                <td className="px-4 py-2 text-sm text-right font-medium">{d.amount.toLocaleString()}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {(partnerRevenueData.donations ?? []).length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t text-right text-sm font-medium">
                      합계: {(partnerRevenueData.totals.donations ?? 0).toLocaleString()}P
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border flex justify-end">
                  <p className="font-bold text-lg text-[#FE3A8F]">총계: {(partnerRevenueData.totals.total ?? 0).toLocaleString()}P</p>
                </div>
              </div>
            )}

            {selectedRevenuePartnerId && !partnerRevenueLoading && !partnerRevenueData && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">데이터를 불러오지 못했습니다.</Typography>
              </div>
            )}
          </div>
        )}

        {activeTab === 'banners' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Typography variant="h4">배너 관리</Typography>
              <Button variant="primary" onClick={openCreateModal}>
                새 배너 추가
              </Button>
            </div>

            {bannersLoading ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1">로딩 중...</Typography>
              </div>
            ) : banners.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  등록된 배너가 없습니다.
                </Typography>
              </div>
            ) : (
              <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
                {banners.map((banner) => (
                  <div
                    key={banner.id}
                    className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-4">
                      {/* 헤더 영역 */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <Typography variant="h5" className="mb-2 truncate">
                            {banner.title}
                          </Typography>
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`px-2 py-1 text-xs rounded-full font-medium ${
                                banner.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {banner.is_active ? '활성' : '비활성'}
                            </span>
                            <span className="px-2 py-1 text-xs rounded-full font-medium bg-blue-100 text-blue-800">
                              {banner.display_location === 'main'
                                ? '메인 페이지'
                                : '파트너 대시보드'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 배너 이미지 */}
                      {banner.background_image && (
                        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={banner.background_image}
                            alt={banner.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {/* 설명 */}
                      {banner.description && (
                        <Typography
                          variant="body2"
                          color="text-secondary"
                          className="line-clamp-2"
                        >
                          {banner.description}
                        </Typography>
                      )}

                      {/* 날짜 정보 */}
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>
                          📅 생성일:{' '}
                          {new Date(banner.created_at).toLocaleDateString(
                            'ko-KR',
                          )}
                        </div>
                        {banner.start_at && (
                          <div>
                            🚀 시작:{' '}
                            {new Date(banner.start_at).toLocaleString('ko-KR')}
                          </div>
                        )}
                        {banner.end_at && (
                          <div>
                            🏁 종료:{' '}
                            {new Date(banner.end_at).toLocaleString('ko-KR')}
                          </div>
                        )}
                        {banner.link_url && (
                          <div className="truncate">
                            🔗 링크: {banner.link_url}
                          </div>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(banner)}
                          className="flex-1"
                        >
                          편집
                        </Button>
                        <Button
                          variant={banner.is_active ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() =>
                            handleToggleStatus(banner.id, banner.is_active)
                          }
                          className="flex-1"
                        >
                          {banner.is_active ? '비활성화' : '활성화'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteBanner(banner.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </Grid>
            )}
          </div>
        )}

        {/* 공지사항 관리 */}
        {activeTab === 'notices' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Typography variant="h4">공지사항 관리</Typography>
              <div className="flex items-center gap-2">
                {selectedNoticeIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteSelectedNotices}
                    className="text-red-600 hover:bg-red-100 border-red-300"
                  >
                    {selectedNoticeIds.size}개 삭제
                  </Button>
                )}
                <Button variant="primary" onClick={() => openNoticeModal()}>
                  새 공지
                </Button>
              </div>
            </div>

            {isLoadingNotices ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1">로딩 중...</Typography>
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
                <Typography variant="body1" color="text-secondary">
                  등록된 공지사항이 없습니다.
                </Typography>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-10 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedNoticeIds.size === notices.length && notices.length > 0}
                          onChange={handleToggleAllNotices}
                          className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                        />
                      </th>
                      <th className="w-8 px-1 py-2 text-center text-xs font-medium text-gray-500">
                        
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">
                        제목
                      </th>
                      <th className="w-20 px-1 py-2 text-center text-xs font-medium text-gray-500">
                        작성일
                      </th>
                      <th className="w-8 px-1 py-2 text-center">
                        
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {notices.map((notice) => (
                      <tr 
                        key={notice.id} 
                        className={`hover:bg-gray-50 cursor-pointer ${selectedNoticeIds.has(notice.id) ? 'bg-[#FE3A8F]/5' : ''}`}
                        onClick={() => openNoticeModal(notice, false)}
                      >
                        <td className="w-10 px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedNoticeIds.has(notice.id)}
                            onChange={() => handleToggleNoticeSelection(notice.id)}
                            className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                          />
                        </td>
                        <td className="w-8 px-1 py-3 text-center">
                          {notice.is_pinned && (
                            <span className="text-[#FE3A8F] text-sm">📌</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${NOTICE_CATEGORY_CONFIG[notice.category]?.bgColor || 'bg-gray-100'} ${NOTICE_CATEGORY_CONFIG[notice.category]?.color || 'text-gray-700'}`}>
                              {NOTICE_CATEGORY_CONFIG[notice.category]?.label || notice.category}
                            </span>
                            <span className="font-medium text-sm text-[#110f1a] truncate">
                              {notice.title}
                            </span>
                          </div>
                        </td>
                        <td className="w-20 px-1 py-3 text-center text-xs text-gray-500">
                          {new Date(notice.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                        </td>
                        <td className="w-8 px-1 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openNoticeModal(notice)}
                            className="p-1 rounded text-gray-400 hover:text-[#FE3A8F] hover:bg-gray-100 transition-colors"
                            title="수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 금지어 관리 */}
        {activeTab === 'banned-words' && <BannedWordsManagement />}

        {/* 탐색 관리 */}
        {activeTab === 'explorer' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Typography variant="h4">탐색 카테고리 관리</Typography>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingExplorerCategory(null)
                  setExplorerCategoryForm({ name: '', hashtag: '', is_pinned: false, partner_category_id: 1 })
                  setIsExplorerCategoryModalOpen(true)
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                카테고리 추가
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 좌측: 카테고리 목록 */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <Typography variant="h5" className="mb-4">카테고리 목록</Typography>
                
                {isExplorerLoading ? (
                  <div className="text-center py-8 text-gray-500">로딩 중...</div>
                ) : explorerCategories.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">등록된 카테고리가 없습니다.</div>
                ) : (
                  <div className="space-y-4">
                    {/* Pinned 카테고리 */}
                    {explorerCategories.filter(c => c.is_pinned).length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Pin className="w-4 h-4 text-[#FE3A8F]" />
                          <span className="text-sm font-medium text-gray-600">고정됨</span>
                        </div>
                        <DndContext
                          sensors={dndSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleExplorerCategoryDragEnd(e, true)}
                        >
                          <SortableContext
                            items={explorerCategories.filter(c => c.is_pinned).map(c => c.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {explorerCategories
                                .filter(c => c.is_pinned)
                                .sort((a, b) => a.sort_order - b.sort_order)
                                .map(category => (
                                  <SortableExplorerCategoryItem
                                    key={category.id}
                                    category={category}
                                    isSelected={selectedExplorerCategory?.id === category.id}
                                    onSelect={() => setSelectedExplorerCategory(category)}
                                    onEdit={() => {
                                      setEditingExplorerCategory(category)
                                      setExplorerCategoryForm({
                                        name: category.name,
                                        hashtag: category.hashtag || '',
                                        is_pinned: category.is_pinned,
                                        partner_category_id: category.partner_category_id ?? 1,
                                      })
                                      setIsExplorerCategoryModalOpen(true)
                                    }}
                                    onDelete={() => handleDeleteExplorerCategory(category.id)}
                                  />
                                ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}

                    {/* 일반 카테고리 */}
                    {explorerCategories.filter(c => !c.is_pinned).length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2 mt-4">
                          <span className="text-sm font-medium text-gray-600">일반</span>
                        </div>
                        <DndContext
                          sensors={dndSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleExplorerCategoryDragEnd(e, false)}
                        >
                          <SortableContext
                            items={explorerCategories.filter(c => !c.is_pinned).map(c => c.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {explorerCategories
                                .filter(c => !c.is_pinned)
                                .sort((a, b) => a.sort_order - b.sort_order)
                                .map(category => (
                                  <SortableExplorerCategoryItem
                                    key={category.id}
                                    category={category}
                                    isSelected={selectedExplorerCategory?.id === category.id}
                                    onSelect={() => setSelectedExplorerCategory(category)}
                                    onEdit={() => {
                                      setEditingExplorerCategory(category)
                                      setExplorerCategoryForm({
                                        name: category.name,
                                        hashtag: category.hashtag || '',
                                        is_pinned: category.is_pinned,
                                        partner_category_id: category.partner_category_id ?? 1,
                                      })
                                      setIsExplorerCategoryModalOpen(true)
                                    }}
                                    onDelete={() => handleDeleteExplorerCategory(category.id)}
                                  />
                                ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 우측: 파트너 관리 */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-center justify-between mb-4">
                  <Typography variant="h5">
                    {selectedExplorerCategory ? `"${selectedExplorerCategory.name}" 파트너` : '파트너 관리'}
                  </Typography>
                  {selectedExplorerCategory && !selectedExplorerCategory.section_type && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPartnerForExplorer(null)
                        setPartnerSearchQuery('')
                        setExplorerPartnerBannerUrl('')
                        setIsExplorerPartnerModalOpen(true)
                        handleSearchPartnersForExplorer('')
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      파트너 추가
                    </Button>
                  )}
                </div>

                {!selectedExplorerCategory ? (
                  <div className="text-center py-8 text-gray-500">
                    좌측에서 카테고리를 선택해주세요.
                  </div>
                ) : selectedExplorerCategory.section_type ? (
                  <div className="text-center py-8 text-gray-500">
                    <span className="inline-block px-2 py-1 mb-2 rounded bg-purple-100 text-purple-600 text-xs font-semibold">
                      자동 섹션: {selectedExplorerCategory.section_type}
                    </span>
                    <p className="text-sm">이 섹션은 알고리즘에 의해 자동으로 파트너가 표시됩니다.<br />순서만 변경 가능합니다.</p>
                  </div>
                ) : explorerCategoryPartners.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    할당된 파트너가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {explorerCategoryPartners.map(cp => (
                      <div
                        key={cp.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                          {cp.partner?.member?.profile_image ? (
                            <img
                              src={cp.partner.member.profile_image}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                              {cp.partner?.partner_name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {cp.partner?.partner_name || cp.partner?.member?.name || '알 수 없음'}
                          </div>
                          <div className="text-xs text-gray-500">
                            @{cp.partner?.member?.member_code || ''}
                          </div>
                        </div>
                        {cp.banners && (
                          <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0">
                            <img src={cp.banners} alt="배너" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <button
                          onClick={() => handleRemovePartnerFromCategory(cp.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 카테고리 생성/수정 모달 */}
            <Modal
              isOpen={isExplorerCategoryModalOpen}
              onClose={() => {
                setIsExplorerCategoryModalOpen(false)
                setEditingExplorerCategory(null)
                setExplorerCategoryForm({ name: '', hashtag: '', is_pinned: false, partner_category_id: 1 })
              }}
              title={editingExplorerCategory ? '카테고리 수정' : '카테고리 추가'}
              size="sm"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    카테고리 이름 *
                  </label>
                  <input
                    type="text"
                    value={explorerCategoryForm.name}
                    onChange={(e) => setExplorerCategoryForm({ ...explorerCategoryForm, name: e.target.value })}
                    placeholder="예: 신규 파트너"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    해시태그
                  </label>
                  <input
                    type="text"
                    value={explorerCategoryForm.hashtag}
                    onChange={(e) => setExplorerCategoryForm({ ...explorerCategoryForm, hashtag: e.target.value })}
                    placeholder="예: #추천"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    파트너 카테고리
                  </label>
                  <select
                    value={explorerCategoryForm.partner_category_id ?? ''}
                    onChange={(e) => setExplorerCategoryForm({ ...explorerCategoryForm, partner_category_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]"
                  >
                    {PARTNER_CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    이 탐색 카테고리가 표시될 파트너 카테고리를 선택하세요.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_pinned"
                    checked={explorerCategoryForm.is_pinned}
                    onChange={(e) => setExplorerCategoryForm({ ...explorerCategoryForm, is_pinned: e.target.checked })}
                    className="w-4 h-4 text-[#FE3A8F] focus:ring-[#FE3A8F] rounded"
                  />
                  <label htmlFor="is_pinned" className="text-sm text-gray-700">
                    상단 고정 (스와이퍼로 표시)
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsExplorerCategoryModalOpen(false)
                      setEditingExplorerCategory(null)
                    }}
                  >
                    취소
                  </Button>
                  <Button variant="primary" onClick={handleSaveExplorerCategory}>
                    {editingExplorerCategory ? '수정' : '추가'}
                  </Button>
                </div>
              </div>
            </Modal>

            {/* 파트너 추가 모달 */}
            <Modal
              isOpen={isExplorerPartnerModalOpen}
              onClose={() => {
                setIsExplorerPartnerModalOpen(false)
                setSelectedPartnerForExplorer(null)
                setPartnerSearchQuery('')
                setPartnerSearchResults([])
                setExplorerPartnerBannerUrl('')
              }}
              title="파트너 추가"
              size="md"
            >
              <div className="space-y-4">
                {/* 파트너 검색 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    파트너 검색
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={partnerSearchQuery}
                      onChange={(e) => {
                        setPartnerSearchQuery(e.target.value)
                        handleSearchPartnersForExplorer(e.target.value)
                      }}
                      placeholder="파트너 이름 또는 회원 코드로 검색"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]"
                    />
                  </div>
                </div>

                {/* 파트너 리스트 (검색 결과 또는 전체) */}
                {partnerSearchResults.length > 0 && !selectedPartnerForExplorer && (
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    {partnerSearchResults.map(partner => {
                      const profileImg = resolveImageUrl(partner.profile_image)
                      return (
                        <button
                          key={partner.id}
                          onClick={() => setSelectedPartnerForExplorer(partner)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                            {profileImg ? (
                              <img src={profileImg} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-medium">
                                {partner.partner_name?.[0] || '?'}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{partner.partner_name || partner.name}</div>
                            <div className="text-xs text-gray-500">@{partner.member_code}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* 선택된 파트너 */}
                {selectedPartnerForExplorer && (
                  <div className="p-3 bg-[#FE3A8F]/10 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                          {resolveImageUrl(selectedPartnerForExplorer.profile_image) ? (
                            <img src={resolveImageUrl(selectedPartnerForExplorer.profile_image)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              {selectedPartnerForExplorer.partner_name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{selectedPartnerForExplorer.partner_name}</div>
                          <div className="text-sm text-gray-500">@{selectedPartnerForExplorer.member_code}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPartnerForExplorer(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 배너 이미지 업로드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    배너 이미지 (선택)
                  </label>
                  <ImageUpload
                    bucket="explore_partner_banner"
                    currentImageUrl={explorerPartnerBannerUrl || undefined}
                    onImageUploaded={(url) => setExplorerPartnerBannerUrl(url)}
                    onImageDeleted={() => setExplorerPartnerBannerUrl('')}
                    maxWidth={1200}
                    maxHeight={600}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    카테고리에 파트너가 1명일 때 표시되는 배너 이미지입니다.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsExplorerPartnerModalOpen(false)
                      setSelectedPartnerForExplorer(null)
                    }}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleAddPartnerToCategory}
                    disabled={!selectedPartnerForExplorer}
                  >
                    추가
                  </Button>
                </div>
              </div>
            </Modal>
          </div>
        )}

        {/* 스토어 관리 */}
        {activeTab === 'store' && (
          <div className="space-y-8">
            {/* 스토어 배너 관리 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Typography variant="h4">스토어 배너 관리</Typography>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingStoreBanner(null)
                    setStoreBannerForm({ banner: '' })
                    setIsStoreBannerModalOpen(true)
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  배너 추가
                </Button>
              </div>

              {isStoreBannerLoading ? (
                <div className="text-center py-8 text-gray-500">로딩 중...</div>
              ) : storeBanners.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                  등록된 배너가 없습니다.
                </div>
              ) : (
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStoreBannerDragEnd}
                >
                  <SortableContext
                    items={storeBanners.map(b => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {storeBanners.sort((a, b) => a.sort_order - b.sort_order).map(banner => (
                        <SortableStoreBannerItem
                          key={banner.id}
                          banner={banner}
                          onEdit={() => {
                            setEditingStoreBanner(banner)
                            setStoreBannerForm({ banner: banner.banner })
                            setIsStoreBannerModalOpen(true)
                          }}
                          onDelete={() => handleDeleteStoreBanner(banner.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* 추천 파트너 스토어 관리 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Typography variant="h4">추천 파트너 스토어</Typography>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSelectedStorePartner(null)
                    setStorePartnerSearchQuery('')
                    setStorePartnerSearchResults([])
                    handleSearchStorePartners('')
                    setIsStoreRecommendedModalOpen(true)
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  파트너 추가
                </Button>
              </div>

              {isStoreRecommendedLoading ? (
                <div className="text-center py-8 text-gray-500">로딩 중...</div>
              ) : storeRecommended.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                  등록된 추천 파트너가 없습니다.
                </div>
              ) : (
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStoreRecommendedDragEnd}
                >
                  <SortableContext
                    items={storeRecommended.map(r => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {storeRecommended.sort((a, b) => a.sort_order - b.sort_order).map(rec => (
                        <SortableStoreRecommendedItem
                          key={rec.id}
                          item={rec}
                          onDelete={() => handleDeleteStoreRecommended(rec.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* 스토어 배너 모달 */}
            <Modal
              isOpen={isStoreBannerModalOpen}
              onClose={() => {
                setIsStoreBannerModalOpen(false)
                setEditingStoreBanner(null)
                setStoreBannerForm({ banner: '' })
              }}
              title={editingStoreBanner ? '배너 수정' : '배너 추가'}
              size="md"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    배너 이미지 *
                  </label>
                  <ImageUpload
                    bucket="store_banners"
                    currentImageUrl={storeBannerForm.banner || undefined}
                    onImageUploaded={(url) => setStoreBannerForm({ banner: url })}
                    onImageDeleted={() => setStoreBannerForm({ banner: '' })}
                    maxWidth={1200}
                    maxHeight={400}
                    userId="admin"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    store_banners 버킷이 public으로 설정되어 있어야 합니다.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsStoreBannerModalOpen(false)
                      setEditingStoreBanner(null)
                    }}
                  >
                    취소
                  </Button>
                  <Button variant="primary" onClick={handleSaveStoreBanner}>
                    {editingStoreBanner ? '수정' : '추가'}
                  </Button>
                </div>
              </div>
            </Modal>

            {/* 추천 파트너 추가 모달 */}
            <Modal
              isOpen={isStoreRecommendedModalOpen}
              onClose={() => {
                setIsStoreRecommendedModalOpen(false)
                setSelectedStorePartner(null)
                setStorePartnerSearchQuery('')
                setStorePartnerSearchResults([])
              }}
              title="추천 파트너 추가"
              size="md"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    파트너 검색
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={storePartnerSearchQuery}
                      onChange={(e) => setStorePartnerSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchStorePartners()}
                      placeholder="파트너 이름 또는 멤버 코드"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button variant="outline" onClick={() => handleSearchStorePartners()}>
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {storePartnerSearchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                    {storePartnerSearchResults.map(partner => (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => setSelectedStorePartner(partner)}
                        className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors ${
                          selectedStorePartner?.id === partner.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                          {partner.profile_image ? (
                            <img src={partner.profile_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                              {partner.partner_name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium text-sm">{partner.partner_name || partner.name}</div>
                          <div className="text-xs text-gray-500">@{partner.member_code}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedStorePartner && (
                  <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                      {selectedStorePartner.profile_image ? (
                        <img src={selectedStorePartner.profile_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                          {selectedStorePartner.partner_name?.[0] || '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{selectedStorePartner.partner_name || selectedStorePartner.name}</div>
                      <div className="text-xs text-gray-500">@{selectedStorePartner.member_code}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStorePartner(null)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsStoreRecommendedModalOpen(false)
                      setSelectedStorePartner(null)
                    }}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleAddStoreRecommended}
                    disabled={!selectedStorePartner}
                  >
                    추가
                  </Button>
                </div>
              </div>
            </Modal>
          </div>
        )}

        {/* 룰렛 관리 */}
        {activeTab === 'roulette' && <AdminRouletteManagement />}
      </div>

      {/* 공지사항 모달 (보기/수정 통합) */}
      <Modal
        isOpen={isNoticeModalOpen}
        onClose={() => {
          setIsNoticeModalOpen(false)
          setSelectedNotice(null)
          setNoticeForm({ title: '', content: '', category: 'general', is_pinned: false, image_url: '', image_file: null, start_date: '', end_date: '' })
          setIsNoticeEditMode(false)
        }}
        title={!selectedNotice ? '공지사항 작성' : isNoticeEditMode ? '공지사항 수정' : '공지사항'}
        size="lg"
      >
        {/* 보기 모드 */}
        {selectedNotice && !isNoticeEditMode ? (
          <div className="space-y-4">
            {/* 카테고리 뱃지 & 고정 */}
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${NOTICE_CATEGORY_CONFIG[selectedNotice.category]?.bgColor || 'bg-gray-100'} ${NOTICE_CATEGORY_CONFIG[selectedNotice.category]?.color || 'text-gray-700'}`}>
                {NOTICE_CATEGORY_CONFIG[selectedNotice.category]?.label || selectedNotice.category}
              </span>
              {selectedNotice.is_pinned && (
                <span className="text-sm text-[#FE3A8F]">📌 고정됨</span>
              )}
            </div>

            {/* 제목 */}
            <h2 className="text-lg font-bold text-[#110f1a]">
              {selectedNotice.title}
            </h2>

            {/* 날짜 및 조회수 */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{new Date(selectedNotice.created_at).toLocaleDateString('ko-KR')}</span>
              <span>•</span>
              <span>조회수 {selectedNotice.view_count?.toLocaleString() || 0}</span>
            </div>

            {/* 이벤트 배너 이미지 */}
            {selectedNotice.category === 'event' && (selectedNotice as any).image_url && (
              <div className="rounded-lg overflow-hidden">
                <img
                  src={(selectedNotice as any).image_url}
                  alt="이벤트 배너"
                  className="w-full object-cover"
                />
              </div>
            )}

            {/* 내용 (HTML 렌더링) */}
            <div 
              className="text-sm text-gray-700 leading-relaxed min-h-[150px] prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedNotice.content }}
            />

            {/* 버튼 */}
            <div className="flex flex-col sm:flex-row sm:justify-between gap-2 pt-4">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    handleToggleNoticePin(selectedNotice.id, !selectedNotice.is_pinned)
                    setSelectedNotice(prev => prev ? { ...prev, is_pinned: !prev.is_pinned } : null)
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  {selectedNotice.is_pinned ? '📌 해제' : '📌 고정'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteNotice(selectedNotice.id)
                    setIsNoticeModalOpen(false)
                    setSelectedNotice(null)
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                >
                  삭제
                </button>
              </div>
              <div className="flex gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsNoticeModalOpen(false)
                    setSelectedNotice(null)
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsNoticeEditMode(true)
                    // 에디터에 내용 설정
                    setTimeout(() => {
                      if (noticeEditorRef.current && selectedNotice) {
                        noticeEditorRef.current.innerHTML = selectedNotice.content || ''
                      }
                    }, 100)
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#FE3A8F] text-white hover:bg-[#FE3A8F]/90 transition-colors whitespace-nowrap"
                >
                  수정
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 수정/작성 모드 */
          <div className="space-y-4">
            {/* 제목 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
              <input
                type="text"
                value={noticeForm.title}
                onChange={(e) => setNoticeForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="공지 제목을 입력하세요"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] focus:border-transparent"
              />
            </div>

            {/* 카테고리 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(NOTICE_CATEGORY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNoticeForm(prev => ({ ...prev, category: key as NoticeItem['category'] }))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      noticeForm.category === key
                        ? 'bg-[#110f1a] text-white'
                        : `${config.bgColor} ${config.color}`
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 이벤트 배너 이미지 (카테고리가 event일 때만) */}
            {noticeForm.category === 'event' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이벤트 배너 이미지</label>
                {(noticeForm.image_file || noticeForm.image_url) ? (
                  <div className="relative inline-block w-full">
                    <img
                      src={noticeForm.image_file ? URL.createObjectURL(noticeForm.image_file) : noticeForm.image_url}
                      alt="이벤트 배너"
                      className="w-full max-h-48 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setNoticeForm(prev => ({ ...prev, image_url: '', image_file: null }))}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors text-sm"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0]
                        if (file) {
                          setNoticeForm(prev => ({ ...prev, image_file: file }))
                        }
                      }
                      input.click()
                    }}
                  >
                    <ImageIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">클릭하여 이벤트 배너 이미지 업로드</p>
                    <p className="text-xs text-gray-400 mt-1">권장 크기: 900 x 1200px (세로형, 3:4 비율)</p>
                  </div>
                )}
              </div>
            )}

            {/* 내용 (WYSIWYG 에디터) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
              {/* 에디터 툴바 */}
              <div 
                className="flex flex-wrap gap-1 mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
                onMouseDown={(e) => {
                  // 툴바 클릭 시 선택 영역 저장
                  saveSelection()
                  e.preventDefault()
                }}
              >
                <button
                  type="button"
                  onClick={() => execEditorCommand('bold')}
                  className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                  title="굵게"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => execEditorCommand('italic')}
                  className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                  title="기울임"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => execEditorCommand('insertUnorderedList')}
                  className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                  title="목록"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = prompt('링크 URL을 입력하세요:')
                    if (url) {
                      noticeEditorRef.current?.focus()
                      restoreSelection()
                      
                      const selection = window.getSelection()
                      if (selection && selection.toString().trim()) {
                        // 선택된 텍스트가 있으면 링크로 변환
                        document.execCommand('createLink', false, url)
                      } else {
                        // 선택된 텍스트가 없으면 링크 텍스트 삽입
                        const linkText = prompt('링크 텍스트를 입력하세요:', url) || url
                        const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`
                        document.execCommand('insertHTML', false, linkHtml)
                      }
                    }
                  }}
                  className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                  title="링크 삽입"
                >
                  <LinkIcon className="w-4 h-4" />
                </button>

                {/* 구분선 */}
                <div className="w-px h-6 bg-gray-300 mx-1" />

                {/* 글씨 크기 */}
                <select
                  onMouseDown={(e) => {
                    saveSelection()
                    e.stopPropagation()
                  }}
                  onChange={(e) => {
                    if (e.target.value) {
                      execEditorCommand('fontSize', e.target.value)
                    }
                    e.target.value = ''
                  }}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 transition-colors bg-white"
                  defaultValue=""
                >
                  <option value="" disabled>크기</option>
                  <option value="1">작게</option>
                  <option value="3">보통</option>
                  <option value="5">크게</option>
                  <option value="7">아주 크게</option>
                </select>

                {/* 텍스트 색상 */}
                <div className="relative">
                  <input
                    type="color"
                    defaultValue="#000000"
                    onMouseDown={() => saveSelection()}
                    onInput={(e) => {
                      const color = (e.target as HTMLInputElement).value
                      execEditorCommand('foreColor', color)
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-8 h-8"
                    title="텍스트 색상"
                  />
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors pointer-events-none"
                    title="텍스트 색상"
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                </div>

                {/* 배경색 */}
                <div className="relative">
                  <input
                    type="color"
                    defaultValue="#FFFF00"
                    onMouseDown={() => saveSelection()}
                    onInput={(e) => {
                      const color = (e.target as HTMLInputElement).value
                      execEditorCommand('hiliteColor', color)
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-8 h-8"
                    title="배경색"
                  />
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors pointer-events-none"
                    title="배경색"
                  >
                    <Highlighter className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* WYSIWYG 에디터 영역 */}
              <div
                ref={noticeEditorRef}
                id="notice-content-editor"
                contentEditable
                onBlur={(e) => {
                  const target = e.currentTarget as HTMLDivElement
                  setNoticeForm(prev => ({ ...prev, content: target.innerHTML }))
                }}
                className="w-full min-h-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] focus:border-transparent overflow-auto prose prose-sm max-w-none"
                style={{ maxHeight: '400px' }}
                suppressContentEditableWarning
              />
            </div>

            {/* 이벤트 카테고리일 때만 날짜 설정 */}
            {noticeForm.category === 'event' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 시작일 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이벤트 시작일</label>
                  <DatePicker
                    value={noticeForm.start_date}
                    onChange={(date) => setNoticeForm(prev => ({ ...prev, start_date: date }))}
                    placeholder="시작일 선택"
                  />
                </div>

                {/* 종료일 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이벤트 종료일</label>
                  <DatePicker
                    value={noticeForm.end_date}
                    onChange={(date) => setNoticeForm(prev => ({ ...prev, end_date: date }))}
                    placeholder="종료일 선택"
                  />
                </div>
              </div>
            )}

            {/* 버튼 */}
            <div className="flex flex-col sm:flex-row sm:justify-between gap-2 pt-4">
              {/* 핀/삭제 버튼 (수정 모드에서만) */}
              <div className="flex gap-1.5">
                {selectedNotice && (
                  <>
                    <button
                      type="button"
                      onClick={() => setNoticeForm(prev => ({ ...prev, is_pinned: !prev.is_pinned }))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
                    >
                      {noticeForm.is_pinned ? '📌 해제' : '📌 고정'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteNotice(selectedNotice.id)
                        setIsNoticeModalOpen(false)
                        setSelectedNotice(null)
                        setNoticeForm({ title: '', content: '', category: 'general', is_pinned: false, image_url: '', image_file: null, start_date: '', end_date: '' })
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
              {/* 취소/저장 버튼 */}
              <div className="flex gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedNotice) {
                      setIsNoticeEditMode(false)
                    } else {
                      setIsNoticeModalOpen(false)
                      setSelectedNotice(null)
                      setNoticeForm({ title: '', content: '', category: 'general', is_pinned: false, image_url: '', image_file: null, start_date: '', end_date: '' })
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  {selectedNotice ? '취소' : '닫기'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotice}
                  disabled={isSubmittingNotice || !noticeForm.title.trim() || !noticeForm.content.trim()}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#FE3A8F] text-white hover:bg-[#FE3A8F]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmittingNotice ? '저장 중...' : selectedNotice ? '수정하기' : '작성하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 파트너 신청 상세보기 모달 */}
      <Modal
        isOpen={isPartnerModalOpen}
        onClose={() => {
          setIsPartnerModalOpen(false)
          setSelectedPartner(null)
          setPartnerDetailTabIndex(0)
          setIsEditingDistributionRate(false)
          setIsEditingTax(false)
        }}
        title=""
        size="lg"
      >
        {isLoadingPartnerDetail && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-[#FE3A8F] border-t-transparent rounded-full animate-spin"></div>
              <Typography variant="body2" className="text-gray-500">
                로딩 중...
              </Typography>
            </div>
          </div>
        )}
        {selectedPartner && !isLoadingPartnerDetail && (
          <div className="-m-6">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-[#FE3A8F] to-[#FF6B9D] px-6 py-5">
              <div className="flex items-center gap-4">
                {selectedPartner.member?.profile_image ? (
                  <img
                    src={selectedPartner.member.profile_image}
                    alt={selectedPartner.partner_name || ''}
                    className="w-14 h-14 rounded-full object-cover border-2 border-white/30"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold border-2 border-white/30">
                    {selectedPartner.partner_name?.charAt(0) || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <Typography variant="h4" className="text-white font-bold">
                    {selectedPartner.partner_name || 'Unknown'}
                  </Typography>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedPartner.partner_status === 'approved' 
                        ? 'bg-white/20 text-white' 
                        : selectedPartner.partner_status === 'pending'
                        ? 'bg-yellow-400/90 text-yellow-900'
                        : 'bg-red-400/90 text-white'
                    }`}>
                      {selectedPartner.partner_status === 'approved' ? '승인됨' : 
                       selectedPartner.partner_status === 'pending' ? '검토 대기중' : '거절됨'}
                    </span>
                    {selectedPartner.partner_applied_at && (
                      <span className="text-white/70 text-xs">
                        {new Date(selectedPartner.partner_applied_at).toLocaleDateString('ko-KR')} 신청
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 탭: 기본 정보 | 면접 정보 */}
            <div className="border-b border-gray-100 px-4">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => {
                    setPartnerDetailTabIndex(0)
                    partnerDetailSwiperRef.current?.slideTo(0)
                  }}
                  className={`flex-1 py-3 text-sm font-medium transition ${
                    partnerDetailTabIndex === 0 ? 'border-b-2 border-[#FE3A8F] text-[#FE3A8F]' : 'text-gray-500'
                  }`}
                >
                  기본 정보
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPartnerDetailTabIndex(1)
                    partnerDetailSwiperRef.current?.slideTo(1)
                  }}
                  className={`flex-1 py-3 text-sm font-medium transition ${
                    partnerDetailTabIndex === 1 ? 'border-b-2 border-[#FE3A8F] text-[#FE3A8F]' : 'text-gray-500'
                  }`}
                >
                  면접 정보
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPartnerDetailTabIndex(2)
                    partnerDetailSwiperRef.current?.slideTo(2)
                  }}
                  className={`flex-1 py-3 text-sm font-medium transition ${
                    partnerDetailTabIndex === 2 ? 'border-b-2 border-[#FE3A8F] text-[#FE3A8F]' : 'text-gray-500'
                  }`}
                >
                  정산 정보
                </button>
              </div>
            </div>

            <Swiper
              modules={[Pagination]}
              className="!overflow-hidden"
              onSwiper={(sw) => { partnerDetailSwiperRef.current = sw }}
              onSlideChange={(sw) => setPartnerDetailTabIndex(sw.activeIndex)}
              allowTouchMove
              resistanceRatio={0}
            >
              <SwiperSlide>
                <div className="p-6 overflow-y-auto max-h-[50vh]">
                  <div className="space-y-4">
                    <div>
                      <Typography variant="caption" className="text-gray-500">파트너명</Typography>
                      <Typography variant="body1" className="font-medium">{selectedPartner.partner_name || '-'}</Typography>
                    </div>
                    <div>
                      <Typography variant="caption" className="text-gray-500">파트너 메시지</Typography>
                      <Typography variant="body1" className="whitespace-pre-wrap">{selectedPartner.partner_message || '-'}</Typography>
                    </div>
                    {selectedPartner.member?.profile_image && (
                      <div>
                        <Typography variant="caption" className="text-gray-500 block mb-1">프로필 이미지</Typography>
                        <img src={selectedPartner.member.profile_image} alt="" className="w-20 h-20 rounded-full object-cover border" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    {Array.isArray(selectedPartner.background_images) && selectedPartner.background_images.length > 0 && (
                      <div>
                        <Typography variant="caption" className="text-gray-500 block mb-1">배경 이미지</Typography>
                        <div className="flex gap-2 flex-wrap">
                          {(selectedPartner.background_images as string[]).slice(0, 5).map((url, i) => (
                            <img key={i} src={typeof url === 'string' ? url : (url as any)?.url} alt="" className="w-16 h-16 rounded-lg object-cover border" referrerPolicy="no-referrer" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </SwiperSlide>
              <SwiperSlide>
                <div className="h-full p-6 overflow-y-auto max-h-[50vh] space-y-3">
                  {(() => {
                    const p = selectedPartner as PartnerWithMember & {
                      referral_source?: string | null
                      interview_sns_type?: string | null
                      interview_contact_id?: string | null
                      referrer_member_code?: string | null
                      interview_gender?: string | null
                      interview_other_platforms?: string | null
                      interview_main_content?: string | null
                      terms_agreed_at?: string | null
                      privacy_agreed_at?: string | null
                    }
                    const refLabels: Record<string, string> = { sns: 'SNS', friend: '지인 추천', search: '검색', ad: '광고', youtube: '유튜브', community: '커뮤니티', other: '기타' }
                    const snsLabels: Record<string, string> = { instagram: '인스타그램', threads: '쓰레드', tiktok: '틱톡', youtube: '유튜브', twitter: '트위터', other: '기타' }
                    const genderLabels: Record<string, string> = { male: '남성', female: '여성', other: '기타', prefer_not_to_say: '비공개' }
                    const platformLabels: Record<string, string> = { youtube: '유튜브', twitch: '트위치', soop: '숲', chzzk: '치지직', liky: '라이키', fantrie: '팬트리', afreeca: '아프리카TV', other: '기타' }
                    const mainLabels: Record<string, string> = { gaming: '게임', variety: '예능/토크', music: '음악', vlog: 'Vlog', asmr: 'ASMR', adult: '19금', other: '기타' }
                    return (
                      <>
                        {p.referral_source && <div><Typography variant="caption" className="text-gray-500">유입 경로</Typography><Typography variant="body1">{refLabels[p.referral_source] ?? p.referral_source}</Typography></div>}
                        {p.interview_sns_type && <div><Typography variant="caption" className="text-gray-500">신원 확인 SNS</Typography><Typography variant="body1">{snsLabels[p.interview_sns_type] ?? p.interview_sns_type}</Typography></div>}
                        {p.interview_contact_id && <div><Typography variant="caption" className="text-gray-500">SNS 계정 ID</Typography><Typography variant="body1">{p.interview_contact_id}</Typography></div>}
                        {p.referrer_member_code && <div><Typography variant="caption" className="text-gray-500">추천인 코드</Typography><Typography variant="body1">{p.referrer_member_code}</Typography></div>}
                        {p.interview_gender && <div><Typography variant="caption" className="text-gray-500">성별</Typography><Typography variant="body1">{genderLabels[p.interview_gender] ?? p.interview_gender}</Typography></div>}
                        {p.interview_other_platforms && <div><Typography variant="caption" className="text-gray-500">다른 플랫폼 활동 이력</Typography><Typography variant="body1">{p.interview_other_platforms.split(',').map(v => platformLabels[v.trim()] ?? v.trim()).join(', ')}</Typography></div>}
                        {p.interview_main_content && <div><Typography variant="caption" className="text-gray-500">주 콘텐츠</Typography><Typography variant="body1">{mainLabels[p.interview_main_content] ?? p.interview_main_content}</Typography></div>}
                        {p.terms_agreed_at && <div><Typography variant="caption" className="text-gray-500">이용약관 동의 시각</Typography><Typography variant="body1">{new Date(p.terms_agreed_at).toLocaleString('ko-KR')}</Typography></div>}
                        {p.privacy_agreed_at && <div><Typography variant="caption" className="text-gray-500">개인정보처리방침 동의 시각</Typography><Typography variant="body1">{new Date(p.privacy_agreed_at).toLocaleString('ko-KR')}</Typography></div>}
                        {!p.referral_source && !p.interview_sns_type && !p.referrer_member_code && !p.interview_gender && !p.interview_main_content && !p.terms_agreed_at && <Typography variant="body2" className="text-gray-500">면접 정보 없음</Typography>}
                      </>
                    )
                  })()}
                </div>
              </SwiperSlide>
              <SwiperSlide>
                <div className="p-6 overflow-y-auto max-h-[50vh] space-y-4">
                  {selectedPartner.partner_business_info ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gray-500 block">실명</span><p className="font-medium">{selectedPartner.partner_business_info.legal_name ?? '-'}</p></div>
                        <div><span className="text-gray-500 block">이메일</span><p className="font-medium">{selectedPartner.partner_business_info.legal_email ?? '-'}</p></div>
                        <div><span className="text-gray-500 block">연락처</span><p className="font-medium">{selectedPartner.partner_business_info.legal_phone ?? '-'}</p></div>
                        <div><span className="text-gray-500 block">은행</span><p className="font-medium">{selectedPartner.partner_business_info.payout_bank_name ?? selectedPartner.partner_business_info.payout_bank_code ?? '-'}</p></div>
                        <div><span className="text-gray-500 block">계좌번호</span><p className="font-medium">{selectedPartner.partner_business_info.payout_account_number ?? '-'}</p></div>
                        <div><span className="text-gray-500 block">예금주</span><p className="font-medium">{selectedPartner.partner_business_info.payout_account_holder ?? '-'}</p></div>
                      </div>
                      {selectedPartner.partner_status === 'approved' && (
                        <div className="pt-4 border-t border-gray-200 space-y-4">
                          <div className="flex items-center justify-between">
                            <Typography variant="subtitle2" className="font-bold text-gray-800">배분율</Typography>
                            {!isEditingDistributionRate && (
                              <button
                                onClick={() => startDistributionRateEdit(
                                  selectedPartner?.partner_business_info?.default_distribution_rate ?? 85,
                                  selectedPartner?.partner_business_info?.collaboration_distribution_rate ?? 85
                                )}
                                className="text-sm text-[#FE3A8F] hover:text-[#FE3A8F]/80 font-medium"
                              >
                                배분율 수정
                              </button>
                            )}
                          </div>
                          {isEditingDistributionRate ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <input type="number" min="0" max="100" value={editingDefaultRate} onChange={(e) => setEditingDefaultRate(Number(e.target.value))} className="w-20 px-2 py-1.5 border rounded-lg text-center text-sm" />
                                <span className="text-sm text-gray-500">스토어 %</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="number" min="0" max="100" value={editingCollabRate} onChange={(e) => setEditingCollabRate(Number(e.target.value))} className="w-20 px-2 py-1.5 border rounded-lg text-center text-sm" />
                                <span className="text-sm text-gray-500">협업 %</span>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={cancelDistributionRateEdit} disabled={isUpdatingDistributionRate}>취소</Button>
                                <button onClick={() => handleDistributionRateUpdate(selectedPartner.id)} disabled={isUpdatingDistributionRate} className="px-3 py-1.5 bg-[#FE3A8F] text-white text-sm rounded-lg disabled:opacity-50">저장</button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="text-gray-500">스토어 배분</span><p className="font-semibold">{selectedPartner?.partner_business_info?.default_distribution_rate ?? 85}%</p></div>
                              <div><span className="text-gray-500">협업 배분</span><p className="font-semibold">{selectedPartner?.partner_business_info?.collaboration_distribution_rate ?? 85}%</p></div>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <span className="text-gray-500 text-sm">세금율</span>
                            {isEditingTax ? (
                              <div className="flex items-center gap-2">
                                <input type="number" min="0" max="100" value={editingTax || 0} onChange={(e) => setEditingTax(Number(e.target.value))} className="w-16 px-2 py-1 border rounded text-center text-sm" />
                                <Button variant="outline" size="sm" onClick={cancelTaxEdit}>취소</Button>
                                <button onClick={() => handleTaxUpdate(selectedPartner.id, editingTax || 0)} className="px-2 py-1 bg-[#FE3A8F] text-white text-sm rounded">저장</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{selectedPartner?.partner_business_info?.tax ?? 0}%</span>
                                <button onClick={() => startTaxEdit(selectedPartner.partner_business_info?.tax ?? null)} className="text-xs text-[#FE3A8F] font-medium">수정</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <Typography variant="body2" className="text-gray-500">정산 정보 없음</Typography>
                  )}
                </div>
              </SwiperSlide>
            </Swiper>

            <div className="p-6 pt-0 space-y-4">

              {/* 하단 액션 버튼 */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setIsPartnerModalOpen(false)
                    setSelectedPartner(null)
                    setIsEditingDistributionRate(false)
                    setIsEditingTax(false)
                  }}
                  className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                >
                  닫기
                </button>
                {selectedPartner.partner_status === 'pending' ? (
                  <>
                    <button
                      onClick={() => handlePartnerApproval(selectedPartner.member_id, false)}
                      className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                    >
                      거절
                    </button>
                    <button
                      onClick={() => handlePartnerApproval(selectedPartner.member_id, true)}
                      className="px-5 py-2.5 bg-[#FE3A8F] hover:bg-[#FE3A8F]/90 text-white rounded-xl font-medium transition-colors"
                    >
                      승인
                    </button>
                  </>
                ) : selectedPartner.partner_status === 'rejected' ? (
                  <button
                    onClick={() => handleResetToNormalMember(selectedPartner.member_id)}
                    className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                  >
                    일반 회원 전환
                  </button>
                ) : (
                  <button
                    onClick={() => handlePartnerRejectionConfirm(selectedPartner)}
                    className="px-5 py-2.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-xl font-medium transition-colors"
                  >
                    파트너 해제
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 파트너 거절 확인 모달 */}
      <Modal
        isOpen={isRejectionModalOpen}
        onClose={() => {
          setIsRejectionModalOpen(false)
          setPartnerToReject(null)
        }}
        title="파트너 해제 확인"
        size="md"
      >
        {partnerToReject && (
          <div className="space-y-4">
            <div className="text-center">
              <Typography variant="h5" className="mb-2">
                {partnerToReject.partner_name ||
                  partnerToReject.member_id ||
                  'Unknown'}
              </Typography>
              <Typography variant="body1" color="text-secondary">
                파트너를 해제하시겠습니까?
              </Typography>
            </div>

            {/* 포인트 정보 표시 */}
            {partnerToReject.total_points &&
              typeof partnerToReject.total_points === 'object' && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <Typography variant="body2" className="font-medium mb-2">
                    📋 포인트 처리 안내
                  </Typography>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div>
                      • 보유 포인트:{' '}
                      {(
                        partnerToReject.total_points as any
                      ).available?.toLocaleString() || 0}
                      P
                    </div>
                    <div>
                      • 출금 대기 포인트:{' '}
                      {(
                        partnerToReject.total_points as any
                      ).pending?.toLocaleString() || 0}
                      P
                    </div>
                    {(partnerToReject.total_points as any).pending > 0 && (
                      <div className="mt-2 p-2 bg-orange-100 rounded text-orange-800">
                        ⚠️ 출금 대기 중인 포인트는 자동으로 취소됩니다.
                      </div>
                    )}
                  </div>
                </div>
              )}

            <div className="bg-red-50 p-4 rounded-lg">
              <Typography variant="body2" color="text-secondary">
                ⚠️ 이 작업은 되돌릴 수 없습니다. 파트너 해제 후 일반 회원으로
                전환됩니다.
              </Typography>
            </div>

            <Flex gap={3} justify="end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsRejectionModalOpen(false)
                  setPartnerToReject(null)
                }}
              >
                취소
              </Button>
              <Button variant="primary" onClick={handlePartnerRejection}>
                확인
              </Button>
            </Flex>
          </div>
        )}
      </Modal>

      {/* 일반 회원 상세보기 모달 */}
      <Modal
        isOpen={isMemberModalOpen}
        onClose={() => {
          setIsMemberModalOpen(false)
          setSelectedMember(null)
        }}
        title="회원 상세 정보"
        size="lg"
        headerActions={
          selectedMember && (
            <Typography variant="body2" color="text-secondary">
              회원:{' '}
              {selectedMember.name || selectedMember.member_code || 'Unknown'}
            </Typography>
          )
        }
      >
        {selectedMember && (
          <div className="space-y-6">
            {/* 기본 정보 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <Typography variant="h5" className="mb-4">
                기본 정보
              </Typography>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      회원 코드
                    </Typography>
                    <Typography variant="body1">
                      {selectedMember.member_code || '없음'}
                    </Typography>
                  </div>
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      Discord ID
                    </Typography>
                    <Typography variant="body1">
                      {selectedMember.social_id || '미연결'}
                    </Typography>
                  </div>
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      현재 포인트
                    </Typography>
                    <Typography variant="body1">
                      {(selectedMember.total_points as any)?.toLocaleString('ko-KR') || 0} P
                    </Typography>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      가입일
                    </Typography>
                    <Typography variant="body1">
                      {new Date(selectedMember.created_at).toLocaleDateString(
                        'ko-KR',
                      )}
                    </Typography>
                  </div>
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      최근 업데이트
                    </Typography>
                    <Typography variant="body1">
                      {new Date(selectedMember.updated_at).toLocaleDateString(
                        'ko-KR',
                      )}
                    </Typography>
                  </div>
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      선호 게임
                    </Typography>
                    <Typography variant="body1">
                      {selectedMember.favorite_game || '설정되지 않음'}
                    </Typography>
                  </div>
                </div>
              </div>
            </div>

            {/* 포인트 정보 */}
            {selectedMember.total_points &&
              typeof selectedMember.total_points === 'object' ? (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <Typography variant="h5" className="mb-4">
                    포인트 정보
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-1"
                      >
                        총 포인트
                      </Typography>
                      <Typography variant="h4" className="text-blue-600">
                        {(
                          selectedMember.total_points as any
                        ).total?.toLocaleString() || 0}
                        P
                      </Typography>
                    </div>
                    <div className="text-center">
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-1"
                      >
                        사용 가능
                      </Typography>
                      <Typography variant="h4" className="text-green-600">
                        {(
                          selectedMember.total_points as any
                        ).available?.toLocaleString() || 0}
                        P
                      </Typography>
                    </div>
                    <div className="text-center">
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-1"
                      >
                        출금 대기
                      </Typography>
                      <Typography variant="h4" className="text-orange-600">
                        {(
                          selectedMember.total_points as any
                        ).pending?.toLocaleString() || 0}
                        P
                      </Typography>
                    </div>
                  </div>
                  {(selectedMember.total_points as any).bank && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-2"
                      >
                        계좌 정보
                      </Typography>
                      <Typography variant="body1">
                        {(selectedMember.total_points as any).bank} •{' '}
                        {maskName((selectedMember.total_points as any).bank_name || '')} •{' '}
                        {maskAccountNumber((selectedMember.total_points as any).bank_num || '')}
                      </Typography>
                    </div>
                  )}
                </div>
              ) : null}

            {/* 파트너 관련 정보 (해제된 파트너인 경우) */}
            {selectedPartner?.partner_status === 'rejected' && (
              <div className="bg-red-50 p-4 rounded-lg">
                <Typography variant="h5" className="mb-4">
                  파트너 이력
                </Typography>
                <div className="space-y-2">
                  <div>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mb-1"
                    >
                      파트너명
                    </Typography>
                    <Typography variant="body1">
                      {selectedPartner.partner_name || '정보 없음'}
                    </Typography>
                  </div>
                  {selectedPartner.partner_applied_at && (
                    <div>
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-1"
                      >
                        신청일
                      </Typography>
                      <Typography variant="body1">
                        {new Date(
                          selectedPartner.partner_applied_at,
                        ).toLocaleDateString('ko-KR')}
                      </Typography>
                    </div>
                  )}
                  {selectedPartner.partner_reviewed_at && (
                    <div>
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-1"
                      >
                        해제일
                      </Typography>
                      <Typography variant="body1">
                        {new Date(
                          selectedPartner.partner_reviewed_at,
                        ).toLocaleDateString('ko-KR')}
                      </Typography>
                    </div>
                  )}
                  {selectedPartner.partner_message && (
                    <div>
                      <Typography
                        variant="body2"
                        color="text-secondary"
                        className="mb-1"
                      >
                        신청 메시지
                      </Typography>
                      <Typography variant="body1">
                        {selectedPartner.partner_message}
                      </Typography>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 게임 정보 */}
            {selectedMember.game_info && (
              <div className="bg-green-50 p-4 rounded-lg">
                <Typography variant="h5" className="mb-4">
                  게임 정보
                </Typography>
                <div className="space-y-2">
                  {Array.isArray(selectedMember.game_info) ? (
                    selectedMember.game_info.map((game: any, index: number) => (
                      <div key={index} className="bg-white p-3 rounded border">
                        <Typography variant="body1" className="font-medium">
                          {game.game || '게임명 없음'}
                        </Typography>
                        {game.rank && (
                          <Typography variant="body2" color="text-secondary">
                            랭크: {game.rank}
                          </Typography>
                        )}
                        {game.description && (
                          <Typography variant="body2" color="text-secondary">
                            {game.description}
                          </Typography>
                        )}
                      </div>
                    ))
                  ) : (
                    <Typography variant="body1">
                      {JSON.stringify(selectedMember.game_info)}
                    </Typography>
                  )}
                </div>
              </div>
            )}

            {/* 인사말 */}
            {selectedMember.greeting && (
              <div className="bg-yellow-50 p-4 rounded-lg">
                <Typography variant="h5" className="mb-2">
                  인사말
                </Typography>
                <Typography variant="body1">
                  {selectedMember.greeting}
                </Typography>
              </div>
            )}

            {/* 포인트 로그 */}
            <div className="bg-purple-50 p-4 rounded-lg">
              <Typography variant="h5" className="mb-4">
                포인트 로그
              </Typography>
              {isLoadingPointsLogs ? (
                <div className="text-center py-4">
                  <Typography variant="body2" color="text-secondary">
                    로딩 중...
                  </Typography>
                </div>
              ) : memberPointsLogs.length === 0 ? (
                <div className="text-center py-4">
                  <Typography variant="body2" color="text-secondary">
                    포인트 로그가 없습니다.
                  </Typography>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {memberPointsLogs.map((log) => {
                    const isEarn = log.type === 'earn'
                    const isSpend = log.type === 'spend'
                    const isWithdraw = log.type === 'withdraw'
                    
                    // log_id에서 order_points 정보 추출
                    const isOrderPoints = log.log_id?.includes('order_points')
                    let orderPointsInfo = null
                    if (isOrderPoints && log.log_id) {
                      const match = log.log_id.match(/order_points_(\d+)_/)
                      if (match) {
                        const chargedPoints = Number(match[1])
                        const paymentAmount = Math.round(chargedPoints * 1.1) // 부가세 10% 포함
                        orderPointsInfo = {
                          chargedPoints,
                          paymentAmount,
                          orderId: log.log_id,
                        }
                      }
                    }

                    return (
                      <div
                        key={log.id}
                        className="bg-white p-3 rounded border border-gray-200 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  isEarn
                                    ? 'bg-green-100 text-green-800'
                                    : isSpend
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-orange-100 text-orange-800'
                                }`}
                              >
                                {isEarn
                                  ? '적립'
                                  : isSpend
                                    ? '사용'
                                    : '출금'}
                              </span>
                              <Typography
                                variant="body2"
                                className={`font-semibold ${
                                  isEarn
                                    ? 'text-green-600'
                                    : isSpend
                                      ? 'text-red-600'
                                      : 'text-orange-600'
                                }`}
                              >
                                {isEarn ? '+' : '-'}
                                {log.amount.toLocaleString()}P
                              </Typography>
                            </div>
                            <Typography
                              variant="body2"
                              color="text-secondary"
                              className="mb-1"
                            >
                              {log.description || '설명 없음'}
                            </Typography>
                            {orderPointsInfo && (
                              <div className="bg-blue-50 p-2 rounded mt-2 mb-1">
                                <Typography
                                  variant="body2"
                                  className="font-medium text-blue-800 mb-1"
                                >
                                  💳 결제 정보
                                </Typography>
                                <div className="text-sm text-blue-700 space-y-0.5">
                                  <div>
                                    충전 포인트: {orderPointsInfo.chargedPoints.toLocaleString()}P
                                  </div>
                                  <div>
                                    결제 금액: {orderPointsInfo.paymentAmount.toLocaleString()}원
                                  </div>
                                  <div className="text-xs text-blue-600 mt-1 break-all">
                                    주문번호: {orderPointsInfo.orderId}
                                  </div>
                                </div>
                              </div>
                            )}
                            <Typography
                              variant="caption"
                              color="text-secondary"
                            >
                              {new Date(log.created_at).toLocaleString('ko-KR')}
                            </Typography>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 파트너 포인트 로그 */}
            {partnerPointsLogsForMember.length > 0 && (
              <div className="bg-pink-50 p-4 rounded-lg">
                <Typography variant="h5" className="mb-4">
                  파트너 포인트 로그
                </Typography>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {partnerPointsLogsForMember.map((log) => {
                    const isEarn = log.type === 'earn'
                    const isSpend = log.type === 'spend'
                    const isWithdraw = log.type === 'withdraw'

                    return (
                      <div
                        key={log.id}
                        className="bg-white p-3 rounded border border-gray-200 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  isEarn
                                    ? 'bg-green-100 text-green-800'
                                    : isSpend
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-orange-100 text-orange-800'
                                }`}
                              >
                                {isEarn
                                  ? '적립'
                                  : isSpend
                                    ? '사용'
                                    : '출금'}
                              </span>
                              <Typography
                                variant="body2"
                                className={`font-semibold ${
                                  isEarn
                                    ? 'text-green-600'
                                    : isSpend
                                      ? 'text-red-600'
                                      : 'text-orange-600'
                                }`}
                              >
                                {isEarn ? '+' : '-'}
                                {log.amount.toLocaleString()}P
                              </Typography>
                            </div>
                            <Typography
                              variant="body2"
                              color="text-secondary"
                              className="mb-1"
                            >
                              {log.description || '설명 없음'}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text-secondary"
                            >
                              {new Date(log.created_at).toLocaleString('ko-KR')}
                            </Typography>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <Flex gap={3} justify="end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsMemberModalOpen(false)
                  setSelectedMember(null)
                  setMemberPointsLogs([])
                  setPartnerPointsLogsForMember([])
                }}
              >
                닫기
              </Button>
              {selectedPartner?.partner_status === 'rejected' && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setIsMemberModalOpen(false)
                    setSelectedMember(null)
                    handleResetToNormalMember(selectedMember.id)
                  }}
                >
                  일반 회원으로 전환
                </Button>
              )}
            </Flex>
          </div>
        )}
      </Modal>

      {/* Banner Modal */}
      <BannerModal
        isOpen={isBannerModalOpen}
        onClose={() => {
          setIsBannerModalOpen(false)
          setEditingBanner(undefined)
        }}
        onSave={editingBanner ? handleUpdateBanner : handleCreateBanner}
        banner={editingBanner}
        mode={editingBanner ? 'edit' : 'create'}
      />

      {/* 토스트 컨테이너 */}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  )
}

// Toss Balance API 테스트 컴포넌트
function TossBalanceTest() {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingBackend, setIsLoadingBackend] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  const fetchBalance = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      // 토스 페이먼츠 API 직접 호출
      const response = await fetch('https://api.tosspayments.com/v2/balances', {
        method: 'GET',
        headers: {
          'Authorization': 'Basic dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg==',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          data: data
        })
        addToast('잔액 조회 성공', 'success')
      } else {
        const errorMsg = data.message || data.error?.message || '잔액 조회 실패'
        setError(errorMsg)
        setResult({
          success: false,
          error: data
        })
        addToast('잔액 조회 실패', 'error')
      }
    } catch (err: any) {
      const errorMessage = err?.message || '알 수 없는 오류가 발생했습니다.'
      setError(errorMessage)
      addToast('잔액 조회 실패', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBalanceBackend = async () => {
    setIsLoadingBackend(true)
    setError(null)
    setResult(null)

    try {
      // 백엔드 API를 사용하여 잔액 조회
      const response = await mateYouApi.admin.getTossBalance()
      
      if (response.data.success) {
        setResult(response.data)
        addToast('잔액 조회 성공', 'success')
      } else {
        const errorMsg = response.data.error?.message || '잔액 조회 실패'
        setError(errorMsg)
        addToast('잔액 조회 실패', 'error')
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error?.message || 
                          err?.message || 
                          '알 수 없는 오류가 발생했습니다.'
      setError(errorMessage)
      addToast('잔액 조회 실패', 'error')
    } finally {
      setIsLoadingBackend(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-b pb-4 mb-4">
        <Typography variant="h4" className="mb-2">
          Toss Balance API 테스트
        </Typography>
        <Typography variant="body2" color="text-secondary">
          토스 페이먼츠 API(v2/balances)를 직접 호출하여 잔액 정보를 조회합니다.
        </Typography>
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant="primary"
          onClick={fetchBalance}
          disabled={isLoading || isLoadingBackend}
        >
          {isLoading ? '조회 중...' : '토스 API 직접 호출'}
        </Button>
        <Button
          variant="outline"
          onClick={fetchBalanceBackend}
          disabled={isLoading || isLoadingBackend}
        >
          {isLoadingBackend ? '조회 중...' : '백엔드 API 호출 (api.mateyou.me)'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <Typography variant="body1" className="text-red-800 font-semibold mb-2">
            에러 발생
          </Typography>
          <Typography variant="body2" className="text-red-600 whitespace-pre-wrap">
            {error}
          </Typography>
        </div>
      )}

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <Typography variant="body1" className="font-semibold mb-2">
            응답 결과
          </Typography>
          <pre className="bg-white p-4 rounded border overflow-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// Toss Sellers API 테스트 컴포넌트
function TossSellersTest() {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingBackend, setIsLoadingBackend] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeletingBackend, setIsDeletingBackend] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteSellerId, setDeleteSellerId] = useState('')
  const { addToast } = useToast()

  const fetchSellers = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      // 토스 페이먼츠 API 직접 호출
      const response = await fetch('https://api.tosspayments.com/v2/sellers', {
        method: 'GET',
        headers: {
          'Authorization': 'Basic dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg==',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          data: data
        })
        addToast('셀러 목록 조회 성공', 'success')
      } else {
        const errorMsg = data.message || data.error?.message || '셀러 목록 조회 실패'
        setError(errorMsg)
        setResult({
          success: false,
          error: data
        })
        addToast('셀러 목록 조회 실패', 'error')
      }
    } catch (err: any) {
      const errorMessage = err?.message || '알 수 없는 오류가 발생했습니다.'
      setError(errorMessage)
      addToast('셀러 목록 조회 실패', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSellersBackend = async () => {
    setIsLoadingBackend(true)
    setError(null)
    setResult(null)

    try {
      // 백엔드 API를 사용하여 셀러 목록 조회
      const response = await mateYouApi.toss.getSellers()
      
      if (response.data.success) {
        setResult(response.data)
        addToast('셀러 목록 조회 성공', 'success')
      } else {
        const errorMsg = response.data.error?.message || '셀러 목록 조회 실패'
        setError(errorMsg)
        addToast('셀러 목록 조회 실패', 'error')
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error?.message || 
                          err?.message || 
                          '알 수 없는 오류가 발생했습니다.'
      setError(errorMessage)
      addToast('셀러 목록 조회 실패', 'error')
    } finally {
      setIsLoadingBackend(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-b pb-4 mb-4">
        <Typography variant="h4" className="mb-2">
          Toss Sellers API 테스트
        </Typography>
        <Typography variant="body2" color="text-secondary">
          토스 페이먼츠 API(v2/sellers)를 직접 호출하여 셀러 목록을 조회합니다.
        </Typography>
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant="primary"
          onClick={fetchSellers}
          disabled={isLoading || isLoadingBackend}
        >
          {isLoading ? '조회 중...' : '토스 API 직접 호출'}
        </Button>
        <Button
          variant="outline"
          onClick={fetchSellersBackend}
          disabled={isLoading || isLoadingBackend}
        >
          {isLoadingBackend ? '조회 중...' : '백엔드 API 호출 (api.mateyou.me)'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <Typography variant="body1" className="text-red-800 font-semibold mb-2">
            에러 발생
          </Typography>
          <Typography variant="body2" className="text-red-600 whitespace-pre-wrap">
            {error}
          </Typography>
        </div>
      )}

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <Typography variant="body1" className="font-semibold mb-2">
            응답 결과
          </Typography>
          <pre className="bg-white p-4 rounded border overflow-auto text-sm max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* 셀러 삭제 섹션 */}
      <div className="mt-8 pt-8 border-t">
        <div className="border-b pb-4 mb-4">
          <Typography variant="h4" className="mb-2">
            셀러 삭제
          </Typography>
          <Typography variant="body2" color="text-secondary">
            토스 페이먼츠 API를 통해 셀러를 삭제할 수 있습니다. 주의: 삭제된 셀러는 복구할 수 없습니다.
          </Typography>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              셀러 ID *
            </label>
            <input
              type="text"
              value={deleteSellerId}
              onChange={(e) => setDeleteSellerId(e.target.value)}
              placeholder="예: seller_1234567890"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="error"
              onClick={async () => {
                if (!deleteSellerId.trim()) {
                  addToast('셀러 ID를 입력해주세요.', 'error')
                  return
                }

                if (!confirm(`정말로 셀러 "${deleteSellerId}"를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
                  return
                }

                setIsDeleting(true)
                setError(null)
                setResult(null)

                try {
                  // 토스 페이먼츠 API 직접 호출
                  const response = await fetch(`https://api.tosspayments.com/v2/sellers/${deleteSellerId}`, {
                    method: 'DELETE',
                    headers: {
                      'Authorization': 'Basic dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg==',
                    },
                  })

                  const data = await response.json()

                  if (response.ok) {
                    setResult({
                      success: true,
                      data: data
                    })
                    addToast('셀러 삭제 성공', 'success')
                    setDeleteSellerId('')
                  } else {
                    const errorMsg = data.message || data.error?.message || '셀러 삭제 실패'
                    setError(errorMsg)
                    setResult({
                      success: false,
                      error: data
                    })
                    addToast('셀러 삭제 실패', 'error')
                  }
                } catch (err: any) {
                  const errorMessage = err?.message || '알 수 없는 오류가 발생했습니다.'
                  setError(errorMessage)
                  addToast('셀러 삭제 실패', 'error')
                } finally {
                  setIsDeleting(false)
                }
              }}
              disabled={isDeleting || isDeletingBackend || !deleteSellerId.trim()}
            >
              {isDeleting ? '삭제 중...' : '토스 API 직접 호출로 삭제'}
            </Button>
            <Button
              variant="error"
              onClick={async () => {
                if (!deleteSellerId.trim()) {
                  addToast('셀러 ID를 입력해주세요.', 'error')
                  return
                }

                if (!confirm(`정말로 셀러 "${deleteSellerId}"를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
                  return
                }

                setIsDeletingBackend(true)
                setError(null)
                setResult(null)

                try {
                  // 백엔드 API를 사용하여 셀러 삭제
                  const response = await mateYouApi.toss.deleteSeller(deleteSellerId)
                  
                  if (response.data.success) {
                    setResult(response.data)
                    addToast('셀러 삭제 성공', 'success')
                    setDeleteSellerId('')
                  } else {
                    const errorMsg = response.data.error?.message || '셀러 삭제 실패'
                    setError(errorMsg)
                    addToast('셀러 삭제 실패', 'error')
                  }
                } catch (err: any) {
                  const errorMessage = err?.response?.data?.error?.message || 
                                      err?.message || 
                                      '알 수 없는 오류가 발생했습니다.'
                  setError(errorMessage)
                  addToast('셀러 삭제 실패', 'error')
                } finally {
                  setIsDeletingBackend(false)
                }
              }}
              disabled={isDeleting || isDeletingBackend || !deleteSellerId.trim()}
            >
              {isDeletingBackend ? '삭제 중...' : '백엔드 API 호출로 삭제 (api.mateyou.me)'}
            </Button>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <Typography variant="body2" className="text-red-800">
              <strong>⚠️ 주의사항:</strong>
              <br />
              • 셀러 삭제는 되돌릴 수 없는 작업입니다.
              <br />
              • 삭제된 셀러는 더 이상 지급 대행 서비스를 사용할 수 없습니다.
              <br />
              • 삭제 전에 반드시 확인하시기 바랍니다.
            </Typography>
          </div>
        </div>
      </div>
    </div>
  )
}

// Toss 지급 대행 관리 컴포넌트
function TossPayoutManagement() {
  const [activeSubTab, setActiveSubTab] = useState<'request' | 'history'>('request')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [payoutForm, setPayoutForm] = useState({
    sellerId: '',
    amount: '',
    bankCode: '',
    accountNumber: '',
    holderName: '',
    description: '',
  })
  const { addToast } = useToast()

  const handlePayoutRequest = async () => {
    if (!payoutForm.sellerId || !payoutForm.amount || !payoutForm.bankCode || 
        !payoutForm.accountNumber || !payoutForm.holderName) {
      addToast('모든 필수 항목을 입력해주세요.', 'error')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const payoutData = {
        payouts: [{
          sellerId: payoutForm.sellerId,
          amount: parseInt(payoutForm.amount),
          bankCode: payoutForm.bankCode,
          accountNumber: payoutForm.accountNumber.replace(/\s/g, ''),
          holderName: payoutForm.holderName,
          description: payoutForm.description || '지급 대행',
        }],
        idempotencyKey: `payout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }

      const response = await mateYouApi.toss.requestPayout(payoutData)
      
      if (response.data.success) {
        setResult(response.data)
        addToast('지급 요청 성공', 'success')
        // 폼 초기화
        setPayoutForm({
          sellerId: '',
          amount: '',
          bankCode: '',
          accountNumber: '',
          holderName: '',
          description: '',
        })
      } else {
        const errorMsg = response.data.error?.message || '지급 요청 실패'
        setError(errorMsg)
        addToast('지급 요청 실패', 'error')
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error?.message || 
                          err?.message || 
                          '알 수 없는 오류가 발생했습니다.'
      setError(errorMessage)
      addToast('지급 요청 실패', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-b pb-4 mb-4">
        <Typography variant="h4" className="mb-2">
          토스 지급 대행 관리
        </Typography>
        <Typography variant="body2" color="text-secondary">
          토스 페이먼츠 지급 대행 서비스를 통해 셀러에게 지급을 요청할 수 있습니다.
        </Typography>
      </div>

      {/* 서브 탭 */}
      <div className="flex gap-2 border-b mb-4">
        <button
          onClick={() => setActiveSubTab('request')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeSubTab === 'request'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          지급 요청
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeSubTab === 'history'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          지급 내역 (준비중)
        </button>
      </div>

      {activeSubTab === 'request' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <Typography variant="body2" color="text-secondary">
              <strong>안내사항:</strong>
              <br />
              • 셀러 ID는 토스 셀러 등록 시 발급받은 ID를 입력해주세요.
              <br />
              • 지급 금액은 원 단위로 입력해주세요.
              <br />
              • 계좌 정보는 정확히 입력해주세요. 오입력 시 지급이 실패할 수 있습니다.
            </Typography>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                셀러 ID *
              </label>
              <input
                type="text"
                value={payoutForm.sellerId}
                onChange={(e) => setPayoutForm({ ...payoutForm, sellerId: e.target.value })}
                placeholder="예: seller_1234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                지급 금액 (원) *
              </label>
              <input
                type="number"
                value={payoutForm.amount}
                onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                placeholder="예: 10000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                은행 코드 *
              </label>
              <input
                type="text"
                value={payoutForm.bankCode}
                onChange={(e) => setPayoutForm({ ...payoutForm, bankCode: e.target.value })}
                placeholder="예: 20 (KB국민은행)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                계좌번호 *
              </label>
              <input
                type="text"
                value={payoutForm.accountNumber}
                onChange={(e) => setPayoutForm({ ...payoutForm, accountNumber: e.target.value })}
                placeholder="하이픈 없이 입력"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                예금주 *
              </label>
              <input
                type="text"
                value={payoutForm.holderName}
                onChange={(e) => setPayoutForm({ ...payoutForm, holderName: e.target.value })}
                placeholder="예: 홍길동"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                지급 설명 (선택)
              </label>
              <input
                type="text"
                value={payoutForm.description}
                onChange={(e) => setPayoutForm({ ...payoutForm, description: e.target.value })}
                placeholder="예: 2024년 1월 정산"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handlePayoutRequest}
              disabled={isLoading}
            >
              {isLoading ? '지급 요청 중...' : '지급 요청하기'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPayoutForm({
                  sellerId: '',
                  amount: '',
                  bankCode: '',
                  accountNumber: '',
                  holderName: '',
                  description: '',
                })
                setResult(null)
                setError(null)
              }}
            >
              초기화
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <Typography variant="body1" className="text-red-800 font-semibold mb-2">
                에러 발생
              </Typography>
              <Typography variant="body2" className="text-red-600 whitespace-pre-wrap">
                {error}
              </Typography>
            </div>
          )}

          {result && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <Typography variant="body1" className="font-semibold mb-2">
                응답 결과
              </Typography>
              <pre className="bg-white p-4 rounded border overflow-auto text-sm max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'history' && (
        <div className="text-center py-8">
          <Typography variant="body1" color="text-secondary">
            지급 내역 조회 기능은 준비 중입니다.
          </Typography>
        </div>
      )}
    </div>
  )
}

// 드래그 가능한 스토어 배너 아이템 컴포넌트
function SortableStoreBannerItem({
  banner,
  onEdit,
  onDelete,
}: {
  banner: StoreBanner
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200"
    >
      <div
        className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="w-40 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {banner.banner ? (
          <img src={banner.banner} alt="배너" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
      </div>
      <div className="flex-1 text-sm text-gray-500">
        순서: {banner.sort_order + 1}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// 드래그 가능한 추천 파트너 아이템 컴포넌트
function SortableStoreRecommendedItem({
  item,
  onDelete,
}: {
  item: StoreRecommended
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200"
    >
      <div
        className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
        {item.partner?.member?.profile_image ? (
          <img src={item.partner.member.profile_image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            {item.partner?.partner_name?.[0] || '?'}
          </div>
        )}
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm">{item.partner?.partner_name || '알 수 없음'}</div>
        <div className="text-xs text-gray-500">@{item.partner?.member?.member_code || ''}</div>
      </div>
      <div className="text-sm text-gray-500">
        순서: {item.sort_order + 1}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

// 드래그 가능한 카테고리 아이템 컴포넌트
function SortableExplorerCategoryItem({
  category,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  category: ExplorerCategory
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-[#FE3A8F]/10 border-[#FE3A8F]'
          : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <div
        className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{category.name}</span>
          {category.hashtag && (
            <span className="text-xs text-[#FE3A8F]">{category.hashtag}</span>
          )}
          {category.section_type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-semibold">
              자동
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {!category.section_type && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'
import { findBankByCode } from '@/constants/banks'

const TOSS_BUSINESS_TYPES = [
  'INDIVIDUAL',
  'INDIVIDUAL_BUSINESS',
  'CORPORATE',
] as const
type TossBusinessType = (typeof TOSS_BUSINESS_TYPES)[number]

export interface PartnerApplicationData {
  partnerName: string
  partnerMessage: string
  profileImage?: string
  favoriteGame: string
  gameInfo?: string
}

export interface PartnerApplicationRequest extends PartnerApplicationData {
  socialId: string
  legalName?: string
  legalEmail?: string
  legalPhone?: string
  businessType?: TossBusinessType
  payoutBankCode?: string
  payoutBankName?: string
  payoutAccountNumber?: string
  payoutAccountHolder?: string
  categories?: Array<{ category_id: number; detail_category_id: number | null }>
  referralSource?: string
  referrerMemberCode?: string
  interviewLegalName?: string
  interviewPhone?: string
  interviewEmail?: string
  interviewContactId?: string
  interviewSnsType?: string
  interviewGender?: string
  interviewOtherPlatforms?: string
  interviewMainContent?: string
  termsAgreedAt?: string
  privacyAgreedAt?: string
}

const createRandomKey = () => {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID()
    }
  } catch {
    // ignore and fallback
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
}

const sanitizeRefSellerId = (value?: string | null) => {
  if (!value) return ''
  const sanitized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return sanitized
}

const ensureRefSellerLength = (value: string) => {
  const trimmed = value.slice(0, 20)
  if (trimmed.length >= 7) return trimmed

  const needed = 7 - trimmed.length
  const suffix = createRandomKey().slice(0, needed)
  return (trimmed + suffix).slice(0, 20)
}

const generateRefSellerId = (
  existing?: string | null,
  preferred?: string | null,
) => {
  const preferredSanitized = sanitizeRefSellerId(preferred)
  if (preferredSanitized) {
    return ensureRefSellerLength(preferredSanitized)
  }

  const existingSanitized = sanitizeRefSellerId(existing)
  if (existingSanitized) {
    return ensureRefSellerLength(existingSanitized)
  }

  const fallback = `MY${createRandomKey()}`.slice(0, 15)
  return ensureRefSellerLength(fallback)
}

type TossSellerSyncResult =
  | {
      success: true
      sellerId?: string
      status?: string
      raw: unknown
    }
  | {
      success: false
      error: string
      details?: unknown
    }

function buildSellerSyncPayload(partnerInfo: any) {
  const sanitizedPhone = (partnerInfo.legal_phone || '').replace(/\D/g, '')
  const sanitizedAccountNumber = (partnerInfo.payout_account_number || '')
    .replace(/\D/g, '')
    .slice(0, 14)

  if (!partnerInfo.legal_name) {
    throw new Error('대표자 이름이 누락되어 토스 셀러를 연동할 수 없습니다.')
  }
  if (!partnerInfo.legal_email) {
    throw new Error('대표자 이메일이 누락되어 토스 셀러를 연동할 수 없습니다.')
  }
  if (sanitizedPhone.length < 8) {
    throw new Error('대표자 전화번호는 숫자 8자리 이상이어야 합니다.')
  }
  if (!partnerInfo.payout_bank_code) {
    throw new Error('정산 계좌 은행 코드를 입력해주세요.')
  }
  if (!sanitizedAccountNumber) {
    throw new Error('정산 계좌번호를 입력해주세요.')
  }
  if (!partnerInfo.payout_account_holder) {
    throw new Error('정산 계좌 예금주를 입력해주세요.')
  }

  const businessType: TossBusinessType = 'INDIVIDUAL'
  const refSellerId = generateRefSellerId(
    partnerInfo.tosspayments_ref_seller_id,
    partnerInfo.member_code,
  )

  const individual = {
    name: partnerInfo.legal_name,
    email: partnerInfo.legal_email,
    phone: sanitizedPhone,
  }

  const account = {
    bankCode: partnerInfo.payout_bank_code,
    accountNumber: sanitizedAccountNumber,
    holderName: partnerInfo.payout_account_holder,
  }

  const metadata: Record<string, string> = {
    partnerId: String(partnerInfo.id),
    source: 'mate_you',
  }

  if (partnerInfo.member_id) {
    metadata.memberId = String(partnerInfo.member_id)
  }

  return {
    refSellerId,
    businessType,
    individual,
    account,
    metadata,
    is_production: true,
  }
}

type TossPayoutInvokeResponse = {
  success: boolean
  status: number
  data?: unknown
  error?: string
  details?: unknown
}

const syncSellerWithToss = async (params: {
  mode: 'create' | 'update'
  sellerId?: string | null
  payload: Record<string, unknown>
}): Promise<TossSellerSyncResult> => {
  try {
    // API를 통해 백엔드에서 토스 셀러 처리
    const response = await mateYouApi.toss.syncSeller({
      mode: params.mode,
      sellerId: params.sellerId,
      payload: params.payload
    })

    const result = response.data
    console.log(`Toss 셀러 ${params.mode} API 응답:`, result)

    if (!result.success) {
      console.error('Toss API Error (partnerApi):', {
        result,
        mode: params.mode
      })

      const errorMessage = result?.error || result?.details || '토스 지급대행 연동이 실패했습니다'
      return {
        success: false,
        error: errorMessage,
        details: result,
      }
    }

    return {
      success: true,
      sellerId: result.data?.id,
      status: result.data?.status,
      raw: result.data,
    }
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : '토스 지급대행 연동 중 알 수 없는 오류가 발생했습니다.',
    }
  }
}

// 파트너 신청 함수
// Express API를 사용하여 파트너 신청 처리
export async function submitPartnerApplication(
  data: PartnerApplicationRequest,
) {
  try {
    // 토스 정보가 있는 경우에만 처리
    const businessType: TossBusinessType | undefined = data.businessType && TOSS_BUSINESS_TYPES.includes(
      data.businessType,
    )
      ? data.businessType
      : data.businessType ? 'INDIVIDUAL' : undefined
    const sanitizedPhone = data.legalPhone?.replace(/\D/g, '')
    const sanitizedAccountNumber = data.payoutAccountNumber?.replace(/\D/g, '')
    const bankName = data.payoutBankCode
      ? (data.payoutBankName || findBankByCode(data.payoutBankCode)?.name || '')
      : undefined

    // game_info 처리
    let gameInfo: any = null
    if (data.gameInfo && data.gameInfo.trim()) {
      try {
        const parsed = JSON.parse(data.gameInfo)
        gameInfo = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        gameInfo = [{ description: data.gameInfo }]
      }
    }

    // Express API 요청 데이터 구성
    const requestData: any = {
      partner_name: data.partnerName,
      partner_message: data.partnerMessage || null,
      game_info: gameInfo,
    }

    // 카테고리 정보가 있는 경우 추가
    if (data.categories && data.categories.length > 0) {
      requestData.categories = data.categories
    }

    if (data.referralSource) requestData.referral_source = data.referralSource
    if (data.referrerMemberCode) requestData.referrer_member_code = data.referrerMemberCode
    if (data.interviewLegalName) requestData.interview_legal_name = data.interviewLegalName
    if (data.interviewPhone) requestData.interview_phone = data.interviewPhone
    if (data.interviewEmail) requestData.interview_email = data.interviewEmail
    if (data.interviewContactId) requestData.interview_contact_id = data.interviewContactId
    if (data.interviewSnsType) requestData.interview_sns_type = data.interviewSnsType
    if (data.interviewGender) requestData.interview_gender = data.interviewGender
    if (data.interviewOtherPlatforms) requestData.interview_other_platforms = data.interviewOtherPlatforms
    if (data.interviewMainContent) requestData.interview_main_content = data.interviewMainContent
    if (data.termsAgreedAt) requestData.terms_agreed_at = data.termsAgreedAt
    if (data.privacyAgreedAt) requestData.privacy_agreed_at = data.privacyAgreedAt

    // 토스 정보가 있는 경우에만 추가
    if (data.legalName && sanitizedPhone && data.payoutBankCode && sanitizedAccountNumber && data.payoutAccountHolder) {
      requestData.legal_name = data.legalName
      requestData.legal_email = data.legalEmail
      requestData.legal_phone = sanitizedPhone
      requestData.payout_bank_code = data.payoutBankCode
      requestData.payout_bank_name = bankName
      requestData.payout_account_number = sanitizedAccountNumber
      requestData.payout_account_holder = data.payoutAccountHolder
      requestData.business_type = businessType
    }

    // Express API 호출
    const response = await mateYouApi.auth.applyPartner(requestData)

    if (response.data.success) {
      return { success: true, message: '파트너 신청이 완료되었습니다.' }
    } else {
      const errorMessage = response.data.error?.message || '파트너 신청 중 오류가 발생했습니다.'
      return { success: false, message: errorMessage }
    }
  } catch (error: any) {
    // API 에러 처리
    if (error?.response?.data?.error?.message) {
      return { success: false, message: error.response.data.error.message }
    }

    if (error instanceof Error) {
      return { success: false, message: error.message }
    }

    return {
      success: false,
      message: '파트너 신청 중 예기치 못한 오류가 발생했습니다.',
    }
  }
}

// 파트너 신청 정보 업데이트 함수
// Express API를 사용하여 파트너 신청 정보 업데이트
export async function updatePartnerApplication(
  data: PartnerApplicationRequest,
) {
  try {
    // 토스 정보가 있는 경우에만 처리
    const businessType: TossBusinessType | undefined = data.businessType && TOSS_BUSINESS_TYPES.includes(
      data.businessType,
    )
      ? data.businessType
      : data.businessType ? 'INDIVIDUAL' : undefined
    const sanitizedPhone = data.legalPhone?.replace(/\D/g, '')
    const sanitizedAccountNumber = data.payoutAccountNumber?.replace(/\D/g, '')
    const bankName = data.payoutBankCode
      ? (data.payoutBankName || findBankByCode(data.payoutBankCode)?.name || '')
      : undefined

    // game_info 처리
    let gameInfo: any = null
    if (data.gameInfo && data.gameInfo.trim()) {
      try {
        const parsed = JSON.parse(data.gameInfo)
        gameInfo = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        gameInfo = [{ description: data.gameInfo }]
      }
    }

    // Express API 요청 데이터 구성
    const requestData: any = {
      partner_name: data.partnerName,
      partner_message: data.partnerMessage || null,
      game_info: gameInfo,
    }

    // 카테고리 정보가 있는 경우 추가
    if (data.categories && data.categories.length > 0) {
      requestData.categories = data.categories
    }

    // 토스 정보가 있는 경우에만 추가
    if (data.legalName && sanitizedPhone && data.payoutBankCode && sanitizedAccountNumber && data.payoutAccountHolder) {
      requestData.legal_name = data.legalName
      requestData.legal_email = data.legalEmail
      requestData.legal_phone = sanitizedPhone
      requestData.payout_bank_code = data.payoutBankCode
      requestData.payout_bank_name = bankName
      requestData.payout_account_number = sanitizedAccountNumber
      requestData.payout_account_holder = data.payoutAccountHolder
      requestData.business_type = businessType
    }

    // Express API 호출 (PUT /api/auth/partner-apply)
    const response = await mateYouApi.auth.updatePartnerApplication(requestData)

    if (response.data.success) {
      return { success: true, message: '파트너 신청 정보가 수정되었습니다.' }
    } else {
      const errorMessage = response.data.error?.message || '파트너 신청 정보 수정 중 오류가 발생했습니다.'
      return { success: false, message: errorMessage }
    }
  } catch (error: any) {
    // API 에러 처리
    if (error?.response?.data?.error?.message) {
      return { success: false, message: error.response.data.error.message }
    }

    if (error instanceof Error) {
      return { success: false, message: error.message }
    }

    return {
      success: false,
      message: '파트너 신청 정보 수정 중 예기치 못한 오류가 발생했습니다.',
    }
  }
}

// 파트너 신청 상태 조회 함수
export async function getPartnerApplicationStatus(socialId: string) {
  try {
    // 현재 로그인한 사용자의 member 정보 확인
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      throw new Error('로그인이 필요합니다.')
    }

    // members.id = auth.uid()로 조회 (social_id 사용 안 함)
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('id, role')
      .eq('id', authUser.id)
      .maybeSingle()

    if (memberError && memberError.code !== 'PGRST116') {
      throw new Error(
        `회원 조회 중 오류가 발생했습니다: ${memberError.message}`,
      )
    }

    if (!memberData) {
      return { success: true, data: null }
    }

    // 파트너 정보 조회
    const { data: partnerData, error: partnerError } = await supabase
      .from('partners')
      .select('partner_status, partner_applied_at, partner_reviewed_at')
      .eq('member_id', memberData.id)
      .maybeSingle()

    if (partnerError && partnerError.code !== 'PGRST116') {
      throw new Error(
        `파트너 정보 조회 중 오류가 발생했습니다: ${partnerError.message}`,
      )
    }

    const result = {
      role: memberData.role,
      partner_status: partnerData?.partner_status || 'none',
      partner_applied_at: partnerData?.partner_applied_at || null,
      partner_reviewed_at: partnerData?.partner_reviewed_at || null,
    }

    return { success: true, data: result }
  } catch (error) {
    return { success: false, message: '신청 상태 조회 중 오류가 발생했습니다.' }
  }
}

// 파트너 출금 신청 함수
// Express API를 사용하여 트랜잭션 안전성 보장
// @deprecated 이 함수는 Express API로 마이그레이션되었습니다. mateYouApi.partnerDashboard.submitWithdrawal를 직접 사용하세요.
export async function submitWithdrawalRequest(
  memberId: string,
  amount: number,
  accountHolder: string,
  bankName: string,
  accountNumber: string,
  pointType: 'total_points' | 'store_points' | 'collaboration_store_points' = 'total_points',
) {
  try {
    // Express API를 사용하여 출금 신청
    const { mateYouApi } = await import('@/lib/apiClient')
    
    const response = await mateYouApi.partnerDashboard.submitWithdrawal({
      amount,
      bank_info: {
        bank_name: bankName,
        bank_owner: accountHolder,
        bank_num: accountNumber,
      },
      point_type: pointType,
    })

    // 응답 형식 처리
    if (response.data.success) {
      return {
        success: true,
        message: response.data.data?.message || '출금 신청이 완료되었습니다. 관리자 승인 후 처리됩니다.',
      }
    } else {
      const errorMessage = response.data.error?.message || '출금 신청 중 오류가 발생했습니다.'
      return { success: false, message: errorMessage }
    }
  } catch (error: any) {
    // API 에러 처리
    if (error?.response?.data?.error?.message) {
      return { success: false, message: error.response.data.error.message }
    }
    
    if (error instanceof Error) {
      return { success: false, message: error.message }
    }

    return {
      success: false,
      message: '출금 신청 중 예기치 못한 오류가 발생했습니다.',
    }
  }
}

// 포인트 내역 추가 함수
// partnerId는 이제 members.id를 받습니다 (partners.member_id로 조회)
export async function addPointEntry(data: {
  partnerId: string  // members.id
  type: 'earn' | 'withdraw'
  amount: number
  description: string
}) {
  try {
    const response = await mateYouApi.members.logPoints({
      points: data.type === 'earn' ? data.amount : -data.amount,
      reason: data.description,
      reference_type: 'partner_action',
      reference_id: data.partnerId,
    })

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to log points')
    }

    const action = data.type === 'earn' ? '적립' : '차감'
    return {
      success: true,
      message: `${data.amount}P ${action}이 완료되었습니다.`,
      newTotalPoints: response.data?.newTotalPoints,
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : '포인트 내역 추가 중 예기치 못한 오류가 발생했습니다.',
    }
  }
}

// 백엔드에서 토스 API 호출 및 DB 업데이트를 모두 처리합니다
// API를 통해 파트너 정보 조회 (partner_business_info 포함된 flattened 형태)
export async function syncPartnerSeller(_memberId: string) {
  try {
    // 백엔드 API 사용 (Supabase 직접 접근 제거)
    const profileResponse = await mateYouApi.partnerProfile.info()
    const partnerInfo = profileResponse.data?.data?.partner

    if (!partnerInfo) {
      throw new Error('파트너 정보를 찾을 수 없습니다.')
    }

    const { refSellerId, businessType, individual, account, metadata } =
      buildSellerSyncPayload(partnerInfo)

    // 백엔드 API 호출 - 백엔드에서 토스 API 호출 및 DB 업데이트를 모두 처리
    const syncResponse = await mateYouApi.toss.syncSeller({
      mode: partnerInfo.tosspayments_seller_id ? 'update' : 'create',
      sellerId: partnerInfo.tosspayments_seller_id,
      payload: {
        refSellerId,
        businessType,
        individual,
        account,
        metadata,
        is_production: true,
      },
    })

    const result = syncResponse.data

    if (!result.success) {
      // 에러 메시지를 다양한 형태에서 추출
      let errorMessage = '토스 셀러 연동이 실패했습니다'

      const resultAny = result as any

      if (result?.error) {
        // error가 객체인 경우 message 속성 추출
        errorMessage = typeof result.error === 'string'
          ? result.error
          : result.error.message || result.error.details || errorMessage
      } else if (resultAny?.details) {
        errorMessage = typeof resultAny.details === 'string'
          ? resultAny.details
          : resultAny.details.message || errorMessage
      }

      return {
        success: false,
        message: errorMessage,
      }
    }

    // 백엔드에서 DB 업데이트를 처리하므로 프론트엔드에서는 성공 메시지만 반환
    return {
      success: true,
      message: '토스 셀러 정보가 동기화되었습니다.',
    }
  } catch (error) {
    console.error('syncPartnerSeller catch error:', error)

    // 에러 메시지를 다양한 형태에서 추출
    let errorMessage = '토스 셀러 동기화 중 예기치 못한 오류가 발생했습니다.'

    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    } else if (error && typeof error === 'object') {
      const err = error as any
      // axios 에러의 경우 response.data에서 추출
      if (err.response?.data?.error) {
        errorMessage = typeof err.response.data.error === 'string'
          ? err.response.data.error
          : err.response.data.error.message || errorMessage
      } else {
        errorMessage = err.message || err.error?.message || err.data?.message || errorMessage
      }
    }

    return {
      success: false,
      message: errorMessage,
    }
  }
}

// API를 통해 파트너 정보 조회 (partner_business_info 포함된 flattened 형태)
export async function syncPartnerSellerContact(_memberId: string) {
  try {
    // 백엔드 API 사용 (Supabase 직접 접근 제거)
    const profileResponse = await mateYouApi.partnerProfile.info()
    const partnerInfo = profileResponse.data?.data?.partner

    if (!partnerInfo) {
      throw new Error('파트너 정보를 찾을 수 없습니다.')
    }

    if (!partnerInfo.tosspayments_seller_id) {
      return syncPartnerSeller(_memberId)
    }

    const { refSellerId, businessType, individual, account, metadata } =
      buildSellerSyncPayload(partnerInfo)

    // 백엔드 API 호출 - 백엔드에서 토스 API 호출 및 DB 업데이트를 모두 처리
    const updateResponse = await mateYouApi.toss.updateSeller(
      partnerInfo.tosspayments_seller_id,
      {
        refSellerId,
        businessType,
        individual,
        account,
        metadata,
        is_production: true,
      }
    )

    const result = updateResponse.data

    if (!result.success) {
      // 에러 메시지를 다양한 형태에서 추출
      let errorMessage = '토스 셀러 정보 수정이 실패했습니다'

      const resultAny = result as any

      if (result?.error) {
        // error가 객체인 경우 message 속성 추출
        errorMessage = typeof result.error === 'string'
          ? result.error
          : result.error.message || result.error.details || errorMessage
      } else if (resultAny?.details) {
        errorMessage = typeof resultAny.details === 'string'
          ? resultAny.details
          : resultAny.details.message || errorMessage
      }

      return {
        success: false,
        message: errorMessage,
      }
    }

    // 백엔드에서 DB 업데이트를 처리하므로 프론트엔드에서는 성공 메시지만 반환
    return {
      success: true,
      message: '토스 셀러 정보가 업데이트되었습니다.',
    }
  } catch (error) {
    console.error('syncPartnerSellerContact catch error:', error)

    // 에러 메시지를 다양한 형태에서 추출
    let errorMessage = '토스 셀러 정보 수정 중 예기치 못한 오류가 발생했습니다.'

    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    } else if (error && typeof error === 'object') {
      const err = error as any
      // axios 에러의 경우 response.data에서 추출
      if (err.response?.data?.error) {
        errorMessage = typeof err.response.data.error === 'string'
          ? err.response.data.error
          : err.response.data.error.message || errorMessage
      } else {
        errorMessage = err.message || err.error?.message || err.data?.message || errorMessage
      }
    }

    return {
      success: false,
      message: errorMessage,
    }
  }
}

// 파트너 현재 상태 업데이트 함수
export async function updatePartnerCurrentStatus(
  socialId: string,
  newStatus: 'online' | 'offline',
) {
  try {
    // 현재 로그인한 사용자의 member 정보 확인
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      throw new Error('로그인이 필요합니다.')
    }

    // members.id = auth.uid()로 조회 (social_id 사용 안 함)
    const { data: currentUser, error: findError } = await supabase
      .from('members')
      .select('id, current_status, role')
      .eq('id', authUser.id)
      .maybeSingle()

    if (findError) {
      throw new Error(
        `사용자 조회 중 오류가 발생했습니다: ${findError.message}`,
      )
    }

    if (!currentUser) {
      throw new Error('사용자 정보를 찾을 수 없습니다.')
    }

    // 파트너 정보 확인
    const { data: partnerData, error: partnerFindError } = await supabase
      .from('partners')
      .select('id, partner_status')
      .eq('member_id', currentUser.id)
      .maybeSingle()

    if (
      partnerFindError ||
      !partnerData ||
      partnerData.partner_status !== 'approved'
    ) {
      throw new Error('승인된 파트너만 상태를 변경할 수 있습니다.')
    }

    // 2. 매칭중이나 게임중인 경우 변경 불가
    if (
      currentUser.current_status === '매칭중' ||
      currentUser.current_status === '게임중'
    ) {
      throw new Error('매칭 중이거나 게임 중일 때는 상태를 변경할 수 없습니다.')
    }

    // 3. 상태 업데이트
    const { error: updateError } = await supabase
      .from('members')
      // @ts-expect-error - Supabase 타입 문제 우회
      .update({
        current_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id)

    if (updateError) {
      throw new Error(
        `상태 업데이트 중 오류가 발생했습니다: ${updateError.message}`,
      )
    }

    return { success: true, message: `상태가 ${newStatus}로 변경되었습니다.` }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, message: error.message }
    }

    return {
      success: false,
      message: '상태 변경 중 예기치 못한 오류가 발생했습니다.',
    }
  }
}

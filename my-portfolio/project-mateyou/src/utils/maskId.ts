/**
 * ID를 마스킹 처리합니다.
 * 예: "abc12345678" -> "abc*****678"
 */
export const maskId = (id: string): string => {
  if (!id) return ''
  if (id.length <= 7) {
    return '*'.repeat(id.length)
  }

  const start = id.slice(0, 3)
  const end = id.slice(-4)
  const middle = '*'.repeat(id.length - 7)

  return `${start}${middle}${end}`
}

/**
 * 전화번호를 마스킹 처리합니다.
 * 예: "010-1234-5678" -> "010-****-5678"
 * 예: "01012345678" -> "010****5678"
 */
export const maskPhoneNumber = (phone: string): string => {
  if (!phone) return ''

  // 하이픈 제거
  const cleaned = phone.replace(/[^0-9]/g, '')

  if (cleaned.length < 10) {
    return phone // 너무 짧으면 원본 반환
  }

  // 010-XXXX-1234 형식으로 마스킹
  const prefix = cleaned.slice(0, 3)
  const suffix = cleaned.slice(-4)
  const masked = '*'.repeat(cleaned.length - 7)

  // 원본에 하이픈이 있었다면 하이픈 포함하여 반환
  if (phone.includes('-')) {
    return `${prefix}-${masked}-${suffix}`
  }

  return `${prefix}${masked}${suffix}`
}

/**
 * 이메일을 마스킹 처리합니다.
 * 예: "example@email.com" -> "ex*****@email.com"
 */
export const maskEmail = (email: string): string => {
  if (!email || !email.includes('@')) return email

  const [localPart, domain] = email.split('@')

  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`
  }

  const visibleStart = localPart.slice(0, 2)
  const masked = '*'.repeat(Math.min(localPart.length - 2, 5))

  return `${visibleStart}${masked}@${domain}`
}

/**
 * 계좌번호를 마스킹 처리합니다.
 * 예: "110-123-456789" -> "110-***-***789"
 * 예: "1234567890123" -> "123*******0123"
 */
export const maskAccountNumber = (accountNumber: string): string => {
  if (!accountNumber) return ''

  // 하이픈 제거
  const cleaned = accountNumber.replace(/[^0-9]/g, '')

  if (cleaned.length < 8) {
    return '*'.repeat(accountNumber.length)
  }

  const start = cleaned.slice(0, 3)
  const end = cleaned.slice(-4)
  const masked = '*'.repeat(cleaned.length - 7)

  // 원본에 하이픈이 있었다면 하이픈 유지
  if (accountNumber.includes('-')) {
    const parts = accountNumber.split('-')
    if (parts.length === 3) {
      return `${parts[0]}-${'*'.repeat(parts[1].length)}-${'*'.repeat(parts[2].length - 3)}${parts[2].slice(-3)}`
    }
  }

  return `${start}${masked}${end}`
}

/**
 * 이름을 마스킹 처리합니다.
 * 예: "홍길동" -> "홍*동"
 * 예: "김철수" -> "김*수"
 * 예: "John Doe" -> "J*** D**"
 */
export const maskName = (name: string): string => {
  if (!name) return ''

  // 1글자면 그대로 반환
  if (name.length <= 1) return name

  // 한글 이름 (2-4자)
  if (/^[가-힣]+$/.test(name)) {
    if (name.length === 2) {
      return `${name[0]}*`
    }
    const first = name[0]
    const last = name[name.length - 1]
    const middle = '*'.repeat(name.length - 2)
    return `${first}${middle}${last}`
  }

  // 영문 이름 (공백으로 구분)
  if (name.includes(' ')) {
    return name.split(' ').map(part => {
      if (part.length <= 1) return part
      return `${part[0]}${'*'.repeat(Math.min(part.length - 1, 3))}`
    }).join(' ')
  }

  // 기타 (첫 글자만 보이고 나머지 마스킹)
  return `${name[0]}${'*'.repeat(Math.min(name.length - 1, 5))}`
}

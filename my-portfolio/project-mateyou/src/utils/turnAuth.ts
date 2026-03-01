import CryptoJS from 'crypto-js'

/**
 * TURN 서버용 HMAC 기반 동적 인증 정보 생성
 * @param secret - coturn의 static-auth-secret 값 (환경변수에서 가져옴)
 * @returns {username, credential} - 1시간 유효한 TURN 인증 정보
 */
export function generateTurnCredentials(secret: string) {
  // username = 만료시간 기준 timestamp (현재 시간 + 1시간)
  const unixTime = Math.floor(Date.now() / 1000) + 3600
  const username = `${unixTime}`

  // credential = Base64(HMAC-SHA1(username, secret))
  const credential = CryptoJS.HmacSHA1(username, secret).toString(CryptoJS.enc.Base64)

  return { username, credential }
}

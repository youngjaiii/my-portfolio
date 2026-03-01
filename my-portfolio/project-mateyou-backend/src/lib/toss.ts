import crypto from "crypto";
import * as jose from "jose";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * 토스페이먼츠 지급대행용 보안 키 가져오기
 * 환경 변수 우선순위:
 * - TOSS_API_PROD_SECURITY_KEY (프로덕션)
 * - TOSS_API_DEV_SECURITY_KEY (개발)
 * - TOSS_SECURITY_KEY (하위 호환)
 */
export function getTossSecurityKey(isProduction?: boolean): { key: string | undefined; source: string; isProd: boolean } {
  let isLocal: boolean;
  let key: string | undefined;
  let source = 'unknown';
  
  if (isProduction !== undefined) {
    // 명시적으로 환경이 지정된 경우
    isLocal = !isProduction;
    if (isProduction) {
      key = process.env.TOSS_API_PROD_SECURITY_KEY || process.env.TOSS_SECURITY_KEY;
      source = key === process.env.TOSS_API_PROD_SECURITY_KEY ? 'TOSS_API_PROD_SECURITY_KEY' : 'TOSS_SECURITY_KEY';
    } else {
      key = process.env.TOSS_API_DEV_SECURITY_KEY || process.env.TOSS_SECURITY_KEY;
      source = key === process.env.TOSS_API_DEV_SECURITY_KEY ? 'TOSS_API_DEV_SECURITY_KEY' : 'TOSS_SECURITY_KEY';
    }
  } else {
    // 환경이 지정되지 않은 경우 기본 로직 사용
    const nodeEnv = process.env.NODE_ENV || 'production';
    isLocal = ['local', 'development', 'dev', 'test'].includes(nodeEnv.toLowerCase());
    
    key = isLocal
      ? (process.env.TOSS_API_DEV_SECURITY_KEY || process.env.TOSS_SECURITY_KEY)
      : (process.env.TOSS_API_PROD_SECURITY_KEY || process.env.TOSS_SECURITY_KEY);
    
    if (key === process.env.TOSS_API_PROD_SECURITY_KEY) {
      source = 'TOSS_API_PROD_SECURITY_KEY';
    } else if (key === process.env.TOSS_API_DEV_SECURITY_KEY) {
      source = 'TOSS_API_DEV_SECURITY_KEY';
    } else if (key === process.env.TOSS_SECURITY_KEY) {
      source = 'TOSS_SECURITY_KEY';
    }
  }
  
  if (!key) {
    console.error("❌ Toss Payments security key not found. Checked env vars:", {
      NODE_ENV: process.env.NODE_ENV || 'production',
      isLocal,
      isProduction: isProduction !== undefined ? isProduction : !isLocal,
      TOSS_API_PROD_SECURITY_KEY: process.env.TOSS_API_PROD_SECURITY_KEY ? `[${process.env.TOSS_API_PROD_SECURITY_KEY.length} chars]` : 'not set',
      TOSS_API_DEV_SECURITY_KEY: process.env.TOSS_API_DEV_SECURITY_KEY ? `[${process.env.TOSS_API_DEV_SECURITY_KEY.length} chars]` : 'not set',
      TOSS_SECURITY_KEY: process.env.TOSS_SECURITY_KEY ? `[${process.env.TOSS_SECURITY_KEY.length} chars]` : 'not set',
    });
  } else {
    console.log(`✅ Toss security key found (${isLocal ? 'DEV' : 'PROD'}, ${key.length} chars, source: ${source})`);
  }
  
  return { key, source, isProd: !isLocal };
}

/**
 * Python 스크립트 실행 헬퍼 함수
 */
function runPythonScript(input: string, scriptPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", [scriptPath]);
    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("error", (error) => {
      reject(new Error(`Python 실행 실패: ${error.message}`));
    });

    python.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python 스크립트 종료 코드: ${code}, stderr: ${stderr}`));
      } else {
        if (stderr) {
          console.error("⚠️  Python script stderr:", stderr);
        }
        resolve(stdout);
      }
    });

    // stdin으로 입력 전달
    python.stdin.write(input);
    python.stdin.end();
  });
}

/**
 * Python을 사용하여 Toss Payments 암호화 (Python authlib.jose 사용)
 * 
 * @param payload 암호화할 객체
 * @param securityKey 보안 키 (16진수 문자열)
 * @returns JWE 암호화된 문자열
 */
async function encryptPayloadWithPython(payload: object, securityKey: string): Promise<string> {
  try {
    const scriptPath = join(process.cwd(), "scripts", "toss-encrypt.py");
    const input = JSON.stringify({ action: "encrypt", payload, securityKey });
    
    // Python 스크립트 실행
    const stdout = await runPythonScript(input, scriptPath);
    const result = JSON.parse(stdout);
    
    if (!result.success) {
      throw new Error(result.error || "Python encryption failed");
    }
    
    return result.encrypted;
  } catch (error: any) {
    console.error("❌ Python encryption error:", error);
    throw new Error(`Python 암호화 실패: ${error.message}`);
  }
}

/**
 * Python을 사용하여 Toss Payments 복호화 (Python authlib.jose 사용)
 * 
 * @param encrypted JWE 암호화된 문자열
 * @param securityKey 보안 키 (16진수 문자열)
 * @returns 복호화된 객체
 */
async function decryptPayloadWithPython(encrypted: string, securityKey: string): Promise<any> {
  try {
    const scriptPath = join(process.cwd(), "scripts", "toss-encrypt.py");
    const input = JSON.stringify({ action: "decrypt", encrypted, securityKey });
    
    // Python 스크립트 실행
    const stdout = await runPythonScript(input, scriptPath);
    const result = JSON.parse(stdout);
    
    if (!result.success) {
      throw new Error(result.error || "Python decryption failed");
    }
    
    return result.decrypted;
  } catch (error: any) {
    console.error("❌ Python decryption error:", error);
    throw new Error(`Python 복호화 실패: ${error.message}`);
  }
}

/**
 * 토스페이먼츠 지급대행 API용 JWE 암호화
 * 
 * Java 코드와 동일한 방식으로 암호화:
 * - alg: "dir" (Direct Key Agreement)
 * - enc: "A256GCM" (AES-256-GCM)
 * - iat: 현재 시간 (ISO 8601 형식, Asia/Seoul 타임존)
 * - nonce: 랜덤 UUID
 * 
 * @param payload 암호화할 객체
 * @param usePython Python을 사용하여 암호화할지 여부 (기본값: false, 환경변수 TOSS_USE_PYTHON_ENCRYPTION=true로 설정 가능)
 * @returns JWE 암호화된 문자열
 * 
 * 참고: https://docs.tosspayments.com/guides/v2/payouts#encryption-%EB%B3%B4%EC%95%88
 */
export async function encryptPayload(payload: object, usePython?: boolean, isProduction?: boolean): Promise<string> {
  // 환경변수로 Python 사용 여부 확인
  const shouldUsePython = usePython !== undefined 
    ? usePython 
    : process.env.TOSS_USE_PYTHON_ENCRYPTION === "true";
  
  if (shouldUsePython) {
    const { key: securityKey, source, isProd } = getTossSecurityKey(isProduction);
    if (!securityKey) {
      throw new Error("Toss Payments security key not found. Please set TOSS_API_PROD_SECURITY_KEY or TOSS_API_DEV_SECURITY_KEY");
    }
    
    console.log(`🐍 Using Python for encryption (authlib.jose) - Key: ${source}, isProd: ${isProd}`);
    return await encryptPayloadWithPython(payload, securityKey);
  }
  
  // 기존 Node.js 방식
  const { key: securityKey, source, isProd } = getTossSecurityKey(isProduction);
  if (!securityKey) {
    throw new Error("Toss Payments security key not found. Please set TOSS_API_PROD_SECURITY_KEY or TOSS_API_DEV_SECURITY_KEY");
  }
  
  console.log(`🔑 Using security key - Source: ${source}, isProd: ${isProd}, length: ${securityKey.length}`);

  // 16진수 문자열을 바이트 배열로 변환
  const keyBytes = Buffer.from(securityKey, "hex");
  const key = crypto.createSecretKey(keyBytes);

  // 현재 시간 (Asia/Seoul 타임존, ISO 8601 형식)
  // Toss Payments formatIssuedAt 함수와 동일한 방식
  // 예: "2025-11-20T01:42:48.009+09:00"
  const now = new Date();
  const korOffsetMinutes = 9 * 60; // 9시간 = 540분
  const local = new Date(now.getTime() + korOffsetMinutes * 60 * 1000);
  
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  const seconds = String(local.getUTCSeconds()).padStart(2, '0');
  const millis = String(local.getUTCMilliseconds()).padStart(3, '0');
  
  const offsetHours = String(Math.trunc(korOffsetMinutes / 60)).padStart(2, '0');
  const offsetMinutes = String(Math.abs(korOffsetMinutes % 60)).padStart(2, '0');
  const sign = korOffsetMinutes >= 0 ? '+' : '-';
  
  const iat = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetMinutes}`;

  // 랜덤 UUID 생성
  const nonce = randomUUID();

  // JWE 헤더 생성 (iat와 nonce를 커스텀 파라미터로 추가)
  const jwe = await new jose.CompactEncrypt(encoder.encode(JSON.stringify(payload)))
    .setProtectedHeader({
      alg: "dir",
      enc: "A256GCM",
      iat: iat,
      nonce: nonce,
    })
    .encrypt(key);

  return jwe;
}

/**
 * 토스페이먼츠 지급대행 API 응답 복호화
 * 
 * Python 코드 참고:
 * ```python
 * def decrypt(encrypted, securityKey):
 *   key = binascii.unhexlify(securityKey)
 *   jwe = JsonWebEncryption()
 *   decrypted = jwe.deserialize_compact(encrypted, key)
 *   return json.loads(decrypted.decode('utf-8'))
 * ```
 * 
 * @param encrypted JWE 암호화된 문자열
 * @param isProduction 프로덕션 환경 여부 (선택, 없으면 NODE_ENV로 판단)
 * @returns 복호화된 객체
 */
export async function decryptPayload(encrypted: string, isProduction?: boolean, usePython?: boolean): Promise<any> {
  // 환경에 맞는 보안 키 가져오기
  const { key: securityKey, source, isProd } = getTossSecurityKey(isProduction);
  
  if (!securityKey) {
    throw new Error("Toss Payments security key not found. Please set TOSS_API_PROD_SECURITY_KEY or TOSS_API_DEV_SECURITY_KEY");
  }
  
  console.log(`🔑 Using security key for decryption - Source: ${source}, isProd: ${isProd}, length: ${securityKey.length}`);

  // Python 복호화 사용 여부 확인
  const shouldUsePython = usePython !== undefined 
    ? usePython 
    : process.env.TOSS_USE_PYTHON_ENCRYPTION === "true";
  
  if (shouldUsePython) {
    console.log("🐍 Using Python for decryption (authlib.jose)");
    return await decryptPayloadWithPython(encrypted, securityKey);
  }

  try {
    // 16진수 문자열을 바이트 배열로 변환 (Python의 binascii.unhexlify와 동일)
    const keyBytes = Buffer.from(securityKey, "hex");
    
    // 키 길이 검증 (AES-256-GCM은 32바이트 키 필요)
    if (keyBytes.length !== 32) {
      throw new Error(`Invalid security key length: expected 32 bytes (64 hex chars), got ${keyBytes.length} bytes (${securityKey.length} hex chars)`);
    }
    
    const key = crypto.createSecretKey(keyBytes);

    // JWE 복호화 (Python의 deserialize_compact와 동일)
    const { plaintext } = await jose.compactDecrypt(encrypted.trim(), key);
    
    // UTF-8로 디코딩 후 JSON 파싱 (Python의 decode('utf-8')와 json.loads와 동일)
    const decryptedText = decoder.decode(plaintext);
    return JSON.parse(decryptedText);
  } catch (error: any) {
    console.error("❌ Toss decryptPayload error:", {
      error: error.message,
      errorName: error.name,
      encryptedLength: encrypted?.length,
      encryptedPreview: encrypted?.substring(0, 100),
      securityKeyLength: securityKey?.length,
    });
    throw new Error(`복호화 실패: ${error.message}`);
  }
}

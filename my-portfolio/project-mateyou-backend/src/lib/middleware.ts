import cors from "cors";
import { NextFunction, Request, Response } from "express";
import { errorResponse, getAuthUser } from "./utils";

// 공개 엔드포인트 목록 (인증 불필요)
const PUBLIC_ENDPOINTS = [
  // 테스트 엔드포인트
  { method: "GET", path: "/api/test/health" },
  { method: "GET", path: "/api/test/ping" },
  { method: "POST", path: "/api/test/echo" },
  { method: "GET", path: "/api/test/error" },
  { method: "GET", path: "/api/test/env" },
  { method: "GET", path: "/api/test/time" },

  // 공개 배너
  { method: "GET", path: "/api/banners" },
  { method: "GET", path: "/api/admin/public/banners" },

  // 공개 랭킹
  { method: "GET", path: "/api/rankings" },

  // 공개 파트너 정보
  { method: "GET", path: "/api/partners/details/:memberCode" },
  { method: "GET", path: "/api/partners/list" },
  { method: "GET", path: "/api/partners/recent" },
  { method: "GET", path: "/api/partners/home" },
  { method: "GET", path: "/api/partners/jobs/:memberId" },

  // Swagger 문서
  { method: "GET", path: "/docs" },
  { method: "GET", path: "/docs/*" },
  { method: "GET", path: "/api-docs" },
  { method: "GET", path: "/swagger.json" },

  // 푸시 큐 처리 (시스템 레벨)
  { method: "POST", path: "/api/push/process" },

  // OPTIONS 요청 (CORS preflight)
  { method: "OPTIONS", path: "*" },

  // 동영상 압축 (대용량 파일 업로드)
  { method: "POST", path: "/api/video/compress" },
  { method: "GET", path: "/api/video/health" },

  // 앨범 썸네일 생성 (Edge Function에서 호출)
  { method: "POST", path: "/api/albums/generate-thumbnail" },
  { method: "POST", path: "/api/albums/update-thumbnail-from-post" },
];

// 경로 패턴 매칭 함수
const matchesPath = (pattern: string, actualPath: string): boolean => {
  // 정확한 매칭
  if (pattern === actualPath || pattern === "*") {
    return true;
  }

  // 와일드카드 패턴 (예: /docs/*)
  if (pattern.endsWith("/*")) {
    const basePath = pattern.slice(0, -2);
    return actualPath === basePath || actualPath.startsWith(basePath + "/");
  }

  // 파라미터가 있는 경로 매칭 (예: /api/partners/details/:memberCode)
  const patternParts = pattern.split("/");
  const actualParts = actualPath.split("/");

  if (patternParts.length !== actualParts.length) {
    return false;
  }

  return patternParts.every((part, index) => {
    return part === actualParts[index] || part.startsWith(":");
  });
};

// 공개 엔드포인트인지 확인
const isPublicEndpoint = (method: string, path: string): boolean => {
  return PUBLIC_ENDPOINTS.some(
    (endpoint) => endpoint.method === method && matchesPath(endpoint.path, path)
  );
};

// 전역 인증 미들웨어
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 공개 엔드포인트는 인증 스킵
  if (isPublicEndpoint(req.method, req.path)) {
    return next();
  }

  try {
    // 인증 토큰 검증
    const user = await getAuthUser(req);

    // 사용자 정보를 request에 저장
    req.user = user;

    next();
  } catch (error: any) {
    // 디버깅을 위한 로그
    console.error(
      `[Auth Middleware] ${req.method} ${req.path}:`,
      error.message
    );

    if (
      error.message.includes("authorization") ||
      error.message.includes("token") ||
      error.message.includes("No authorization header") ||
      error.message.includes("Invalid token") ||
      error.message.includes("Empty token")
    ) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "Authentication required. Please provide a valid token in the Authorization header.",
        {
          hint: "Include 'Authorization: Bearer <your-token>' in your request headers",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        },
        401
      );
    }

    return errorResponse(
      res,
      "AUTH_ERROR",
      "Authentication failed",
      process.env.NODE_ENV === "development" ? error.message : undefined,
      401
    );
  }
};

// CORS 허용 도메인 목록 가져오기
const getAllowedOrigins = (): string[] => {
  // 기본 허용 도메인 목록 (개발 환경 + 프로덕션)
  const defaultOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "https://mateyou.me",
    "https://www.mateyou.me",
    "https://develop.mateyou.me",
    "http://mateyou.peo.kr",
    "https://mateyou.peo.kr",
    // Capacitor/Ionic 모바일 앱 지원
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://localhost",
    // 스트리밍 개발용 도메인
    "http://mateyou.peo.kr",
    "https://mateyou.peo.kr",
  ];

  // 환경변수에 허용된 도메인 목록이 있으면 사용
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [];

  return [...defaultOrigins, ...allowedOrigins];
};

// CORS 설정 미들웨어 (환경변수로 허용 도메인 관리)
export const corsMiddleware = cors({
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    const allowedOrigins = getAllowedOrigins();

    // 개발 환경이거나 "*"가 포함되어 있으면 모든 도메인 허용
    if (
      process.env.NODE_ENV === "development" ||
      allowedOrigins.includes("*")
    ) {
      return callback(null, true);
    }

    // origin이 없으면 (같은 도메인에서의 요청, Postman 등) 허용
    if (!origin) {
      return callback(null, true);
    }

    // Capacitor/Ionic 앱의 커스텀 스킴 허용 (capacitor://, ionic://)
    if (origin.startsWith("capacitor://") || origin.startsWith("ionic://")) {
      return callback(null, true);
    }

    // 허용된 도메인인지 확인
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // 개발 환경이 아닐 때는 경고만 출력하고 허용하지 않음
      console.warn(`⚠️  CORS: Origin "${origin}" is not allowed`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-client-info",
    "apikey",
    "x-is-production", // 프론트엔드에서 환경 정보 전달
  ],
  preflightContinue: false, // OPTIONS 요청을 자동으로 처리
  optionsSuccessStatus: 200, // OPTIONS 요청 성공 상태 코드
});

import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { ApiResponse } from "../types/index";

// Initialize Supabase client for server-side usage
export const createSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Supabase configuration missing:");
    console.error("   SUPABASE_URL:", supabaseUrl ? "✅ set" : "❌ missing");
    console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✅ set" : "❌ missing");
    throw new Error("Supabase configuration is missing. Check environment variables.");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// Success response helper
export const successResponse = <T>(res: Response, data: T, meta?: any) => {
  const response: ApiResponse<T> = { success: true, data };
  if (meta) response.meta = meta;

  return res.status(200).json(response);
};

// Error response helper
export const errorResponse = (
  res: Response,
  code: string,
  message: string,
  details?: any,
  status: number = 400
) => {
  const response: ApiResponse = {
    success: false,
    error: { code, message, details },
  };

  return res.status(status).json(response);
};

// Auth helper - get user from JWT token
export const getAuthUser = async (req: Request) => {
  // 전역 미들웨어에서 이미 인증된 경우 req.user 사용
  if (req.user) {
    return req.user;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log("❌ No authorization header found");
    throw new Error("No authorization header");
  }

  // Bearer 토큰 형식 확인
  if (!authHeader.startsWith("Bearer ")) {
    console.log("❌ Invalid authorization header format:", authHeader.substring(0, 20) + "...");
    throw new Error("Invalid authorization header format. Expected 'Bearer <token>'");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  
  if (!token) {
    console.log("❌ Empty token after Bearer prefix");
    throw new Error("Empty token");
  }

  // Use anon key for token validation instead of service key
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ Supabase configuration missing");
    throw new Error("Server configuration error");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("❌ Supabase auth error:", error.message, error.status);
    throw new Error(`Invalid token: ${error.message}`);
  }

  if (!user) {
    console.error("❌ No user found from token");
    throw new Error("Invalid token: User not found");
  }

  return user;
};

// Name masking utility
export const maskName = (name: string | null): string => {
  if (!name) return "익명***";

  if (name.length <= 2) {
    return name[0] + "*".repeat(Math.max(1, name.length - 1));
  } else {
    return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
  }
};

// Async handler wrapper to catch errors
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response) => {
    Promise.resolve(fn(req, res)).catch((error) => {
      console.error("API error:", error);

      // Handle authentication errors
      if (
        error.message.includes("authorization") ||
        error.message.includes("token")
      ) {
        return errorResponse(
          res,
          "UNAUTHORIZED",
          "Authentication required",
          null,
          401
        );
      }

      return errorResponse(
        res,
        "INTERNAL_ERROR",
        "Internal server error",
        error.message,
        500
      );
    });
  };

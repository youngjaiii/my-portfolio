import { Router } from "express";
import { successResponse, errorResponse, asyncHandler } from "../lib/utils";

const router = Router();

// GET /health - Health check
router.get("/health", (req, res) => {
  return successResponse(res, {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// GET /ping - Simple ping
router.get("/ping", (req, res) => {
  return successResponse(res, {
    message: "pong",
    timestamp: Date.now(),
  });
});

// POST /echo - Echo back request body
router.post("/echo", (req, res) => {
  return successResponse(res, {
    message: "Echo test successful",
    received: req.body,
    headers: {
      contentType: req.headers["content-type"],
      userAgent: req.headers["user-agent"],
    },
  });
});

// GET /error - Test error handling
router.get(
  "/error",
  asyncHandler(async (req, res) => {
    throw new Error("This is a test error");
  })
);

// GET /env - Show environment info (without secrets)
router.get("/env", (req, res) => {
  return successResponse(res, {
    nodeVersion: process.version,
    platform: process.platform,
    port: process.env.PORT || 4000,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasVapidKeys: !!(
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ),
  });
});

// GET /time - Current server time
router.get("/time", (req, res) => {
  const now = new Date();
  return successResponse(res, {
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

export default router;

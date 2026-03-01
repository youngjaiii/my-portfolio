import { Router } from "express";
import { successResponse, errorResponse } from "../lib/utils";

const router = Router();

// GET / - Get active banners (public endpoint - no auth required)
router.get("/", async (req, res) => {
  try {
    // For now, return empty array to test if the endpoint works without database access
    return successResponse(
      res,
      [],
      {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      }
    );
  } catch (error: any) {
    console.error("예상치 못한 오류:", error);
    return errorResponse(
      res,
      "INTERNAL_ERROR",
      "서버 내부 오류가 발생했습니다",
      error.message,
      500
    );
  }
});

export default router;

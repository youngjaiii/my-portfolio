import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
  maskName,
} from "../lib/utils";

const router = Router();

/**
 * @swagger
 * /api/reviews/submit:
 *   post:
 *     summary: 리뷰 작성/수정
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partner_id
 *               - rating
 *             properties:
 *               partner_id:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *               request_id:
 *                 type: string
 *               existing_review_id:
 *                 type: string
 *               points_earned:
 *                 type: integer
 *                 default: 10
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /submit - Submit or update a review
router.post(
  "/submit",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || !body.partner_id || !body.rating) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Partner ID and rating are required"
      );
    }

    const {
      partner_id,
      rating,
      comment,
      request_id,
      existing_review_id,
      points_earned = 10,
    } = body;

    // Validate rating
    if (rating < 1 || rating > 5) {
      return errorResponse(
        res,
        "INVALID_RATING",
        "Rating must be between 1 and 5"
      );
    }

    const supabase = createSupabaseClient();

    try {
      // If request_id is provided, handle review for a specific request
      if (request_id) {
        // Get request details
        const { data: requestData, error: requestError } = await supabase
          .from("partner_requests")
          .select("client_id, partner_id, total_coins, id")
          .eq("id", request_id)
          .single();

        if (requestError) {
          return errorResponse(
            res,
            "REQUEST_NOT_FOUND",
            "Partner request not found"
          );
        }

        // Check if user is the client who made the request
        if (requestData.client_id !== user.id) {
          return errorResponse(
            res,
            "UNAUTHORIZED",
            "You can only review your own requests",
            null,
            403
          );
        }

        // Look for existing review for this request
        const { data: existingReviews, error: reviewCheckError } =
          await supabase
            .from("reviews")
            .select("id, rating, comment")
            .eq("member_id", requestData.client_id)
            .eq("target_partner_id", requestData.partner_id)
            .eq("points_earned", requestData.total_coins);

        if (reviewCheckError) {
          return errorResponse(
            res,
            "REVIEW_CHECK_ERROR",
            reviewCheckError.message
          );
        }

        // Find review that hasn't been completed yet (null rating/comment)
        const incompleteReview = existingReviews?.find(
          (review) => review.rating === null || review.comment === null
        );

        let reviewResult;

        if (incompleteReview) {
          // Update existing incomplete review
          const { data, error } = await supabase
            .from("reviews")
            .update({
              rating,
              comment: comment?.trim() || null,
            })
            .eq("id", incompleteReview.id)
            .select()
            .single();

          if (error) throw error;
          reviewResult = data;
        } else {
          // Create new review
          const { data, error } = await supabase
            .from("reviews")
            .insert({
              member_id: user.id,
              target_partner_id: requestData.partner_id,
              rating,
              comment: comment?.trim() || null,
              points_earned: requestData.total_coins,
            })
            .select()
            .single();

          if (error) throw error;
          reviewResult = data;
        }

        return successResponse(res, {
          review: reviewResult,
          message: "Review submitted successfully for request",
        });
      }

      // If existing_review_id is provided, update existing review
      if (existing_review_id) {
        // Verify user owns this review
        const { data: existingReview, error: checkError } = await supabase
          .from("reviews")
          .select("member_id")
          .eq("id", existing_review_id)
          .single();

        if (checkError) {
          return errorResponse(res, "REVIEW_NOT_FOUND", "Review not found");
        }

        if (existingReview.member_id !== user.id) {
          return errorResponse(
            res,
            "UNAUTHORIZED",
            "You can only edit your own reviews",
            null,
            403
          );
        }

        const { data: updatedReview, error: updateError } = await supabase
          .from("reviews")
          .update({
            rating,
            comment: comment?.trim() || null,
          })
          .eq("id", existing_review_id)
          .select()
          .single();

        if (updateError) throw updateError;

        return successResponse(res, {
          review: updatedReview,
          message: "Review updated successfully",
        });
      }

      // Manual review creation (fallback case)
      const { data: newReview, error: createError } = await supabase
        .from("reviews")
        .insert({
          member_id: user.id,
          target_partner_id: partner_id,
          rating,
          comment: comment?.trim() || null,
          points_earned,
        })
        .select()
        .single();

      if (createError) throw createError;

      return successResponse(res, {
        review: newReview,
        message: "Review created successfully",
      });
    } catch (error: any) {
      console.error("Review submission error:", error);
      return errorResponse(
        res,
        "REVIEW_ERROR",
        "Failed to submit review",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/reviews/partner/{partnerId}:
 *   get:
 *     summary: 파트너의 리뷰 목록 조회
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /partner/:partnerId - Get reviews for a partner
router.get(
  "/partner/:partnerId",
  asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "10");
    const offset = (page - 1) * limit;

    if (!partnerId) {
      return errorResponse(
        res,
        "INVALID_PARTNER_ID",
        "Partner ID is required"
      );
    }

    const supabase = createSupabaseClient();

    try {
      // Get reviews with reviewer information
      const {
        data: reviews,
        error: reviewsError,
        count,
      } = await supabase
        .from("reviews")
        .select(
          `
            id, rating, comment, points_earned, created_at, member_id,
            members!member_id(name)
          `,
          { count: "exact" }
        )
        .eq("target_partner_id", partnerId)
        .gt("rating", 0) // Only show completed reviews
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (reviewsError) throw reviewsError;

      // Mask reviewer names for privacy
      const reviewsWithMaskedNames = (reviews || []).map((review) => ({
        ...review,
        reviewer_name: maskName((review.members as any)?.name),
        members: undefined, // Remove full member data
      }));

      // Calculate review statistics
      const totalReviews = count || 0;
      let averageRating = 0;
      let ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      if (reviews && reviews.length > 0) {
        const totalRating = reviews.reduce(
          (sum, review) => sum + review.rating,
          0
        );
        averageRating = totalRating / reviews.length;

        // Calculate rating distribution
        reviews.forEach((review) => {
          if (review.rating >= 1 && review.rating <= 5) {
            ratingDistribution[
              review.rating as keyof typeof ratingDistribution
            ]++;
          }
        });
      }

      return successResponse(
        res,
        {
          reviews: reviewsWithMaskedNames,
          stats: {
            totalReviews,
            averageRating: parseFloat(averageRating.toFixed(1)),
            ratingDistribution,
          },
        },
        {
          total: totalReviews,
          page,
          limit,
        }
      );
    } catch (error: any) {
      return errorResponse(
        res,
        "REVIEWS_FETCH_ERROR",
        "Failed to fetch reviews",
        error.message
      );
    }
  })
);

// GET /my-reviews - Get current user's reviews
router.get(
  "/my-reviews",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "10");
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    try {
      const {
        data: reviews,
        error: reviewsError,
        count,
      } = await supabase
        .from("reviews")
        .select(
          `
            id, rating, comment, points_earned, created_at, target_partner_id,
            partners!target_partner_id(
              partner_name,
              members!member_id(name, profile_image)
            )
          `,
          { count: "exact" }
        )
        .eq("member_id", user.id)
        .gt("rating", 0) // Only show completed reviews
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (reviewsError) throw reviewsError;

      return successResponse(res, reviews || [], {
        total: count || 0,
        page,
        limit,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "MY_REVIEWS_ERROR",
        "Failed to fetch your reviews",
        error.message
      );
    }
  })
);

// GET /incomplete - Get incomplete reviews for current user
router.get(
  "/incomplete",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    try {
      const { data: incompleteReviews, error: reviewsError } = await supabase
        .from("reviews")
        .select(
          `
            id, points_earned, created_at, target_partner_id,
            partners!target_partner_id(
              id, partner_name,
              members!member_id(name, profile_image, member_code)
            )
          `
        )
        .eq("member_id", user.id)
        .is("rating", null)
        .is("comment", null)
        .order("created_at", { ascending: false });

      if (reviewsError) throw reviewsError;

      return successResponse(res, incompleteReviews || []);
    } catch (error: any) {
      return errorResponse(
        res,
        "INCOMPLETE_REVIEWS_ERROR",
        "Failed to fetch incomplete reviews",
        error.message
      );
    }
  })
);

// DELETE /:reviewId - Delete a review
router.delete(
  "/:reviewId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { reviewId } = req.params;

    if (!reviewId) {
      return errorResponse(res, "INVALID_REVIEW_ID", "Review ID is required");
    }

    const supabase = createSupabaseClient();

    try {
      // Verify user owns this review
      const { data: review, error: checkError } = await supabase
        .from("reviews")
        .select("member_id")
        .eq("id", reviewId)
        .single();

      if (checkError) {
        if (checkError.code === "PGRST116") {
          return errorResponse(res, "REVIEW_NOT_FOUND", "Review not found");
        }
        throw checkError;
      }

      if (review.member_id !== user.id) {
        return errorResponse(
          res,
          "UNAUTHORIZED",
          "You can only delete your own reviews",
          null,
          403
        );
      }

      const { error: deleteError } = await supabase
        .from("reviews")
        .delete()
        .eq("id", reviewId);

      if (deleteError) throw deleteError;

      return successResponse(res, {
        message: "Review deleted successfully",
        reviewId,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "DELETE_REVIEW_ERROR",
        "Failed to delete review",
        error.message
      );
    }
  })
);

export default router;

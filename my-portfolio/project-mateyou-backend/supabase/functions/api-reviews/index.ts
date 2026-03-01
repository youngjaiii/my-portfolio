import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';
import type { Review } from '../_shared/types.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // POST /api-reviews/submit - Submit or update a review
    if (pathname === '/api-reviews/submit' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id || !body.rating) {
        return errorResponse('INVALID_BODY', 'Partner ID and rating are required');
      }

      const {
        partner_id,
        rating,
        comment,
        request_id,
        existing_review_id,
        points_earned = 10
      } = body;

      // Validate rating
      if (rating < 1 || rating > 5) {
        return errorResponse('INVALID_RATING', 'Rating must be between 1 and 5');
      }

      try {
        // If request_id is provided, handle review for a specific request
        if (request_id) {
          // Get request details
          const { data: requestData, error: requestError } = await supabase
            .from('partner_requests')
            .select('client_id, partner_id, total_coins, id')
            .eq('id', request_id)
            .single();

          if (requestError) {
            return errorResponse('REQUEST_NOT_FOUND', 'Partner request not found');
          }

          // Check if user is the client who made the request
          if (requestData.client_id !== user.id) {
            return errorResponse('UNAUTHORIZED', 'You can only review your own requests', null, 403);
          }

          // Look for existing review for this request
          const { data: existingReviews, error: reviewCheckError } = await supabase
            .from('reviews')
            .select('id, rating, comment')
            .eq('member_id', requestData.client_id)
            .eq('target_partner_id', requestData.partner_id)
            .eq('points_earned', requestData.total_coins);

          if (reviewCheckError) {
            return errorResponse('REVIEW_CHECK_ERROR', reviewCheckError.message);
          }

          // Find review that hasn't been completed yet (null rating/comment)
          const incompleteReview = existingReviews?.find(review =>
            review.rating === null || review.comment === null
          );

          let reviewResult;

          if (incompleteReview) {
            // Update existing incomplete review (updated_at 제거)
            const { data, error } = await supabase
              .from('reviews')
              .update({
                rating,
                comment: comment?.trim() || null,
                // updated_at: new Date().toISOString(), // 컬럼이 없어서 제거
              })
              .eq('id', incompleteReview.id)
              .select()
              .single();

            if (error) throw error;
            reviewResult = data;
          } else {
            // Create new review
            const { data, error } = await supabase
              .from('reviews')
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

          // Mark request as reviewed (jobs 테이블 업데이트 제거 - 테이블 구조 확인 필요)
          // await supabase
          //   .from('jobs')
          //   .update({ is_reviewed: true })
          //   .eq('request_id', request_id);

          return successResponse({
            review: reviewResult,
            message: 'Review submitted successfully for request',
          });
        }

        // If existing_review_id is provided, update existing review
        if (existing_review_id) {
          // Verify user owns this review
          const { data: existingReview, error: checkError } = await supabase
            .from('reviews')
            .select('member_id')
            .eq('id', existing_review_id)
            .single();

          if (checkError) {
            return errorResponse('REVIEW_NOT_FOUND', 'Review not found');
          }

          if (existingReview.member_id !== user.id) {
            return errorResponse('UNAUTHORIZED', 'You can only edit your own reviews', null, 403);
          }

          const { data: updatedReview, error: updateError } = await supabase
            .from('reviews')
            .update({
              rating,
              comment: comment?.trim() || null,
              // updated_at: new Date().toISOString(), // 컬럼이 없어서 제거
            })
            .eq('id', existing_review_id)
            .select()
            .single();

          if (updateError) throw updateError;

          return successResponse({
            review: updatedReview,
            message: 'Review updated successfully',
          });
        }

        // Manual review creation (fallback case)
        const { data: newReview, error: createError } = await supabase
          .from('reviews')
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

        return successResponse({
          review: newReview,
          message: 'Review created successfully',
        });

      } catch (error) {
        console.error('Review submission error:', error);
        return errorResponse('REVIEW_ERROR', 'Failed to submit review', error.message);
      }
    }

    // GET /api-reviews/partner/{partnerId} - Get reviews for a partner
    if (pathname.includes('/partner/') && req.method === 'GET') {
      const partnerId = pathname.split('/partner/')[1];
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '10');
      const offset = (page - 1) * limit;

      if (!partnerId) {
        return errorResponse('INVALID_PARTNER_ID', 'Partner ID is required');
      }

      try {
        // Get reviews with reviewer information
        const { data: reviews, error: reviewsError, count } = await supabase
          .from('reviews')
          .select(`
            id, rating, comment, points_earned, created_at, member_id,
            members!member_id(name)
          `, { count: 'exact' })
          .eq('target_partner_id', partnerId)
          .gt('rating', 0) // Only show completed reviews
          .order('created_at', { ascending: false })
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
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          averageRating = totalRating / reviews.length;

          // Calculate rating distribution
          reviews.forEach(review => {
            if (review.rating >= 1 && review.rating <= 5) {
              ratingDistribution[review.rating as keyof typeof ratingDistribution]++;
            }
          });
        }

        return successResponse({
          reviews: reviewsWithMaskedNames,
          stats: {
            totalReviews,
            averageRating: parseFloat(averageRating.toFixed(1)),
            ratingDistribution,
          }
        }, {
          total: totalReviews,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('REVIEWS_FETCH_ERROR', 'Failed to fetch reviews', error.message);
      }
    }

    // GET /api-reviews/my-reviews - Get current user's reviews
    if (pathname === '/api-reviews/my-reviews' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '10');
      const offset = (page - 1) * limit;

      try {
        const { data: reviews, error: reviewsError, count } = await supabase
          .from('reviews')
          .select(`
            id, rating, comment, points_earned, created_at, target_partner_id,
            partners!target_partner_id(
              partner_name,
              members!member_id(name, profile_image)
            )
          `, { count: 'exact' })
          .eq('member_id', user.id)
          .gt('rating', 0) // Only show completed reviews
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (reviewsError) throw reviewsError;

        return successResponse(reviews || [], {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('MY_REVIEWS_ERROR', 'Failed to fetch your reviews', error.message);
      }
    }

    // GET /api-reviews/incomplete - Get incomplete reviews for current user
    if (pathname === '/api-reviews/incomplete' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        const { data: incompleteReviews, error: reviewsError } = await supabase
          .from('reviews')
          .select(`
            id, points_earned, created_at, target_partner_id,
            partners!target_partner_id(
              id, partner_name,
              members!member_id(name, profile_image, member_code)
            )
          `)
          .eq('member_id', user.id)
          .is('rating', null)
          .is('comment', null)
          .order('created_at', { ascending: false });

        if (reviewsError) throw reviewsError;

        return successResponse(incompleteReviews || []);

      } catch (error) {
        return errorResponse('INCOMPLETE_REVIEWS_ERROR', 'Failed to fetch incomplete reviews', error.message);
      }
    }

    // DELETE /api-reviews/{reviewId} - Delete a review
    if (pathname.includes('/api-reviews/') && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const reviewId = pathname.split('/api-reviews/')[1];

      if (!reviewId) {
        return errorResponse('INVALID_REVIEW_ID', 'Review ID is required');
      }

      try {
        // Verify user owns this review
        const { data: review, error: checkError } = await supabase
          .from('reviews')
          .select('member_id')
          .eq('id', reviewId)
          .single();

        if (checkError) {
          if (checkError.code === 'PGRST116') {
            return errorResponse('REVIEW_NOT_FOUND', 'Review not found');
          }
          throw checkError;
        }

        if (review.member_id !== user.id) {
          return errorResponse('UNAUTHORIZED', 'You can only delete your own reviews', null, 403);
        }

        const { error: deleteError } = await supabase
          .from('reviews')
          .delete()
          .eq('id', reviewId);

        if (deleteError) throw deleteError;

        return successResponse({
          message: 'Review deleted successfully',
          reviewId,
        });

      } catch (error) {
        return errorResponse('DELETE_REVIEW_ERROR', 'Failed to delete review', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Reviews API error:', error);

    // Handle authentication errors
    if (error.message.includes('authorization') || error.message.includes('token')) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      error.message,
      500
    );
  }
});

// Helper function to mask names (imported from utils would be better)
function maskName(name: string | null): string {
  if (!name) return '익명***';

  if (name.length <= 2) {
    return name[0] + '*'.repeat(Math.max(1, name.length - 1));
  } else {
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  }
}
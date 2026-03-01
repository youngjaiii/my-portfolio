import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";

const router = Router();
const EXPIRY_CANCEL_MESSAGE =
  "의뢰 요청 시간이 만료 되었어요. 1시간 이내에 의뢰를 받아주세요.";

const sendCancellationChat = async (
  supabase: ReturnType<typeof createSupabaseClient>,
  senderId: string,
  receiverId: string,
  message: string
) => {
  if (!senderId || !receiverId || !message) return;

  const { error } = await supabase.from("member_chats").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    message,
    comment_type: "system",
  });

  if (error) {
    console.error("Failed to log cancellation chat:", error);
  }
};

const cancelRequestWithRefund = async (
  supabase: ReturnType<typeof createSupabaseClient>,
  requestId: string,
  requestData: any,
  rawMessage?: string
) => {
  const cancelMessage = "의뢰 요청 시간이 만료 되었어요. 1시간 이내에 의뢰를 받아주세요.";

  const updatePayload = {
    status: "cancelled",
    updated_at: new Date().toISOString(),
    cancelled_at: new Date().toISOString(),
    cancel_message: cancelMessage,
  };

  const { data: updatedRequest, error: updateError } = await supabase
    .from("partner_requests")
    .update(updatePayload)
    .eq("id", requestId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  const totalPoints =
    requestData.total_coins ||
    requestData.coins_per_job * requestData.job_count ||
    0;
  const jobName =
    (requestData.partner_job as any)?.job_name || "서비스";

  let refundNeeded = true;
  const { data: existingLog, error: logCheckError } = await supabase
    .from("member_points_logs")
    .select("id")
    .eq("log_id", requestId)
    .eq("type", "earn")
    .eq(
      "description",
      `${jobName} ${requestData.job_count} request cancellation refund`
    )
    .maybeSingle();

  if (logCheckError) {
    console.error("Error checking refund log:", logCheckError);
    refundNeeded = false;
  } else if (existingLog) {
    refundNeeded = false;
  }

  let pointsRefunded = 0;

  if (refundNeeded && totalPoints > 0) {
    const { error: refundError } = await supabase.rpc(
      "update_member_points_with_log",
      {
        p_member_id: requestData.client_id,
        p_type: "earn",
        p_amount: totalPoints,
        p_description: `${jobName} ${requestData.job_count} request cancellation refund`,
        p_log_id: requestId,
      }
    );

    if (refundError) throw refundError;
    pointsRefunded = totalPoints;
  }

  const receiverId = requestData.partner?.member_id;
  await sendCancellationChat(
    supabase,
    requestData.client_id,
    receiverId,
    cancelMessage
  );

  return { updatedRequest, pointsRefunded };
};
/**
 * @swagger
 * /api/partner-dashboard/jobs:
 *   post:
 *     summary: 파트너 작업 생성
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - job_name
 *               - coins_per_job
 *             properties:
 *               job_name:
 *                 type: string
 *               coins_per_job:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 승인된 파트너만 가능
 */
// POST /jobs - Create new partner job
router.post(
  "/jobs",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { job_name, coins_per_job } = req.body;

    if (!job_name || !coins_per_job) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Job name and coins per job are required"
      );
    }

    const supabase = createSupabaseClient();

    // Get user's partner info
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, partner_status")
      .eq("member_id", user.id)
      .eq("partner_status", "approved")
      .single();

    if (partnerError || !partnerData) {
      return errorResponse(
        res,
        "NOT_APPROVED_PARTNER",
        "You must be an approved partner to create jobs"
      );
    }

    // Create new job
    const { data: newJob, error: createError } = await supabase
      .from("partner_jobs")
      .insert({
        partner_id: partnerData.id,
        job_name: job_name.trim(),
        coins_per_job: coins_per_job,
        is_active: true,
      })
      .select()
      .single();

    if (createError) throw createError;

    return successResponse(res, {
      job: newJob,
      message: "Job created successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/jobs/{jobId}:
 *   put:
 *     summary: 파트너 작업 수정
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               job_name:
 *                 type: string
 *               coins_per_job:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 성공
 */
// PUT /jobs/:jobId - Update partner job
router.put(
  "/jobs/:jobId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { jobId } = req.params;
    const body = req.body;

    if (!jobId) {
      return errorResponse(res, "INVALID_JOB_ID", "Job ID is required");
    }

    if (!body) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    const supabase = createSupabaseClient();

    // Verify user owns this job
    const { data: jobData, error: jobError } = await supabase
      .from("partner_jobs")
      .select(
        `
        id, partner_id,
        partners!partner_id(member_id)
      `
      )
      .eq("id", jobId)
      .single();

    if (jobError) {
      if (jobError.code === "PGRST116") {
        return errorResponse(res, "JOB_NOT_FOUND", "Job not found");
      }
      throw jobError;
    }

    if ((jobData.partners as any).member_id !== user.id) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "You can only update your own jobs",
        null,
        403
      );
    }

    // Update job
    const updateData: any = {};
    if (body.job_name !== undefined) updateData.job_name = body.job_name.trim();
    if (body.coins_per_job !== undefined) updateData.coins_per_job = body.coins_per_job;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const { data: updatedJob, error: updateError } = await supabase
      .from("partner_jobs")
      .update(updateData)
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse(res, {
      job: updatedJob,
      message: "Job updated successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/jobs/{jobId}:
 *   delete:
 *     summary: 파트너 작업 삭제
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// DELETE /jobs/:jobId - Delete partner job
router.delete(
  "/jobs/:jobId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { jobId } = req.params;

    if (!jobId) {
      return errorResponse(res, "INVALID_JOB_ID", "Job ID is required");
    }

    const supabase = createSupabaseClient();

    // Verify user owns this job
    const { data: jobData, error: jobError } = await supabase
      .from("partner_jobs")
      .select(
        `
        id, partner_id,
        partners!partner_id(member_id)
      `
      )
      .eq("id", jobId)
      .single();

    if (jobError) {
      if (jobError.code === "PGRST116") {
        return errorResponse(res, "JOB_NOT_FOUND", "Job not found");
      }
      throw jobError;
    }

    if ((jobData.partners as any).member_id !== user.id) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "You can only delete your own jobs",
        null,
        403
      );
    }

    // Delete job
    const { error: deleteError } = await supabase
      .from("partner_jobs")
      .delete()
      .eq("id", jobId);

    if (deleteError) throw deleteError;

    return successResponse(res, {
      message: "Job deleted successfully",
      jobId,
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/requests:
 *   get:
 *     summary: 파트너 요청 목록 조회
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, cancelled, completed, rejected]
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /requests - Get partner requests
router.get(
  "/requests",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const status = req.query.status as string | undefined;
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    // Get user's partner info
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    // Build query
    let query = supabase
      .from("partner_requests")
      .select(
        `
        *,
        client:members!client_id (
          id,
          name,
          profile_image,
          member_code
        )
      `,
        { count: "exact" }
      )
      .eq("partner_id", partnerData.id);

    // Apply status filter if provided
    if (status) {
      query = query.eq("status", status);
    }

    const {
      data: requests,
      error: requestsError,
      count,
    } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (requestsError) throw requestsError;

    return successResponse(res, requests || [], {
      total: count || 0,
      page,
      limit,
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/requests/{requestId}/status:
 *   put:
 *     summary: 파트너 요청 상태 업데이트
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, cancelled, completed, rejected]
 *               response_message:
 *                 type: string
 *               call_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// PUT /requests/:requestId/status - Update request status
router.put(
  "/requests/:requestId/status",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { requestId } = req.params;
    const { status, response_message, call_id } = req.body;

    if (!requestId) {
      return errorResponse(res, "INVALID_REQUEST_ID", "Request ID is required");
    }

    if (!status) {
      return errorResponse(res, "INVALID_BODY", "Status is required");
    }

    // Validate status
    if (!["pending", "in_progress", "cancelled", "completed", "rejected"].includes(status)) {
      return errorResponse(res, "INVALID_STATUS", "Invalid status value");
    }

    const supabase = createSupabaseClient();

    // Get user's partner info first
    const { data: userPartner, error: userPartnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .single();

    if (userPartnerError) {
      if (userPartnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw userPartnerError;
    }

    // Verify user owns this request
    const { data: requestData, error: requestError } = await supabase
      .from("partner_requests")
      .select("id, partner_id")
      .eq("id", requestId)
      .eq("partner_id", userPartner.id)
      .single();

    if (requestError) {
      if (requestError.code === "PGRST116") {
        return errorResponse(
          res,
          "REQUEST_NOT_FOUND",
          "Request not found or you do not have permission"
        );
      }
      throw requestError;
    }

    // Get full request data for points calculation
    const { data: fullRequestData, error: fullRequestError } = await supabase
      .from("partner_requests")
      .select(
        `
        *,
        partner:partners!partner_requests_partner_id_fkey(member_id),
        partner_job:partner_jobs(job_name),
        client:members(id, name, total_points)
      `
      )
      .eq("id", requestId)
      .single();

    if (fullRequestError) throw fullRequestError;

    // Validate status transitions
    // 승인(in_progress): pending → in_progress만 가능
    // 거절(rejected): pending → rejected만 가능
    // 완료(completed): in_progress → completed만 가능
    // 취소(cancelled): pending 또는 in_progress → cancelled만 가능
    const currentStatus = fullRequestData.status;

    if (status === "in_progress" && currentStatus !== "pending") {
      return errorResponse(
        res,
        "INVALID_STATUS_CHANGE",
        "승인은 대기중(pending) 상태에서만 가능합니다"
      );
    }

    if (status === "rejected" && currentStatus !== "pending") {
      return errorResponse(
        res,
        "INVALID_STATUS_CHANGE",
        "거절은 대기중(pending) 상태에서만 가능합니다"
      );
    }

    if (status === "completed" && currentStatus !== "in_progress") {
      return errorResponse(
        res,
        "INVALID_STATUS_CHANGE",
        "완료는 진행중(in_progress) 상태에서만 가능합니다"
      );
    }

    if (status === "cancelled" && currentStatus !== "pending" && currentStatus !== "in_progress") {
      return errorResponse(
        res,
        "INVALID_STATUS_CHANGE",
        "취소는 대기중(pending) 또는 진행중(in_progress) 상태에서만 가능합니다"
      );
    }

    // Check if points have already been refunded for this request
    // by checking if a log entry with this request ID exists
    // Also check if request is already cancelled to prevent duplicate refunds
    let pointsAlreadyRefunded = false;
    if (status === "cancelled" || status === "rejected") {
      // If already cancelled, don't refund again
      if (fullRequestData.status === "cancelled" || fullRequestData.status === "rejected") {
        pointsAlreadyRefunded = true;
      } else {
        // Check if refund log already exists
        const { data: existingLog, error: logCheckError } = await supabase
          .from("member_points_logs")
          .select("id")
          .eq("log_id", fullRequestData.id)
          .eq("type", "earn")
          .eq("description", `${(fullRequestData.partner_job as any)?.job_name || "Service"} ${fullRequestData.job_count} request cancellation refund`)
          .maybeSingle();

        if (!logCheckError && existingLog) {
          pointsAlreadyRefunded = true;
        }
      }
    }

    // Update request status
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Add call_id if provided (only if status is not cancelled)
    // Once cancelled, the request should not be updated with call_id
    if (call_id && status !== "cancelled") {
      updateData.call_id = call_id;
    }

    let updatedRequest;

    if (status === "cancelled") {
      const cancelMsg =
        (response_message && response_message.trim()) || EXPIRY_CANCEL_MESSAGE;
      const cancelResult = await cancelRequestWithRefund(
        supabase,
        requestId,
        fullRequestData,
        cancelMsg
      );
      updatedRequest = cancelResult.updatedRequest;
    } else {
      const { data, error } = await supabase
        .from("partner_requests")
        .update(updateData)
        .eq("id", requestId)
        .select("*")
        .single();
      if (error) throw error;
      updatedRequest = data;
    }

    // TODO: Push notification implementation
    // Send push notification to client about request status change
    // const clientId = fullRequestData.client_id;
    // const partnerName = fullRequestData.partner?.partner_name || 'Partner';
    // const jobName = (fullRequestData.partner_job as any)?.job_name || 'Service';
    //
    // let notificationTitle = '';
    // let notificationBody = '';
    // let notificationType: 'request' | 'system' = 'request';
    //
    // switch (status) {
    //   case 'in_progress':
    //     notificationTitle = 'Request Accepted!';
    //     notificationBody = `${partnerName} accepted your ${jobName} request.`;
    //     break;
    //   case 'completed':
    //     notificationTitle = 'Request Completed!';
    //     notificationBody = `Your ${jobName} request with ${partnerName} has been completed.`;
    //     notificationType = 'system';
    //     break;
    //   case 'cancelled':
    //     notificationTitle = 'Request Cancelled';
    //     notificationBody = `${partnerName} cancelled your ${jobName} request. Points refunded.`;
    //     notificationType = 'system';
    //     break;
    // }
    //
    // if (notificationTitle && clientId) {
    //   // Send push notification here
    // }

    // Handle points based on request status
    if (status === "completed") {
      // When completed: Only give points to partner (client already paid when requesting)
      const totalPoints =
        fullRequestData.total_coins ||
        fullRequestData.coins_per_job * fullRequestData.job_count;
      const jobName =
        (fullRequestData.partner_job as any)?.job_name || "Service";

      // Update partner total_points
      const { data: currentPartner, error: partnerSelectError } = await supabase
        .from("partners")
        .select("total_points")
        .eq("id", fullRequestData.partner_id)
        .single();

      if (partnerSelectError) throw partnerSelectError;

      const { error: partnerUpdateError } = await supabase
        .from("partners")
        .update({
          total_points: (currentPartner?.total_points || 0) + totalPoints,
        })
        .eq("id", fullRequestData.partner_id);

      if (partnerUpdateError) throw partnerUpdateError;

      // Log partner points earning
      console.log("[PartnerDashboard] Inserting partner_points_logs:", {
        partner_id: fullRequestData.partner_id,
        type: "earn",
        amount: totalPoints,
        description: `${jobName} ${fullRequestData.job_count}회 완료`,
        log_id: fullRequestData.id,
      });
      
      const { data: partnerLogData, error: partnerLogError } = await supabase
        .from("partner_points_logs")
        .insert({
          partner_id: fullRequestData.partner_id,
          type: "earn",
          amount: totalPoints,
          description: `${jobName} ${fullRequestData.job_count}회 완료`,
          log_id: fullRequestData.id,
        })
        .select();

      if (partnerLogError) {
        console.error("[PartnerDashboard] ❌ Failed to log partner points:", partnerLogError);
      } else {
        console.log("[PartnerDashboard] ✅ Partner points log inserted:", partnerLogData);
      }
    } else if ((status === "cancelled" || status === "rejected") && !pointsAlreadyRefunded) {
      // When cancelled/rejected: Refund points to client
      // Only refund if points haven't been refunded already
      // Double-check: Verify request is not already cancelled before refunding
      if (fullRequestData.status !== "cancelled" && fullRequestData.status !== "rejected") {
        const totalPoints =
          fullRequestData.total_coins ||
          fullRequestData.coins_per_job * fullRequestData.job_count;
        const jobName =
          (fullRequestData.partner_job as any)?.job_name || "Service";

        // Final check: Verify no refund log exists with this exact description
        const { data: finalCheckLog, error: finalCheckError } = await supabase
          .from("member_points_logs")
          .select("id")
          .eq("log_id", fullRequestData.id)
          .eq("type", "earn")
          .eq("description", `${jobName} ${fullRequestData.job_count} request cancellation refund`)
          .maybeSingle();

        if (!finalCheckError && !finalCheckLog) {
          // Refund points to client
          const { error: refundError } = await supabase.rpc(
            "update_member_points_with_log",
            {
              p_member_id: fullRequestData.client_id,
              p_type: "earn",
              p_amount: totalPoints,
              p_description: `${jobName} ${fullRequestData.job_count} request cancellation refund`,
              p_log_id: fullRequestData.id,
            }
          );

          if (refundError) throw refundError;
        }
      }
    }

    return successResponse(res, {
      request: updatedRequest,
      message: "Request status updated successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/requests/{requestId}/auto-cancel:
 *   post:
 *     summary: 1시간 이상 경과한 pending 요청 자동 취소
 *     tags: [Partner Dashboard]
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: 자동 취소할 요청 ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: 채팅/로그에 남길 안내 문구
 *     responses:
 *       200:
 *         description: 취소 여부와 이유
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     cancelled:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                     cancel_message:
 *                       type: string
 *                     pointsRefunded:
 *                       type: integer
 *                     alreadyProcessed:
 *                       type: boolean
 *                     reason:
 *                       type: string
 */
router.post(
  "/requests/:requestId/auto-cancel",
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { message } = req.body || {};

    if (!requestId) {
      return errorResponse(res, "INVALID_REQUEST_ID", "Request ID is required");
    }

    const supabase = createSupabaseClient();

    const { data: requestData, error: requestError } = await supabase
      .from("partner_requests")
      .select(
        "*, partner_job:partner_jobs(job_name), partner:partners!partner_requests_partner_id_fkey(member_id)"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!requestData) {
      return errorResponse(res, "REQUEST_NOT_FOUND", "Request not found");
    }

    if (requestData.status !== "pending") {
      return successResponse(res, {
        alreadyProcessed: true,
        reason: "Request is not pending",
        status: requestData.status,
      });
    }

    const createdAt = new Date(requestData.created_at);
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    if (createdAt > oneHourAgo) {
      return successResponse(res, {
        alreadyProcessed: true,
        reason: "Request not yet eligible for auto-cancel",
        nextEligibleAt: new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString(),
      });
    }

    const cancelResult = await cancelRequestWithRefund(
      supabase,
      requestId,
      requestData,
      message
    );

    return successResponse(res, {
      cancelled: true,
      request: cancelResult.updatedRequest,
      pointsRefunded: cancelResult.pointsRefunded,
      message: cancelResult.updatedRequest.cancel_message,
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/stats:
 *   get:
 *     summary: 파트너 통계 조회
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: integer
 *                     pendingRequests:
 *                       type: integer
 *                     acceptedRequests:
 *                       type: integer
 *                     completedRequests:
 *                       type: integer
 *                     totalPoints:
 *                       type: integer
 *                     activeJobs:
 *                       type: integer
 *                     banned_users:
 *                       type: array
 */
// GET /stats - Get partner statistics
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);

    const supabase = createSupabaseClient();

    // Get user's partner info including ben_lists
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, total_points, ben_lists")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    // Get request statistics
    const { data: requestStats, error: statsError } = await supabase
      .from("partner_requests")
      .select("status")
      .eq("partner_id", partnerData.id);

    if (statsError) throw statsError;

    // Calculate statistics
    const stats: any = {
      totalRequests: requestStats?.length || 0,
      pendingRequests:
        requestStats?.filter((r) => r.status === "pending" || r.status === "in_progress").length || 0,
      acceptedRequests:
        requestStats?.filter((r) => r.status === "in_progress").length || 0,
      completedRequests:
        requestStats?.filter((r) => r.status === "completed").length || 0,
      rejectedRequests:
        requestStats?.filter((r) => r.status === "rejected").length || 0,
      totalPoints: partnerData.total_points || 0,
    };

    // Get active jobs count
    const { data: jobsData, error: jobsError } = await supabase
      .from("partner_jobs")
      .select("id")
      .eq("partner_id", partnerData.id)
      .eq("is_active", true);

    if (jobsError) throw jobsError;

    stats.activeJobs = jobsData?.length || 0;

    // Get banned users information from partners.ben_lists
    let formattedBannedUsers: any[] = [];

    if (partnerData.ben_lists) {
      let blockedUserIds: string[] = [];

      // Parse ben_lists based on its type
      if (Array.isArray(partnerData.ben_lists)) {
        blockedUserIds = partnerData.ben_lists;
      } else if (typeof partnerData.ben_lists === "string") {
        try {
          blockedUserIds = JSON.parse(partnerData.ben_lists);
        } catch (e) {
          console.error("Failed to parse ben_lists as JSON:", e);
          blockedUserIds = [];
        }
      } else if (typeof partnerData.ben_lists === "object") {
        blockedUserIds = Object.values(partnerData.ben_lists);
      }

      // Get user information for blocked users
      if (blockedUserIds.length > 0) {
        const { data: blockedUsersInfo, error: blockedUsersError } =
          await supabase
            .from("members")
            .select("id, name, profile_image, member_code")
            .in("id", blockedUserIds);

        if (!blockedUsersError && blockedUsersInfo) {
          formattedBannedUsers = blockedUsersInfo.map((user) => ({
            id: `blocked_${user.id}`,
            user_id: user.id,
            user_name: user.name,
            banned_at: new Date().toISOString(), // We don't have exact ban date, use current time
            user_info: user,
          }));
        }
      }
    }

    const response = {
      ...stats,
      banned_users: formattedBannedUsers,
    };

    return successResponse(res, response);
  })
);

/**
 * @swagger
 * /api/partner-dashboard/monthly-client-ranking:
 *   get:
 *     summary: 월간 클라이언트 랭킹 조회
 *     tags: [Partner Dashboard]
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema:
 *           type: string
 *         description: 파트너의 member ID (선택적, 없으면 전체 랭킹)
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     ranking:
 *                       type: array
 *                     month:
 *                       type: string
 *                     total_clients:
 *                       type: integer
 */
// GET /monthly-client-ranking - Get monthly client ranking
router.get(
  "/monthly-client-ranking",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const memberId = (req.query.memberId as string) || undefined;

    // Get current month start and end dates
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-based

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(
      currentYear,
      currentMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // If memberId is provided, limit ranking to that partner's clients only
    let partnerId: string | null = null;
    if (memberId) {
      const { data: partnerData, error: partnerError } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", memberId)
        .maybeSingle();

      if (partnerError) {
        // If no partner found for this member, return empty ranking
        if ((partnerError as any).code === "PGRST116") {
          return successResponse(res, {
            ranking: [],
            month: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`,
            total_clients: 0,
          });
        }
        throw partnerError;
      }

      if (!partnerData) {
        return successResponse(res, {
          ranking: [],
          month: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`,
          total_clients: 0,
        });
      }

      partnerId = partnerData.id;
    }

    // Get completed partner requests for current month grouped by client
    let requestsQuery = supabase
      .from("partner_requests")
      .select(
        `
        client_id,
        total_coins,
        members!partner_requests_client_id_fkey (
          id,
          name,
          profile_image,
          member_code
        )
      `
      )
      .eq("status", "completed")
      .gte("updated_at", startOfMonth.toISOString())
      .lte("updated_at", endOfMonth.toISOString());

    if (partnerId) {
      requestsQuery = requestsQuery.eq("partner_id", partnerId);
    }

    const { data: monthlyRequests, error: requestsError } = await requestsQuery;

    if (requestsError) throw requestsError;

    // Group by client_id and sum total_coins
    const clientRankingMap = new Map();

    (monthlyRequests || []).forEach((request) => {
      const clientId = request.client_id;
      const totalCoins = request.total_coins || 0;

      if (clientRankingMap.has(clientId)) {
        const existing = clientRankingMap.get(clientId);
        existing.totalCoins += totalCoins;
        existing.requestCount += 1;
      } else {
        clientRankingMap.set(clientId, {
          clientId: clientId,
          clientInfo: request.members,
          totalCoins: totalCoins,
          requestCount: 1,
        });
      }
    });

    // Convert to array and sort by totalCoins descending
    const ranking = Array.from(clientRankingMap.values())
      .sort((a, b) => b.totalCoins - a.totalCoins)
      .slice(0, 10) // Top 10
      .map((item, index) => ({
        rank: index + 1,
        client_id: item.clientId,
        client_name: item.clientInfo?.name || "Unknown",
        client_profile_image: item.clientInfo?.profile_image || null,
        client_member_code: item.clientInfo?.member_code || null,
        total_coins: item.totalCoins,
        request_count: item.requestCount,
      }));

    return successResponse(res, {
      ranking: ranking,
      month: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`,
      total_clients: clientRankingMap.size,
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/points/withdraw:
 *   post:
 *     summary: 포인트 출금 요청 제출
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bank_info
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1000
 *                 description: 출금 금액 (최소 1000 포인트)
 *               bank_info:
 *                 type: object
 *                 description: 은행 정보
 *                 properties:
 *                   bank_name:
 *                     type: string
 *                   bank_owner:
 *                     type: string
 *                   bank_num:
 *                     type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 포인트 부족 또는 최소 금액 미달
 *       403:
 *         description: 셀러 ID가 없어 출금 불가
 */
// POST /points/withdraw - Submit withdrawal request (alias for partner-settlement/withdraw)
router.post(
  "/points/withdraw",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || !body.amount || !body.bank_info) {
      console.error("❌ Invalid withdrawal request body:", {
        hasAmount: !!body?.amount,
        hasBankInfo: !!body?.bank_info,
        body,
      });
      return errorResponse(res, "INVALID_BODY", "Amount and bank info are required");
    }

    const { amount, bank_info, notes } = body;

    const supabase = createSupabaseClient();

    // Get user's partner info (with partner_business_info for tosspayments_seller_id)
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, total_points, partner_business_info(tosspayments_seller_id)")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      console.error("❌ Failed to fetch partner data for withdrawal:", {
        error: partnerError,
        code: partnerError.code,
        message: partnerError.message,
        memberId: user.id,
      });
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    const bizInfo = (partnerData?.partner_business_info as any)?.[0] || partnerData?.partner_business_info;
    // Check if seller ID exists (셀러 ID가 없으면 출금 불가)
    if (!bizInfo?.tosspayments_seller_id) {
      console.error("❌ Withdrawal request rejected: Missing tosspayments_seller_id", {
        partnerId: partnerData.id,
        memberId: user.id,
        amount,
        totalPoints: partnerData.total_points,
      });
      return errorResponse(
        res,
        "WITHDRAWAL_DISABLED",
        "출금을 위해서는 토스페이먼츠 셀러 등록이 필요합니다.",
        null,
        403
      );
    }

    // Check if user has enough points
    if (partnerData.total_points < amount) {
      console.error("❌ Insufficient points for withdrawal:", {
        partnerId: partnerData.id,
        memberId: user.id,
        requestedAmount: amount,
        availablePoints: partnerData.total_points,
      });
      return errorResponse(res, "INSUFFICIENT_POINTS", "Insufficient points for withdrawal");
    }

    // Minimum withdrawal amount check
    if (amount < 1000) {
      console.error("❌ Withdrawal amount below minimum:", {
        partnerId: partnerData.id,
        memberId: user.id,
        amount,
        minimum: 1000,
      });
      return errorResponse(res, "MINIMUM_WITHDRAWAL", "Minimum withdrawal amount is 1000 points");
    }

    // Create withdrawal request
    // bank_info에서 bank_name, bank_owner, bank_num 추출
    const bankName = bank_info?.bank_name || bank_info?.bankName || null;
    const bankOwner = bank_info?.bank_owner || bank_info?.bankOwner || null;
    const bankNum = bank_info?.bank_num || bank_info?.bankNum || null;

    const { data: withdrawalRequest, error: createError } = await supabase
      .from("partner_withdrawals")
      .insert({
        partner_id: partnerData.id,
        requested_amount: amount,
        bank_name: bankName,
        bank_owner: bankOwner,
        bank_num: bankNum,
        status: "pending",
      })
      .select()
      .single();

    if (createError) {
      console.error("❌ Failed to create withdrawal request:", {
        error: createError,
        code: createError.code,
        message: createError.message,
        partnerId: partnerData.id,
        amount,
      });
      throw createError;
    }

    // 출금 신청 시 포인트 로그 기록
    const { error: logError } = await supabase
      .from("partner_points_logs")
      .insert({
        partner_id: partnerData.id,
        type: "spend",
        amount: amount,
        description: `출금 신청 (대기 중, 요청 금액: ${amount} 포인트)`,
        log_id: withdrawalRequest.id.toString(),
      });

    if (logError) {
      console.error("❌ Failed to add log for withdrawal request:", {
        error: logError,
        withdrawalId: withdrawalRequest.id,
        partnerId: partnerData.id,
      });
      // 로그 추가 실패는 경고만 하고 계속 진행 (출금 신청은 이미 성공)
      console.warn("⚠️  Warning: Failed to add log for withdrawal request, but withdrawal request was created");
    } else {
      console.log(`✅ Added log for withdrawal request: ${withdrawalRequest.id}`);
    }

    console.log("✅ Withdrawal request created successfully:", {
      withdrawalId: withdrawalRequest.id,
      partnerId: partnerData.id,
      amount,
    });

    return successResponse(res, {
      withdrawal: withdrawalRequest,
      message: "Withdrawal request submitted successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-dashboard/business-info:
 *   put:
 *     summary: 파트너 사업자 정보 업데이트 (legal, payout)
 *     tags: [Partner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               legalName:
 *                 type: string
 *               legalEmail:
 *                 type: string
 *               legalPhone:
 *                 type: string
 *               payoutBankCode:
 *                 type: string
 *               payoutBankName:
 *                 type: string
 *               payoutAccountNumber:
 *                 type: string
 *               payoutAccountHolder:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       404:
 *         description: 파트너 또는 사업자 정보 없음
 */
// PUT /business-info - Update partner business info (legal & payout fields only)
router.put(
  "/business-info",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    const supabase = createSupabaseClient();

    // Get user's partner info
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    // Build update data for partner_business_info
    const updateData: Record<string, string | null> = {};

    // Legal fields
    if (body.legalName !== undefined) updateData.legal_name = body.legalName?.trim() || null;
    if (body.legalEmail !== undefined) updateData.legal_email = body.legalEmail?.trim() || null;
    if (body.legalPhone !== undefined) updateData.legal_phone = body.legalPhone?.trim() || null;

    // Payout fields
    if (body.payoutBankCode !== undefined) updateData.payout_bank_code = body.payoutBankCode?.trim() || null;
    if (body.payoutBankName !== undefined) updateData.payout_bank_name = body.payoutBankName?.trim() || null;
    if (body.payoutAccountNumber !== undefined) updateData.payout_account_number = body.payoutAccountNumber?.trim() || null;
    if (body.payoutAccountHolder !== undefined) updateData.payout_account_holder = body.payoutAccountHolder?.trim() || null;

    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, "NO_FIELDS", "No fields to update");
    }

    updateData.updated_at = new Date().toISOString();

    // Upsert partner_business_info (insert if not exists, update if exists)
    const { data: updatedInfo, error: updateError } = await supabase
      .from("partner_business_info")
      .upsert(
        { partner_id: partnerData.id, ...updateData },
        { onConflict: "partner_id" }
      )
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return successResponse(res, {
      businessInfo: updatedInfo,
      message: "Business info updated successfully",
    });
  })
);

export default router;
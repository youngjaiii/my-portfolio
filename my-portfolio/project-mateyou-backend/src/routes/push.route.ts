import { Router } from "express";
import webpush from "web-push";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";
import {
  addToPushQueue,
  processPushQueue,
  getPushSubscriptions,
  sendPushNotification,
} from "../lib/push-queue";

const router = Router();

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface SendPushRequest {
  userId?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * @swagger
 * /api/push/subscribe:
 *   post:
 *     summary: 푸시 구독 저장
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - keys
 *             properties:
 *               endpoint:
 *                 type: string
 *               keys:
 *                 type: object
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
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
 *                     message:
 *                       type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 */
// POST /subscribe - Save push subscription
router.post(
  "/subscribe",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const subscription: PushSubscription = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return errorResponse(
        res,
        "INVALID_SUBSCRIPTION",
        "Valid push subscription is required"
      );
    }

    // Check if user is a partner
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .maybeSingle();

    // web_push_subscriptions 테이블 구조에 맞게 저장
    // member_id 또는 target_id 중 하나만 설정 가능
    const subscriptionData: any = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: req.headers["user-agent"] || null,
    };

    if (partnerData) {
      // 파트너인 경우 target_id 사용
      subscriptionData.target_id = partnerData.id;
    } else {
      // 일반 멤버인 경우 member_id 사용
      subscriptionData.member_id = user.id;
    }

    // endpoint로 기존 구독 찾기
    const { data: existingSubscription, error: checkError } = await supabase
      .from("web_push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (existingSubscription) {
      // Update existing subscription
      // Ensure only one of member_id or target_id is set (check constraint requirement)
      const updateData: any = {
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.p256dh,
        auth: subscriptionData.auth,
        user_agent: subscriptionData.user_agent,
        last_used_at: new Date().toISOString(),
      };

      // Explicitly set one and null the other to satisfy check constraint
      if (partnerData) {
        // 파트너인 경우: target_id만 설정하고 member_id는 NULL
        updateData.target_id = subscriptionData.target_id;
        updateData.member_id = null;
      } else {
        // 일반 멤버인 경우: member_id만 설정하고 target_id는 NULL
        updateData.member_id = subscriptionData.member_id;
        updateData.target_id = null;
      }

      const { error: updateError } = await supabase
        .from("web_push_subscriptions")
        .update(updateData)
        .eq("id", existingSubscription.id);

      if (updateError) throw updateError;

      return successResponse(res, {
        message: "Subscription updated successfully",
      });
    }

    // Create new subscription
    // Ensure only one of member_id or target_id is set
    const insertData: any = {
      endpoint: subscriptionData.endpoint,
      p256dh: subscriptionData.p256dh,
      auth: subscriptionData.auth,
      user_agent: subscriptionData.user_agent,
    };

    if (partnerData) {
      insertData.target_id = subscriptionData.target_id;
      insertData.member_id = null;
    } else {
      insertData.member_id = subscriptionData.member_id;
      insertData.target_id = null;
    }

    const { error: insertError } = await supabase
      .from("web_push_subscriptions")
      .insert(insertData);

    if (insertError) throw insertError;

    return successResponse(res, {
      message: "Subscription saved successfully",
    });
  })
);

/**
 * @swagger
 * /api/push/unsubscribe:
 *   delete:
 *     summary: 푸시 구독 제거
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *             properties:
 *               endpoint:
 *                 type: string
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
 *                     message:
 *                       type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 */
// DELETE /unsubscribe - Remove subscription
router.delete(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { endpoint } = req.body;

    if (!endpoint) {
      return errorResponse(
        res,
        "MISSING_ENDPOINT",
        "Subscription endpoint is required"
      );
    }

    // Check if user is a partner
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .maybeSingle();

    let deleteQuery = supabase
      .from("web_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (partnerData) {
      deleteQuery = deleteQuery.eq("target_id", partnerData.id);
    } else {
      deleteQuery = deleteQuery.eq("member_id", user.id);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) throw deleteError;

    return successResponse(res, {
      message: "Subscription removed successfully",
    });
  })
);

/**
 * @swagger
 * /api/push/queue:
 *   post:
 *     summary: 푸시 알림을 큐에 추가
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - body
 *             properties:
 *               target_member_id:
 *                 type: string
 *                 description: 대상 멤버 ID
 *               target_partner_id:
 *                 type: string
 *                 description: 대상 파트너 ID (target_id)
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               icon:
 *                 type: string
 *               url:
 *                 type: string
 *               tag:
 *                 type: string
 *               notification_type:
 *                 type: string
 *                 enum: [message, request, payment, system, call, review]
 *                 default: system
 *               data:
 *                 type: object
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *                 description: 예약 전송 시간 (선택적)
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
 *                     message:
 *                       type: string
 *                     queueItem:
 *                       type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 */
// POST /queue - Add push notification to queue
router.post(
  "/queue",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body.title || !body.body) {
      return errorResponse(
        res,
        "INVALID_NOTIFICATION",
        "Title and body are required"
      );
    }

    if (!body.target_member_id && !body.target_partner_id) {
      return errorResponse(
        res,
        "INVALID_TARGET",
        "Either target_member_id or target_partner_id is required"
      );
    }

    const queueItem = await addToPushQueue({
      user_id: user.id,
      target_member_id: body.target_member_id,
      target_partner_id: body.target_partner_id,
      title: body.title,
      body: body.body,
      icon: body.icon,
      url: body.url,
      tag: body.tag,
      notification_type: body.notification_type || "system",
      data: body.data,
      scheduled_at: body.scheduled_at,
    });

    return successResponse(res, {
      message: "Push notification added to queue",
      queueItem,
    });
  })
);

/**
 * @swagger
 * /api/push/process:
 *   post:
 *     summary: 푸시 큐 처리 (워커)
 *     tags: [Push]
 *     description: 대기 중인 푸시 알림을 처리합니다. 주기적으로 호출되어야 합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               batchSize:
 *                 type: integer
 *                 default: 50
 *                 description: 한 번에 처리할 최대 알림 수
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
 *                     message:
 *                       type: string
 *                     results:
 *                       type: object
 *                       properties:
 *                         processed:
 *                           type: integer
 *                         sent:
 *                           type: integer
 *                         failed:
 *                           type: integer
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *       500:
 *         description: 서버 오류
 */
// POST /process - Process push queue (worker)
router.post(
  "/process",
  asyncHandler(async (req, res) => {
    // 시스템 레벨 엔드포인트이므로 인증은 선택적
    // 필요시 admin 체크 추가 가능
    const defaultBatchSize = parseInt(process.env.PUSH_QUEUE_BATCH_SIZE || "50");
    const batchSize = req.body?.batchSize || defaultBatchSize;

    const results = await processPushQueue(batchSize);

    return successResponse(res, {
      message: "Push queue processed",
      results,
    });
  })
);

/**
 * @swagger
 * /api/push/send:
 *   post:
 *     summary: 푸시 알림 즉시 전송 (큐 사용 안 함)
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - body
 *             properties:
 *               target_member_id:
 *                 type: string
 *               target_partner_id:
 *                 type: string
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               icon:
 *                 type: string
 *               url:
 *                 type: string
 *               tag:
 *                 type: string
 *               data:
 *                 type: object
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
 *                     message:
 *                       type: string
 *                     results:
 *                       type: object
 *                       properties:
 *                         sent:
 *                           type: integer
 *                         failed:
 *                           type: integer
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 구독 정보 없음
 */
// POST /send - Send push notification immediately (bypass queue)
router.post(
  "/send",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body.title || !body.body) {
      return errorResponse(
        res,
        "INVALID_NOTIFICATION",
        "Title and body are required"
      );
    }

    if (!body.target_member_id && !body.target_partner_id) {
      return errorResponse(
        res,
        "INVALID_TARGET",
        "Either target_member_id or target_partner_id is required"
      );
    }

    // Get subscriptions
    const subscriptions = await getPushSubscriptions(
      body.target_member_id,
      body.target_partner_id
    );

    if (subscriptions.length === 0) {
      return errorResponse(
        res,
        "NO_SUBSCRIPTIONS",
        "No push subscriptions found"
      );
    }

    // Send notifications
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, {
          title: body.title,
          body: body.body,
          icon: body.icon,
          url: body.url,
          tag: body.tag,
          data: body.data,
        });

        results.sent++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(
          `Error for subscription ${subscription.id}: ${error.message}`
        );
      }
    }

    return successResponse(res, {
      message: `Push notifications processed`,
      results,
    });
  })
);

/**
 * @swagger
 * /api/push/queue/status:
 *   get:
 *     summary: 푸시 큐 상태 조회
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, sent, failed]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
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
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     stats:
 *                       type: object
 *                       properties:
 *                         pending:
 *                           type: integer
 *                         processing:
 *                           type: integer
 *                         sent:
 *                           type: integer
 *                         failed:
 *                           type: integer
 *       401:
 *         description: 인증 필요
 */
// GET /queue/status - Get queue status
router.get(
  "/queue/status",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const status = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) || "50");

    let query = supabase
      .from("push_notifications_queue")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // 통계 정보
    const { data: stats } = await supabase
      .from("push_notifications_queue")
      .select("status");

    const statsCount = {
      pending: stats?.filter((s) => s.status === "pending").length || 0,
      processing: stats?.filter((s) => s.status === "processing").length || 0,
      sent: stats?.filter((s) => s.status === "sent").length || 0,
      failed: stats?.filter((s) => s.status === "failed").length || 0,
    };

    return successResponse(res, data || [], {
      total: count || 0,
      stats: statsCount,
    });
  })
);

export default router;

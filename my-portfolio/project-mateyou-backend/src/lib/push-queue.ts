import webpush from "web-push";
import { createSupabaseClient } from "./utils";

interface PushNotificationQueueItem {
  user_id?: string;
  target_member_id?: string;
  target_partner_id?: string;
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  notification_type?: string;
  data?: Record<string, any>;
  scheduled_at?: string;
}

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  member_id?: string;
  target_id?: string;
}

/**
 * 푸시 알림을 큐에 추가
 */
export async function addToPushQueue(item: PushNotificationQueueItem) {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("push_notifications_queue")
    .insert([
      {
        user_id: item.user_id,
        target_member_id: item.target_member_id,
        target_partner_id: item.target_partner_id,
        title: item.title,
        body: item.body,
        icon: item.icon,
        url: item.url,
        tag: item.tag,
        notification_type: item.notification_type || "system",
        data: item.data,
        scheduled_at: item.scheduled_at || new Date().toISOString(),
        status: "pending",
      },
    ])
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * 큐에서 대기 중인 푸시 알림 가져오기
 */
export async function getPendingPushNotifications(limit: number = 50) {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("push_notifications_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return data || [];
}

/**
 * 큐 항목 상태 업데이트
 */
export async function updateQueueItemStatus(
  id: string,
  status: "pending" | "processing" | "sent" | "failed",
  errorMessage?: string
) {
  const supabase = createSupabaseClient();

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "sent" || status === "failed") {
    updateData.processed_at = new Date().toISOString();
  }

  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  if (status === "failed") {
    // retry_count 증가
    const { data: currentItem } = await supabase
      .from("push_notifications_queue")
      .select("retry_count")
      .eq("id", id)
      .single();

    if (currentItem) {
      updateData.retry_count = (currentItem.retry_count || 0) + 1;
    }
  }

  const { error } = await supabase
    .from("push_notifications_queue")
    .update(updateData)
    .eq("id", id);

  if (error) throw error;
}

/**
 * web_push_subscriptions에서 구독 정보 가져오기
 */
export async function getPushSubscriptions(
  targetMemberId?: string,
  targetPartnerId?: string
): Promise<PushSubscription[]> {
  const supabase = createSupabaseClient();

  let query = supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth, member_id, target_id");

  if (targetMemberId) {
    query = query.eq("member_id", targetMemberId);
  } else if (targetPartnerId) {
    query = query.eq("target_id", targetPartnerId);
  }

  const { data, error } = await query;

  if (error) {
    // 406 에러는 빈 배열로 처리
    if (error.code === "PGRST116" || (error as any).status === 406) {
      return [];
    }
    throw error;
  }

  return (data || []).map((sub) => ({
    id: sub.id,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    member_id: sub.member_id,
    target_id: sub.target_id,
  }));
}

/**
 * 푸시 알림 전송
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
    data?: Record<string, any>;
  }
): Promise<boolean> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("VAPID keys are not configured");
  }

  // VAPID 설정
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@mateyou.com",
    vapidPublicKey,
    vapidPrivateKey
  );

  // 푸시 페이로드 생성
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/favicon.ico",
    url: payload.url || "/",
    tag: payload.tag || "mateyou-notification",
    data: payload.data || {},
    timestamp: Date.now(),
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      pushPayload
    );

    return true;
  } catch (error: any) {
    // 만료된 구독 처리
    if (error.statusCode === 410 || error.statusCode === 404) {
      // 구독 정보 삭제
      const supabase = createSupabaseClient();
      const { error: deleteError } = await supabase
        .from("web_push_subscriptions")
        .delete()
        .eq("id", subscription.id);
      
      if (deleteError) {
        console.error("Failed to delete expired subscription:", deleteError);
      }
    }

    throw error;
  }
}

/**
 * 큐 처리 워커 - 대기 중인 푸시 알림을 처리
 */
export async function processPushQueue(batchSize: number = 50) {
  const supabase = createSupabaseClient();
  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // 대기 중인 알림 가져오기
    const pendingNotifications = await getPendingPushNotifications(batchSize);

    if (pendingNotifications.length === 0) {
      // 알림이 없으면 조용히 반환 (로그 남기지 않음)
      return results;
    }

    console.log(`📬 Processing ${pendingNotifications.length} push notifications...`);

    for (const notification of pendingNotifications) {
      try {
        // 상태를 processing으로 변경
        await updateQueueItemStatus(notification.id, "processing");

        // 구독 정보 가져오기
        const subscriptions = await getPushSubscriptions(
          notification.target_member_id || undefined,
          notification.target_partner_id || undefined
        );

        if (subscriptions.length === 0) {
          // 구독이 없으면 실패 처리
          await updateQueueItemStatus(
            notification.id,
            "failed",
            "No push subscriptions found"
          );
          results.failed++;
          continue;
        }

        // 각 구독에 대해 푸시 전송
        let sentCount = 0;
        let failedCount = 0;

        for (const subscription of subscriptions) {
          try {
            await sendPushNotification(subscription, {
              title: notification.title,
              body: notification.body,
              icon: notification.icon,
              url: notification.url,
              tag: notification.tag,
              data: notification.data,
            });
            sentCount++;
          } catch (error: any) {
            failedCount++;
            console.error(
              `Failed to send push to ${subscription.endpoint}:`,
              error.message
            );
          }
        }

        // 최소 하나라도 성공하면 sent로 처리
        if (sentCount > 0) {
          await updateQueueItemStatus(notification.id, "sent");
          results.sent++;
        } else if (failedCount > 0) {
          // 모두 실패했고 재시도 가능하면 pending으로 유지, 아니면 failed
          if ((notification.retry_count || 0) < (notification.max_retries || 3)) {
            await updateQueueItemStatus(notification.id, "pending");
          } else {
            await updateQueueItemStatus(
              notification.id,
              "failed",
              "All subscriptions failed"
            );
            results.failed++;
          }
        }

        results.processed++;
      } catch (error: any) {
        console.error(`Error processing notification ${notification.id}:`, error);

        // 재시도 가능하면 pending으로 유지
        if ((notification.retry_count || 0) < (notification.max_retries || 3)) {
          await updateQueueItemStatus(notification.id, "pending");
        } else {
          await updateQueueItemStatus(
            notification.id,
            "failed",
            error.message || "Unknown error"
          );
          results.failed++;
        }

        results.errors.push(`Notification ${notification.id}: ${error.message}`);
      }
    }

    console.log(
      `✅ Push queue processed: ${results.processed} total, ${results.sent} sent, ${results.failed} failed`
    );

    return results;
  } catch (error: any) {
    console.error("Error in processPushQueue:", {
      message: error.message,
      details: error.toString(),
      hint: error.code === 'ENOTFOUND' ? 'DNS resolution failed. Check SUPABASE_URL.' : '',
      code: error.code || ''
    });
    throw error;
  }
}


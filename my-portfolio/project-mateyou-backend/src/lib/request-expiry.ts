import { createSupabaseClient } from "./utils";

const AUTO_CANCEL_MESSAGE =
  "의뢰 요청 시간이 만료 되었어요. 1시간 이내에 의뢰를 받아주세요.";

/**
 * 1시간 이상 지난 pending 상태의 의뢰를 자동으로 cancelled로 변경하고 포인트를 환불합니다.
 */
const logExpirationChat = async (
  supabase: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  partnerId: string,
  message: string
) => {
  if (!clientId || !partnerId || !message) return;

  const { error } = await supabase.from("member_chats").insert({
    sender_id: clientId,
    receiver_id: partnerId,
    message,
    comment_type: "system",
  });

  if (error) {
    console.error("Failed to log auto-cancel chat:", error);
  }
};

export async function processExpiredRequests(): Promise<{
  processed: number;
  errors: number;
}> {
  const supabase = createSupabaseClient();
  let processed = 0;
  let errors = 0;

  try {
    // 1시간 전 시간 계산
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // 1시간 이상 지난 pending 상태의 의뢰 조회
    const { data: expiredRequests, error: fetchError } = await supabase
      .from("partner_requests")
      .select(
        `
        *,
        partner_job:partner_jobs(job_name),
        client:members(id, name, total_points)
      `
      )
      .eq("status", "pending")
      .lt("created_at", oneHourAgo.toISOString());

    if (fetchError) {
      console.error("❌ Error fetching expired requests:", fetchError);
      throw fetchError;
    }

    if (!expiredRequests || expiredRequests.length === 0) {
      return { processed: 0, errors: 0 };
    }

    console.log(
      `⏰ Found ${expiredRequests.length} expired request(s) to process`
    );

    // 각 의뢰 처리
    for (const request of expiredRequests) {
      try {
        // 이미 cancelled 상태인 경우 스킵
        if (request.status === "cancelled") {
          continue;
        }

        // 포인트 환불 여부 확인 (중복 환불 방지)
        const totalPoints =
          request.total_coins ||
          request.coins_per_job * request.job_count;
        const jobName =
          (request.partner_job as any)?.job_name || "Service";

        // 이미 환불 로그가 있는지 확인
        const { data: existingLog, error: logCheckError } = await supabase
          .from("member_points_logs")
          .select("id")
          .eq("log_id", request.id)
          .eq("type", "earn")
          .eq(
            "description",
            `${jobName} ${request.job_count} request auto-cancellation refund`
          )
          .maybeSingle();

        if (logCheckError) {
          console.error(
            `❌ Error checking refund log for request ${request.id}:`,
            logCheckError
          );
          errors++;
          continue;
        }

        // 의뢰 상태를 cancelled로 업데이트
        const { error: updateError } = await supabase
          .from("partner_requests")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            cancel_message: AUTO_CANCEL_MESSAGE,
          })
          .eq("id", request.id);

        if (updateError) {
          console.error(
            `❌ Error updating request ${request.id}:`,
            updateError
          );
          errors++;
          continue;
        }

        // 포인트 환불 (환불 로그가 없는 경우에만)
        if (!existingLog && totalPoints > 0) {
          const { error: refundError } = await supabase.rpc(
            "update_member_points_with_log",
            {
              p_member_id: request.client_id,
              p_type: "earn",
              p_amount: totalPoints,
              p_description: `${jobName} ${request.job_count} request auto-cancellation refund`,
              p_log_id: request.id,
            }
          );

          if (refundError) {
            console.error(
              `❌ Error refunding points for request ${request.id}:`,
              refundError
            );
            errors++;
            continue;
          }

          console.log(
            `✅ Auto-cancelled request ${request.id} and refunded ${totalPoints} points to client ${request.client_id}`
          );
        } else {
          console.log(
            `✅ Auto-cancelled request ${request.id} (points already refunded or no points to refund)`
          );
        }

        processed++;
        await logExpirationChat(
          supabase,
          request.client_id,
          request.partner_id,
          AUTO_CANCEL_MESSAGE
        );
      } catch (error: any) {
        console.error(
          `❌ Error processing expired request ${request.id}:`,
          error.message || error
        );
        errors++;
      }
    }

    if (processed > 0 || errors > 0) {
      console.log(
        `📊 Request expiry processing completed: ${processed} processed, ${errors} errors`
      );
    }

    return { processed, errors };
  } catch (error: any) {
    console.error("❌ Error in processExpiredRequests:", {
      message: error.message,
      details: error.toString(),
      stack: error.stack?.split("\n").slice(0, 3).join("\n"),
    });
    throw error;
  }
}


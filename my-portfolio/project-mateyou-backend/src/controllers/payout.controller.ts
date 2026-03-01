import axios from "axios";
import { Request, Response } from "express";
import { getTossPayoutSecretKey } from "../lib/toss-auth";
import { createSupabaseClient } from "../lib/utils";

/**
 * 지급 요청 목록 조회
 * GET /api/payouts
 *
 * Query Parameters:
 * - limit: 조회할 개수 (기본값: 10, 최대: 10000)
 * - startingAfter: 커서로 사용할 지급대행 요청건의 id
 * - status: 상태 필터 (REQUESTED, COMPLETED, FAILED 등)
 * - destination: 셀러 ID 필터
 * - payoutDateGte: 지급일 이상 (YYYY-MM-DD)
 * - payoutDateLte: 지급일 이하 (YYYY-MM-DD)
 */
export const getPayoutList = async (req: Request, res: Response) => {
  try {
    // Get Toss Payments secret key for payout
    const tossSecretKey = getTossPayoutSecretKey();
    if (!tossSecretKey) {
      console.error(
        "❌ Toss Payments secret key not found in environment variables"
      );
      return res.status(500).json({
        success: false,
        message: "Toss Payments configuration is missing",
      });
    }

    // Build query parameters (Toss API 지원 파라미터만)
    const queryParams = new URLSearchParams();

    // limit: 조회 개수 (기본 10, 최대 10000)
    if (req.query.limit) {
      const limit = Math.min(
        Math.max(1, parseInt(req.query.limit as string) || 10),
        10000
      );
      queryParams.append("limit", limit.toString());
    }

    // startingAfter: 커서 (해당 ID 다음부터 조회)
    if (req.query.startingAfter) {
      queryParams.append("startingAfter", req.query.startingAfter as string);
    }

    // payoutDateGte: 지급일 이상
    if (req.query.payoutDateGte) {
      queryParams.append("payoutDateGte", req.query.payoutDateGte as string);
    }

    // payoutDateLte: 지급일 이하
    if (req.query.payoutDateLte) {
      queryParams.append("payoutDateLte", req.query.payoutDateLte as string);
    }

    const url = `https://api.tosspayments.com/v2/payouts${
      queryParams.toString() ? "?" + queryParams.toString() : ""
    }`;

    console.log("🔍 Fetching payout list from Toss Payments API:", url);

    const apiRes = await axios.get(url, {
      auth: { username: tossSecretKey.trim(), password: "" },
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Payout list fetched successfully:", {
      version: apiRes.data.version,
      entityType: apiRes.data.entityType,
      itemCount: apiRes.data.entityBody?.items?.length || 0,
    });

    // Enrich items with partner information using metadata.partnerId
    const items = apiRes.data.entityBody?.items || [];

    if (items.length > 0) {
      const supabase = createSupabaseClient();

      // Get all unique partner IDs from metadata
      const partnerIds = [
        ...new Set(
          items.map((item: any) => item.metadata?.partnerId).filter(Boolean)
        ),
      ];

      // Get all unique withdrawal IDs from metadata
      const withdrawalIds = [
        ...new Set(
          items.map((item: any) => item.metadata?.withdrawalId).filter(Boolean)
        ),
      ];

      // Fetch partner info and withdrawal info in parallel
      const [partnerResult, withdrawalResult] = await Promise.all([
        partnerIds.length > 0
          ? supabase
              .from("partners")
              .select(
                `
                id,
                partner_name,
                member:members!member_id(
                  id,
                  name,
                  member_code
                ),
                partner_business_info(tax, default_distribution_rate, collaboration_distribution_rate)
              `
              )
              .in("id", partnerIds)
          : Promise.resolve({ data: null }),
        withdrawalIds.length > 0
          ? supabase
              .from("partner_withdrawals")
              .select("id, withdrawal_type, requested_amount")
              .in("id", withdrawalIds)
          : Promise.resolve({ data: null }),
      ]);

      // Create partner map for quick lookup
      const partnerMap = new Map();
      if (partnerResult.data) {
        for (const partner of partnerResult.data) {
          const member = partner.member as any;
          const bizInfo = (partner.partner_business_info as any)?.[0] || partner.partner_business_info || {};
          partnerMap.set(partner.id, {
            partnerId: partner.id,
            partnerName: partner.partner_name || null,
            memberName: member?.name || null,
            memberCode: member?.member_code || null,
            tax: bizInfo.tax ?? null,
            default_distribution_rate: bizInfo.default_distribution_rate ?? null,
            collaboration_distribution_rate: bizInfo.collaboration_distribution_rate ?? null,
          });
        }
      }

      // Create withdrawal map for quick lookup
      const withdrawalMap = new Map();
      if (withdrawalResult.data) {
        for (const withdrawal of withdrawalResult.data) {
          withdrawalMap.set(withdrawal.id, {
            withdrawal_type: withdrawal.withdrawal_type || "total_points",
            requested_amount: withdrawal.requested_amount,
          });
        }
      }

      // Enrich each item with partner info and withdrawal type
      const enrichedItems = items.map((item: any) => {
        const partnerId = item.metadata?.partnerId;
        const withdrawalId = item.metadata?.withdrawalId;
        const partnerInfo = partnerId ? partnerMap.get(partnerId) : null;
        const withdrawalInfo = withdrawalId ? withdrawalMap.get(withdrawalId) : null;
        
        // 출금 유형에 따라 적용할 비율 결정
        const withdrawalType = withdrawalInfo?.withdrawal_type || "total_points";
        let applicable_rate: number | null = null;
        let rate_type: string = "";
        
        if (partnerInfo) {
          if (withdrawalType === "store_points") {
            applicable_rate = partnerInfo.default_distribution_rate;
            rate_type = "default_distribution_rate";
          } else if (withdrawalType === "collaboration_store_points") {
            // collaboration_store_points: 100% 전액 지급
            applicable_rate = 100;
            rate_type = "full_payout";
          } else {
            // total_points
            applicable_rate = partnerInfo.tax;
            rate_type = "tax";
          }
        }
        
        return {
          ...item,
          partnerInfo: partnerInfo
            ? {
                partnerId: partnerInfo.partnerId,
                partnerName: partnerInfo.partnerName,
                memberName: partnerInfo.memberName,
                memberCode: partnerInfo.memberCode,
              }
            : {
                partnerId: partnerId || null,
                partnerName: null,
                memberName: partnerId ? "탈퇴한 회원입니다" : null,
                memberCode: null,
              },
          withdrawalInfo: {
            withdrawal_type: withdrawalType,
            requested_amount: withdrawalInfo?.requested_amount || null,
            applicable_rate,
            rate_type,
          },
        };
      });

      apiRes.data.entityBody.items = enrichedItems;
    }

    return res.json({
      success: true,
      data: apiRes.data,
    });
  } catch (err: any) {
    console.error(
      "❌ Payout List Fetch Failed:",
      err.response?.data || err.message
    );
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.message || err.message,
      error: err.response?.data,
    });
  }
};

/**
 * 지급대행 단건 조회
 * GET /api/payouts/:id
 *
 * Path Parameters:
 * - id: 지급대행 요청건의 고유 ID (FPA_xxxxx)
 */
export const getPayoutDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "지급대행 요청 ID가 필요합니다.",
      });
    }

    // Get Toss Payments secret key for payout
    const tossSecretKey = getTossPayoutSecretKey();
    if (!tossSecretKey) {
      console.error(
        "❌ Toss Payments secret key not found in environment variables"
      );
      return res.status(500).json({
        success: false,
        message: "Toss Payments configuration is missing",
      });
    }

    const url = `https://api.tosspayments.com/v2/payouts/${id}`;

    console.log("🔍 Fetching payout detail from Toss Payments API:", url);

    const apiRes = await axios.get(url, {
      auth: { username: tossSecretKey.trim(), password: "" },
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Payout detail fetched successfully:", {
      version: apiRes.data.version,
      entityType: apiRes.data.entityType,
      payoutId: apiRes.data.entityBody?.id,
      status: apiRes.data.entityBody?.status,
    });

    // Enrich with partner information using metadata.partnerId
    const partnerId = apiRes.data.entityBody?.metadata?.partnerId;

    if (partnerId) {
      const supabase = createSupabaseClient();

      const { data: partnerData } = await supabase
        .from("partners")
        .select(
          `
          id,
          partner_name,
          member:members!member_id(
            id,
            name,
            member_code
          )
        `
        )
        .eq("id", partnerId)
        .single();

      if (partnerData) {
        const member = partnerData.member as any;
        apiRes.data.entityBody.partnerInfo = {
          partnerId: partnerData.id,
          partnerName: partnerData.partner_name || null,
          memberName: member?.name || null,
          memberCode: member?.member_code || null,
        };
      } else {
        apiRes.data.entityBody.partnerInfo = {
          partnerId: partnerId,
          partnerName: null,
          memberName: "탈퇴한 회원입니다",
          memberCode: null,
        };
      }
    }

    return res.json({
      success: true,
      data: apiRes.data,
    });
  } catch (err: any) {
    console.error(
      "❌ Payout Detail Fetch Failed:",
      err.response?.data || err.message
    );

    // 404 에러 처리
    if (err.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "해당 지급대행 요청을 찾을 수 없습니다.",
        error: err.response?.data,
      });
    }

    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.message || err.message,
      error: err.response?.data,
    });
  }
};

/**
 * 지급대행 요청 취소
 * POST /api/payouts/:id/cancel
 *
 * Path Parameters:
 * - id: 지급대행 요청건의 고유 ID (FPA_xxxxx)
 */
export const cancelPayout = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "지급대행 요청 ID가 필요합니다.",
      });
    }

    // Get Toss Payments secret key for payout
    const tossSecretKey = getTossPayoutSecretKey();
    if (!tossSecretKey) {
      console.error(
        "❌ Toss Payments secret key not found in environment variables"
      );
      return res.status(500).json({
        success: false,
        message: "Toss Payments configuration is missing",
      });
    }

    const url = `https://api.tosspayments.com/v2/payouts/${id}/cancel`;

    console.log("🚫 Canceling payout via Toss Payments API:", url);

    const apiRes = await axios.post(
      url,
      {},
      {
        auth: { username: tossSecretKey.trim(), password: "" },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Payout canceled successfully:", {
      version: apiRes.data.version,
      entityType: apiRes.data.entityType,
      payoutId: apiRes.data.entityBody?.id,
      status: apiRes.data.entityBody?.status,
    });

    // 출금 요청도 거절 처리 (metadata.withdrawalId가 있는 경우)
    const withdrawalId = apiRes.data.entityBody?.metadata?.withdrawalId;
    let withdrawalUpdated = false;
    let pointsRestored = false;

    if (withdrawalId) {
      const supabase = createSupabaseClient();

      // 출금 요청 정보 조회
      const { data: withdrawal, error: fetchError } = await supabase
        .from("partner_withdrawals")
        .select("id, partner_id, requested_amount, status")
        .eq("id", withdrawalId)
        .single();

      if (!fetchError && withdrawal && withdrawal.status !== "rejected") {
        const wasApproved = withdrawal.status === "approved";

        // 출금 요청 상태를 rejected로 업데이트
        const { error: updateError } = await supabase
          .from("partner_withdrawals")
          .update({
            status: "rejected",
            reviewed_at: new Date().toISOString(),
            admin_notes: "지급대행 요청 취소로 인한 자동 거절",
          })
          .eq("id", withdrawalId);

        if (!updateError) {
          withdrawalUpdated = true;
          console.log(
            `✅ Withdrawal ${withdrawalId} rejected due to payout cancellation`
          );

          // 이미 승인되어 포인트가 차감된 상태였다면 포인트 복원
          if (wasApproved) {
            // 현재 포인트 조회 후 복원
            const { data: partner } = await supabase
              .from("partners")
              .select("total_points")
              .eq("id", withdrawal.partner_id)
              .single();

            if (partner) {
              const { error: restoreError } = await supabase
                .from("partners")
                .update({
                  total_points:
                    (partner.total_points || 0) + withdrawal.requested_amount,
                })
                .eq("id", withdrawal.partner_id);

              if (!restoreError) {
                pointsRestored = true;
                console.log(
                  `✅ Points restored: ${withdrawal.requested_amount} for partner ${withdrawal.partner_id}`
                );
              } else {
                console.error("❌ Failed to restore points:", restoreError);
              }
            }
          }

          // 포인트 로그 추가
          await supabase.from("partner_points_logs").insert({
            partner_id: withdrawal.partner_id,
            type: "earn",
            amount: withdrawal.requested_amount,
            description: wasApproved
              ? `출금 취소로 포인트 복원 (${withdrawal.requested_amount} 포인트)`
              : `출금 요청 거절 - 지급대행 취소 (요청 금액: ${withdrawal.requested_amount} 포인트)`,
            log_id: withdrawal.id.toString(),
          });
        } else {
          console.error("❌ Failed to reject withdrawal:", updateError);
        }
      }
    }

    return res.json({
      success: true,
      data: apiRes.data,
      withdrawalUpdated,
      pointsRestored,
      withdrawalId: withdrawalId || null,
    });
  } catch (err: any) {
    console.error(
      "❌ Payout Cancel Failed:",
      err.response?.data || err.message
    );

    // 404 에러 처리
    if (err.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "해당 지급대행 요청을 찾을 수 없습니다.",
        error: err.response?.data,
      });
    }

    // 400 에러 처리 (이미 취소됨, 취소 불가 상태 등)
    if (err.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message:
          err.response?.data?.message || "지급대행 요청을 취소할 수 없습니다.",
        error: err.response?.data,
      });
    }

    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.message || err.message,
      error: err.response?.data,
    });
  }
};

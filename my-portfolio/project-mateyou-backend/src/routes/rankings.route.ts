import { Router } from "express";
import {
  createSupabaseClient,
  asyncHandler,
} from "../lib/utils";
import { Response } from "express";

const router = Router();

interface RankingData {
  id: string;
  name: string;
  profileImage?: string | null;
  count: number;
  memberCode?: string;
}

/**
 * @swagger
 * /api/rankings:
 *   get:
 *     summary: 랭킹 조회 (공개)
 *     tags: [Rankings]
 *     description: 지난 30일간의 인기 파트너, 핫한 파트너, 활동 활발한 회원 랭킹을 조회합니다.
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 popularPartners:
 *                   type: array
 *                   description: 인기 파트너 (의뢰 받은 수 기준)
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       profileImage:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       memberCode:
 *                         type: string
 *                 hotPartners:
 *                   type: array
 *                   description: 핫한 파트너 (수익 기준)
 *                   items:
 *                     type: object
 *                 activeMembers:
 *                   type: array
 *                   description: 활동 활발한 회원 (의뢰 수 기준)
 *                   items:
 *                     type: object
 */
// GET / - Get rankings (public endpoint)
router.get(
  "/",
  asyncHandler(async (req, res: Response) => {
    const supabase = createSupabaseClient();

    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Popular Partners (by completed request count)
    const { data: popularData, error: popularError } = await supabase
      .from("partner_requests")
      .select(
        `
        partner_id,
        partners!inner(
          member_id,
          partner_name,
          members!inner(
            id,
            name,
            profile_image,
            member_code
          )
        )
      `
      )
      .eq("status", "completed")
      .gte("updated_at", thirtyDaysAgo.toISOString());

    if (popularError) throw popularError;

    // Calculate completed requests per partner
    const partnerCounts =
      popularData?.reduce((acc: any, request: any) => {
        const partnerId = request.partner_id;
        const partner = request.partners;
        if (partner && partner.members) {
          if (!acc[partnerId]) {
            acc[partnerId] = {
              id: partner.members.id,
              name: partner.partner_name || partner.members.name,
              profileImage: partner.members.profile_image,
              memberCode: partner.members.member_code,
              count: 0,
            };
          }
          acc[partnerId].count++;
        }
        return acc;
      }, {}) || {};

    const popularRanking = Object.values(partnerCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 3) as RankingData[];

    // 2. Hot Partners (by total earnings)
    const { data: hotData, error: hotError } = await supabase
      .from("partner_requests")
      .select(
        `
        partner_id,
        total_coins,
        partners!inner(
          member_id,
          partner_name,
          members!inner(
            id,
            name,
            profile_image,
            member_code
          )
        )
      `
      )
      .eq("status", "completed")
      .gte("updated_at", thirtyDaysAgo.toISOString());

    if (hotError) throw hotError;

    // Calculate total earnings per partner
    const partnerEarnings =
      hotData?.reduce((acc: any, request: any) => {
        const partnerId = request.partner_id;
        const partner = request.partners;
        if (partner && partner.members) {
          if (!acc[partnerId]) {
            acc[partnerId] = {
              id: partner.members.id,
              name: partner.partner_name || partner.members.name,
              profileImage: partner.members.profile_image,
              memberCode: partner.members.member_code,
              count: 0,
            };
          }
          acc[partnerId].count += request.total_coins || 0;
        }
        return acc;
      }, {}) || {};

    const hotRanking = Object.values(partnerEarnings)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 3) as RankingData[];

    // 3. Active Members (by client request count)
    const { data: activeData, error: activeError } = await supabase
      .from("partner_requests")
      .select(
        `
        client_id,
        members!inner(
          id,
          name,
          profile_image,
          member_code
        )
      `
      )
      .eq("status", "completed")
      .gte("updated_at", thirtyDaysAgo.toISOString());

    if (activeError) throw activeError;

    // Calculate request count per client
    const clientCounts =
      activeData?.reduce((acc: any, request: any) => {
        const clientId = request.client_id;
        const member = request.members;
        if (member) {
          if (!acc[clientId]) {
            acc[clientId] = {
              id: member.id,
              name: member.name,
              profileImage: member.profile_image,
              memberCode: member.member_code,
              count: 0,
            };
          }
          acc[clientId].count++;
        }
        return acc;
      }, {}) || {};

    const activeRanking = Object.values(clientCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 3) as RankingData[];

    return res.status(200).json({
      popularPartners: popularRanking,
      hotPartners: hotRanking,
      activeMembers: activeRanking,
    });
  })
);

export default router;

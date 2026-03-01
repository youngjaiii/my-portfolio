/**
 * 관리자용 룰렛 관리 훅
 * 전체 유저/호스트의 인벤토리 조회 및 사용 로그 관리
 */

import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// 아이템 보유 유저 요약
export interface UserWithRewardsSummary {
  user_id: string;
  user_name: string | null;
  user_code: string | null;
  is_partner: boolean;
  partner_id: string | null;
  total_count: number;
  active_count: number;
  pending_count: number;
  used_count: number;
  latest_reward_at: string | null;
}

// 관리자용 인벤토리 아이템
export interface AdminRouletteInventoryItem {
  id: string;
  user_id: string;
  roulette_result_id: string;
  partner_id: string;
  reward_type: 'usable' | 'digital';
  reward_name: string;
  reward_value: string | null;
  usable_type: string | null;
  initial_amount: number;
  remaining_amount: number;
  status: 'active' | 'pending' | 'used' | 'expired' | 'rejected';
  expires_at: string | null;
  created_at: string;
  // 파트너 정보
  partner_name: string | null;
  partner_code: string | null;
  // 획득 경로 정보
  source_type: 'stream' | 'profile' | null;
  donation_amount: number | null;
  wheel_name: string | null;
}

// 관리자용 사용 로그 아이템
export interface AdminRouletteUsageLog {
  id: string;
  reward_id: string;
  user_id: string;
  partner_id: string;
  usage_type: string;
  amount_used: number;
  remaining_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  room_id: string | null;
  context: Record<string, any> | null;
  requested_at: string;
  used_at: string | null;
  created_at: string;
  // 유저 정보
  user_name: string | null;
  user_code: string | null;
  // 파트너 정보
  partner_name: string | null;
  partner_code: string | null;
  // 보상 정보
  reward_name: string | null;
  reward_type: string | null;
  // 획득 경로
  source_type: 'stream' | 'profile' | null;
  wheel_name: string | null;
}

// 유저/파트너 검색 결과
export interface UserSearchResult {
  id: string;
  name: string;
  member_code: string | null;
  profile_image: string | null;
  is_partner: boolean;
  partner_id?: string;
}

interface UseUsersWithRewardsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  roleFilter?: 'all' | 'user' | 'partner';
  enabled?: boolean;
}

interface UseUserRewardsDetailOptions {
  userId: string | null;
  enabled?: boolean;
}

interface UseAdminRouletteUsageLogsOptions {
  page?: number;
  pageSize?: number;
  statusFilter?: 'all' | 'pending' | 'approved' | 'rejected';
  selectedUserId?: string | null;
  selectedPartnerId?: string | null;
  enabled?: boolean;
}

// 아이템 보유 유저 목록 조회
export function useUsersWithRewards({
  page = 1,
  pageSize = 20,
  search = '',
  roleFilter = 'all',
  enabled = true,
}: UseUsersWithRewardsOptions = {}) {
  return useQuery({
    queryKey: ['admin-users-with-rewards', page, pageSize, search, roleFilter],
    queryFn: async () => {
      // 유저별 보상 집계 쿼리
      const { data: rewards, error } = await supabase
        .from('user_roulette_rewards')
        .select('user_id, status, created_at');

      if (error) {
        console.error('[useUsersWithRewards] 조회 실패:', error);
        throw error;
      }

      if (!rewards || rewards.length === 0) {
        return { users: [], totalCount: 0, page, pageSize, totalPages: 0 };
      }

      // 유저별 집계
      const userStatsMap: Record<string, {
        total: number;
        active: number;
        pending: number;
        used: number;
        latest: string | null;
      }> = {};

      rewards.forEach((r: any) => {
        if (!userStatsMap[r.user_id]) {
          userStatsMap[r.user_id] = { total: 0, active: 0, pending: 0, used: 0, latest: null };
        }
        const stats = userStatsMap[r.user_id];
        stats.total++;
        if (r.status === 'active') stats.active++;
        if (r.status === 'pending') stats.pending++;
        if (r.status === 'used') stats.used++;
        if (!stats.latest || r.created_at > stats.latest) {
          stats.latest = r.created_at;
        }
      });

      const userIds = Object.keys(userStatsMap);

      // 유저 정보 조회
      let query = supabase
        .from('members')
        .select(`
          id,
          name,
          member_code,
          partners (id)
        `)
        .in('id', userIds);

      // 검색
      if (search) {
        query = query.or(`name.ilike.%${search}%,member_code.ilike.%${search}%`);
      }

      const { data: members, error: memberError } = await query;

      if (memberError) {
        console.error('[useUsersWithRewards] 멤버 조회 실패:', memberError);
        throw memberError;
      }

      // 유저 목록 생성
      let users: UserWithRewardsSummary[] = (members || []).map((m: any) => {
        const stats = userStatsMap[m.id] || { total: 0, active: 0, pending: 0, used: 0, latest: null };
        const isPartner = m.partners && m.partners.length > 0;
        return {
          user_id: m.id,
          user_name: m.name,
          user_code: m.member_code,
          is_partner: isPartner,
          partner_id: m.partners?.[0]?.id || null,
          total_count: stats.total,
          active_count: stats.active,
          pending_count: stats.pending,
          used_count: stats.used,
          latest_reward_at: stats.latest,
        };
      });

      // 역할 필터
      if (roleFilter === 'partner') {
        users = users.filter((u) => u.is_partner);
      } else if (roleFilter === 'user') {
        users = users.filter((u) => !u.is_partner);
      }

      // 정렬 (최신 보상 기준)
      users.sort((a, b) => {
        if (!a.latest_reward_at) return 1;
        if (!b.latest_reward_at) return -1;
        return b.latest_reward_at.localeCompare(a.latest_reward_at);
      });

      // 페이지네이션 (클라이언트)
      const totalCount = users.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const start = (page - 1) * pageSize;
      const pagedUsers = users.slice(start, start + pageSize);

      return {
        users: pagedUsers,
        totalCount,
        page,
        pageSize,
        totalPages,
      };
    },
    enabled,
    staleTime: 30000,
  });
}

// 특정 유저의 아이템 상세 조회
export function useUserRewardsDetail({
  userId,
  enabled = true,
}: UseUserRewardsDetailOptions) {
  return useQuery({
    queryKey: ['admin-user-rewards-detail', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('user_roulette_rewards')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useUserRewardsDetail] 조회 실패:', error);
        throw error;
      }

      if (!data || data.length === 0) return [];

      // 파트너 ID 수집
      const partnerIds = [...new Set(data.map((d: any) => d.partner_id).filter(Boolean))];
      const resultIds = [...new Set(data.map((d: any) => d.roulette_result_id).filter(Boolean))];

      // 파트너 정보 조회
      let partnerMap: Record<string, any> = {};
      if (partnerIds.length > 0) {
        const { data: partners } = await supabase
          .from('partners')
          .select('id, member_id')
          .in('id', partnerIds);
        
        const partnerMemberIds = (partners || []).map((p: any) => p.member_id).filter(Boolean);
        let partnerMemberMap: Record<string, any> = {};
        if (partnerMemberIds.length > 0) {
          const { data: partnerMembers } = await supabase
            .from('members')
            .select('id, name, member_code')
            .in('id', partnerMemberIds);
          partnerMemberMap = (partnerMembers || []).reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});
        }
        
        partnerMap = (partners || []).reduce((acc: any, p: any) => {
          acc[p.id] = partnerMemberMap[p.member_id] || null;
          return acc;
        }, {});
      }

      // 룰렛 결과 정보 조회
      let resultMap: Record<string, any> = {};
      if (resultIds.length > 0) {
        const { data: results } = await supabase
          .from('donation_roulette_results')
          .select('id, source_type, donation_amount, wheel_name')
          .in('id', resultIds);
        resultMap = (results || []).reduce((acc: any, r: any) => { acc[r.id] = r; return acc; }, {});
      }

      // 데이터 변환
      return data.map((item: any): AdminRouletteInventoryItem => {
        const partner = partnerMap[item.partner_id];
        const result = resultMap[item.roulette_result_id];
        
        return {
          id: item.id,
          user_id: item.user_id,
          roulette_result_id: item.roulette_result_id,
          partner_id: item.partner_id,
          reward_type: item.reward_type,
          reward_name: item.reward_name,
          reward_value: item.reward_value,
          usable_type: item.usable_type,
          initial_amount: item.initial_amount,
          remaining_amount: item.remaining_amount,
          status: item.status,
          expires_at: item.expires_at,
          created_at: item.created_at,
          partner_name: partner?.name || null,
          partner_code: partner?.member_code || null,
          source_type: result?.source_type || null,
          donation_amount: result?.donation_amount || null,
          wheel_name: result?.wheel_name || null,
        };
      });
    },
    enabled: enabled && !!userId,
    staleTime: 30000,
  });
}

// 유저 검색 훅
export function useUserSearch({ search, enabled = true }: { search: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin-user-search', search],
    queryFn: async () => {
      if (!search || search.length < 2) return [];

      const { data, error } = await supabase
        .from('members')
        .select(`
          id,
          name,
          member_code,
          profile_image,
          partners (id)
        `)
        .or(`name.ilike.%${search}%,member_code.ilike.%${search}%`)
        .limit(10);

      if (error) {
        console.error('[useUserSearch] 검색 실패:', error);
        return [];
      }

      return (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        member_code: m.member_code,
        profile_image: m.profile_image,
        is_partner: m.partners && m.partners.length > 0,
        partner_id: m.partners?.[0]?.id || null,
      })) as UserSearchResult[];
    },
    enabled: enabled && search.length >= 2,
    staleTime: 30000,
  });
}

// 사용 로그 조회 훅
export function useAdminRouletteUsageLogs({
  page = 1,
  pageSize = 20,
  statusFilter = 'all',
  selectedUserId = null,
  selectedPartnerId = null,
  enabled = true,
}: UseAdminRouletteUsageLogsOptions = {}) {
  return useQuery({
    queryKey: ['admin-roulette-usage-logs', page, pageSize, statusFilter, selectedUserId, selectedPartnerId],
    queryFn: async () => {
      let query = supabase
        .from('roulette_reward_usage_logs')
        .select('*', { count: 'exact' });

      if (selectedUserId) {
        query = query.eq('user_id', selectedUserId);
      }

      if (selectedPartnerId) {
        query = query.eq('partner_id', selectedPartnerId);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('requested_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('[useAdminRouletteUsageLogs] 조회 실패:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return { logs: [], totalCount: 0, page, pageSize, totalPages: 0 };
      }

      const userIds = [...new Set(data.map((d: any) => d.user_id).filter(Boolean))];
      const partnerIds = [...new Set(data.map((d: any) => d.partner_id).filter(Boolean))];
      const rewardIds = [...new Set(data.map((d: any) => d.reward_id).filter(Boolean))];

      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('members')
          .select('id, name, member_code')
          .in('id', userIds);
        userMap = (users || []).reduce((acc: any, u: any) => { acc[u.id] = u; return acc; }, {});
      }

      let partnerMap: Record<string, any> = {};
      if (partnerIds.length > 0) {
        const { data: partners } = await supabase
          .from('partners')
          .select('id, member_id')
          .in('id', partnerIds);
        
        const partnerMemberIds = (partners || []).map((p: any) => p.member_id).filter(Boolean);
        let partnerMemberMap: Record<string, any> = {};
        if (partnerMemberIds.length > 0) {
          const { data: partnerMembers } = await supabase
            .from('members')
            .select('id, name, member_code')
            .in('id', partnerMemberIds);
          partnerMemberMap = (partnerMembers || []).reduce((acc: any, m: any) => { acc[m.id] = m; return acc; }, {});
        }
        
        partnerMap = (partners || []).reduce((acc: any, p: any) => {
          acc[p.id] = partnerMemberMap[p.member_id] || null;
          return acc;
        }, {});
      }

      let rewardMap: Record<string, any> = {};
      let resultIds: string[] = [];
      if (rewardIds.length > 0) {
        const { data: rewards } = await supabase
          .from('user_roulette_rewards')
          .select('id, reward_name, reward_type, roulette_result_id')
          .in('id', rewardIds);
        
        rewardMap = (rewards || []).reduce((acc: any, r: any) => { acc[r.id] = r; return acc; }, {});
        resultIds = (rewards || []).map((r: any) => r.roulette_result_id).filter(Boolean);
      }

      let resultMap: Record<string, any> = {};
      if (resultIds.length > 0) {
        const { data: results } = await supabase
          .from('donation_roulette_results')
          .select('id, source_type, wheel_name')
          .in('id', resultIds);
        resultMap = (results || []).reduce((acc: any, r: any) => { acc[r.id] = r; return acc; }, {});
      }

      const logs: AdminRouletteUsageLog[] = data.map((log: any) => {
        const user = userMap[log.user_id];
        const partner = partnerMap[log.partner_id];
        const reward = rewardMap[log.reward_id];
        const result = reward?.roulette_result_id ? resultMap[reward.roulette_result_id] : null;
        
        return {
          id: log.id,
          reward_id: log.reward_id,
          user_id: log.user_id,
          partner_id: log.partner_id,
          usage_type: log.usage_type,
          amount_used: log.amount_used,
          remaining_amount: log.remaining_amount,
          status: log.status,
          approved_by: log.approved_by,
          approved_at: log.approved_at,
          rejection_reason: log.rejection_reason,
          room_id: log.room_id,
          context: log.context,
          requested_at: log.requested_at,
          used_at: log.used_at,
          created_at: log.created_at,
          user_name: user?.name || null,
          user_code: user?.member_code || null,
          partner_name: partner?.name || null,
          partner_code: partner?.member_code || null,
          reward_name: reward?.reward_name || null,
          reward_type: reward?.reward_type || null,
          source_type: result?.source_type || null,
          wheel_name: result?.wheel_name || null,
        };
      });

      return {
        logs,
        totalCount: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled,
    staleTime: 30000,
  });
}

// 통계 조회 훅
export function useAdminRouletteStats({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['admin-roulette-stats'],
    queryFn: async () => {
      const { data: inventoryStats } = await supabase
        .from('user_roulette_rewards')
        .select('status');

      const statusCounts: Record<string, number> = { active: 0, pending: 0, used: 0, expired: 0, rejected: 0 };
      (inventoryStats || []).forEach((item: { status: string }) => {
        if (item.status && statusCounts[item.status] !== undefined) {
          statusCounts[item.status]++;
        }
      });

      const { data: usageStats } = await supabase
        .from('roulette_reward_usage_logs')
        .select('status');

      const usageStatusCounts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
      (usageStats || []).forEach((log: { status: string }) => {
        if (log.status && usageStatusCounts[log.status] !== undefined) {
          usageStatusCounts[log.status]++;
        }
      });

      // 유저 수 계산
      const uniqueUserIds = new Set((inventoryStats || []).map((i: any) => i.user_id));

      return {
        inventory: {
          total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
          userCount: uniqueUserIds.size,
          ...statusCounts,
        },
        usage: {
          total: Object.values(usageStatusCounts).reduce((a, b) => a + b, 0),
          ...usageStatusCounts,
        },
      };
    },
    enabled,
    staleTime: 60000,
  });
}

// 관리자 아이템 관리 (삭제/만료) 훅
// RPC 함수를 사용하여 RLS 우회 (SECURITY DEFINER)
export function useAdminRewardActions() {
  const queryClient = useQueryClient();

  // 아이템 만료 처리 (RPC 함수 사용)
  const expireMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const { error } = await supabase.rpc('admin_expire_roulette_reward', {
        p_reward_id: rewardId,
      });

      if (error) {
        console.error('[useAdminRewardActions] 만료 처리 실패:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-with-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-rewards-detail'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roulette-stats'] });
    },
  });

  // 아이템 삭제 (RPC 함수 사용)
  const deleteMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const { error } = await supabase.rpc('admin_delete_roulette_reward', {
        p_reward_id: rewardId,
      });

      if (error) {
        console.error('[useAdminRewardActions] 삭제 실패:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-with-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-rewards-detail'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roulette-stats'] });
    },
  });

  return {
    expireReward: expireMutation.mutateAsync,
    deleteReward: deleteMutation.mutateAsync,
    isExpiring: expireMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * 관리자용 룰렛 관리 섹션
 * - 아이템 보유 유저 목록 → 클릭 시 해당 유저 아이템 팝업
 * - 사용 요청/취소 로그 조회
 */

import { Modal } from '@/components';
import {
    useAdminRewardActions,
    useAdminRouletteStats,
    useAdminRouletteUsageLogs,
    useUserRewardsDetail,
    useUserSearch,
    useUsersWithRewards,
    type AdminRouletteInventoryItem,
    type AdminRouletteUsageLog,
    type UserSearchResult,
    type UserWithRewardsSummary,
} from '@/hooks/useAdminRouletteManagement';
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, Crown, History, Package, Radio, Search, Trash2, User as UserIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// 상태 뱃지 설정
const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-emerald-500', label: '활성' },
  pending: { dot: 'bg-amber-500', label: '대기' },
  used: { dot: 'bg-slate-400', label: '사용' },
  expired: { dot: 'bg-rose-400', label: '만료' },
  rejected: { dot: 'bg-rose-400', label: '거절' },
  approved: { dot: 'bg-sky-500', label: '승인' },
};

const REWARD_TYPE_LABELS: Record<string, string> = {
  usable: '사용형',
  digital: '디지털',
  call_minutes: '전화',
  chat_count: '채팅',
  video_minutes: '영상',
  message_count: '메시지',
};

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  stream: { label: '방송', color: 'text-violet-600' },
  profile: { label: '프로필', color: 'text-blue-600' },
};

function StatusDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { dot: 'bg-slate-400', label: status };
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span className="text-[10px] text-slate-600">{config.label}</span>
    </span>
  );
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}

// 페이지네이션
function Pagination({ page, totalPages, totalCount, pageSize, onPageChange }: {
  page: number; totalPages: number; totalCount: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  
  return (
    <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
      <span className="text-[10px] text-slate-500">{start}-{end} / {totalCount}</span>
      <div className="flex items-center gap-0.5">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"><ChevronsLeft className="w-3 h-3" /></button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"><ChevronLeft className="w-3 h-3" /></button>
        <span className="px-1.5 text-[10px] font-medium text-slate-600">{page}/{totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"><ChevronRight className="w-3 h-3" /></button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"><ChevronsRight className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

// 필터 버튼
function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
      {children}
    </button>
  );
}

// 유저 검색 드롭다운
function UserSearchDropdown({ placeholder, selectedUser, onSelect, onClear }: {
  placeholder: string; selectedUser: UserSearchResult | null; onSelect: (u: UserSearchResult) => void; onClear: () => void;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: results, isLoading } = useUserSearch({ search: searchInput, enabled: isOpen });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selectedUser) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-[11px]">
        <span className={selectedUser.is_partner ? 'text-violet-600' : 'text-slate-700'}>{selectedUser.is_partner ? '호스트' : '유저'}</span>
        <span className="font-medium text-slate-800">{selectedUser.name}</span>
        <button onClick={onClear} className="ml-1 p-0.5 hover:bg-slate-200 rounded"><X className="w-3 h-3 text-slate-500" /></button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
        <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onFocus={() => setIsOpen(true)}
          placeholder={placeholder} className="w-full pl-6 pr-2 py-1 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-400" />
      </div>
      {isOpen && searchInput.length >= 2 && (
        <div className="absolute z-10 mt-1 w-56 bg-white border border-slate-200 rounded shadow-lg max-h-48 overflow-y-auto">
          {isLoading ? <div className="px-3 py-2 text-[11px] text-slate-400">검색 중...</div> : !results?.length ? <div className="px-3 py-2 text-[11px] text-slate-400">결과 없음</div> : (
            results.map((user) => (
              <button key={user.id} onClick={() => { onSelect(user); setSearchInput(''); setIsOpen(false); }}
                className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 text-[11px]">
                <span className={`text-[10px] px-1 py-0.5 rounded ${user.is_partner ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>{user.is_partner ? '호스트' : '유저'}</span>
                <span className="font-medium text-slate-800">{user.name}</span>
                <span className="text-slate-400">{user.member_code}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// 유저 아이템 상세 모달
function UserRewardsModal({ user, isOpen, onClose }: { user: UserWithRewardsSummary | null; isOpen: boolean; onClose: () => void }) {
  const { data: items, isLoading, refetch } = useUserRewardsDetail({ userId: user?.user_id || null, enabled: isOpen && !!user });
  const { expireReward, deleteReward, isExpiring, isDeleting } = useAdminRewardActions();
  const [confirmAction, setConfirmAction] = useState<{ type: 'expire' | 'delete'; item: AdminRouletteInventoryItem } | null>(null);

  const handleExpire = async (item: AdminRouletteInventoryItem) => {
    try {
      await expireReward(item.id);
      toast.success('아이템이 만료 처리되었습니다');
      refetch();
    } catch (e) {
      toast.error('만료 처리에 실패했습니다');
    }
    setConfirmAction(null);
  };

  const handleDelete = async (item: AdminRouletteInventoryItem) => {
    try {
      await deleteReward(item.id);
      toast.success('아이템이 삭제되었습니다');
      refetch();
    } catch (e) {
      toast.error('삭제에 실패했습니다');
    }
    setConfirmAction(null);
  };

  if (!user) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`${user.user_name || '알 수 없음'}의 인벤토리`} size="lg">
        <div className="space-y-3">
          {/* 유저 요약 */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.is_partner ? 'bg-violet-100' : 'bg-slate-200'}`}>
              {user.is_partner ? <Crown className="w-5 h-5 text-violet-600" /> : <UserIcon className="w-5 h-5 text-slate-500" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{user.user_name}</span>
                <span className="text-xs text-slate-400">{user.user_code}</span>
                {user.is_partner && <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">호스트</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>총 <b className="text-slate-700">{user.total_count}</b>개</span>
                <span className="text-emerald-600">활성 {user.active_count}</span>
                <span className="text-amber-600">대기 {user.pending_count}</span>
                <span className="text-slate-400">사용 {user.used_count}</span>
              </div>
            </div>
          </div>

          {/* 아이템 목록 */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">로딩 중...</div>
            ) : !items?.length ? (
              <div className="py-8 text-center text-sm text-slate-400">아이템이 없습니다</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-500">보상</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-500">파트너</th>
                    <th className="px-2 py-1.5 text-center font-semibold text-slate-500">수량</th>
                    <th className="px-2 py-1.5 text-center font-semibold text-slate-500">상태</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-slate-500">획득</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-slate-500">날짜</th>
                    <th className="px-2 py-1.5 text-center font-semibold text-slate-500 w-[70px]">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item: AdminRouletteInventoryItem) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-2 py-1.5">
                        <div className="max-w-[130px] truncate text-slate-800">{item.reward_name}</div>
                        <div className="text-[10px] text-slate-400">{REWARD_TYPE_LABELS[item.usable_type || ''] || REWARD_TYPE_LABELS[item.reward_type]}</div>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="text-violet-600">{item.partner_name || '-'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-slate-600">{item.remaining_amount}/{item.initial_amount}</td>
                      <td className="px-2 py-1.5 text-center"><StatusDot status={item.status} /></td>
                      <td className="px-2 py-1.5">
                        {item.source_type ? (
                          <div className="flex items-center gap-1">
                            <Radio className={`w-2.5 h-2.5 ${SOURCE_TYPE_LABELS[item.source_type]?.color}`} />
                            <span className={`text-[10px] ${SOURCE_TYPE_LABELS[item.source_type]?.color}`}>{SOURCE_TYPE_LABELS[item.source_type]?.label}</span>
                            {item.donation_amount && <span className="text-[9px] text-slate-400">{item.donation_amount}P</span>}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{formatDate(item.created_at)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {item.status === 'active' && (
                            <button
                              onClick={() => setConfirmAction({ type: 'expire', item })}
                              className="p-1 rounded hover:bg-amber-100 text-amber-600"
                              title="만료 처리"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmAction({ type: 'delete', item })}
                            className="p-1 rounded hover:bg-rose-100 text-rose-500"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      {/* 확인 모달 */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'expire' ? '아이템 만료 처리' : '아이템 삭제'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {confirmAction?.type === 'expire' ? (
              <>
                <b className="text-slate-800">{confirmAction?.item.reward_name}</b> 아이템을 만료 처리하시겠습니까?
                <br />
                <span className="text-amber-600 text-xs">만료된 아이템은 사용할 수 없습니다.</span>
              </>
            ) : (
              <>
                <b className="text-slate-800">{confirmAction?.item.reward_name}</b> 아이템을 삭제하시겠습니까?
                <br />
                <span className="text-rose-500 text-xs">삭제된 아이템은 복구할 수 없습니다.</span>
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmAction(null)}
              className="px-3 py-1.5 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              onClick={() => confirmAction?.type === 'expire' ? handleExpire(confirmAction.item) : handleDelete(confirmAction!.item)}
              disabled={isExpiring || isDeleting}
              className={`px-3 py-1.5 text-sm rounded text-white ${
                confirmAction?.type === 'expire' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-rose-500 hover:bg-rose-600'
              } disabled:opacity-50`}
            >
              {isExpiring || isDeleting ? '처리 중...' : confirmAction?.type === 'expire' ? '만료 처리' : '삭제'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function AdminRouletteManagement() {
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'logs'>('inventory');

  // 유저 목록 상태
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersSearchInput, setUsersSearchInput] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState<'all' | 'user' | 'partner'>('all');
  const [selectedUser, setSelectedUser] = useState<UserWithRewardsSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 로그 상태
  const [logsPage, setLogsPage] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedLogsUser, setSelectedLogsUser] = useState<UserSearchResult | null>(null);

  const { data: stats } = useAdminRouletteStats();

  const { data: usersData, isLoading: isUsersLoading } = useUsersWithRewards({
    page: usersPage,
    pageSize: 20,
    search: usersSearch,
    roleFilter: usersRoleFilter,
    enabled: activeSubTab === 'inventory',
  });

  const { data: logsData, isLoading: isLogsLoading } = useAdminRouletteUsageLogs({
    page: logsPage,
    pageSize: 25,
    statusFilter: logsStatusFilter,
    selectedUserId: selectedLogsUser?.is_partner ? null : selectedLogsUser?.id,
    selectedPartnerId: selectedLogsUser?.is_partner ? selectedLogsUser?.partner_id : null,
    enabled: activeSubTab === 'logs',
  });

  const handleUserClick = (user: UserWithRewardsSummary) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleUsersSearch = () => {
    setUsersSearch(usersSearchInput);
    setUsersPage(1);
  };

  return (
    <div className="space-y-3">
      {/* 헤더 바 */}
      <div className="bg-white rounded border border-slate-200 px-3 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-slate-500">활성</span>
            <span className="font-bold text-slate-800">{stats?.inventory.active || 0}</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-slate-500">대기요청</span>
            <span className="font-bold text-slate-800">{stats?.usage.pending || 0}</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <span className="text-slate-400">보상 {stats?.inventory.total || 0}개 · 요청 {stats?.usage.total || 0}건</span>
        </div>
        
        <div className="flex bg-slate-100 rounded p-0.5 text-[11px]">
          <button onClick={() => setActiveSubTab('inventory')} className={`px-2.5 py-1 rounded transition-all ${activeSubTab === 'inventory' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            유저 인벤토리
          </button>
          <button onClick={() => setActiveSubTab('logs')} className={`px-2.5 py-1 rounded transition-all ${activeSubTab === 'logs' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            사용 로그
          </button>
        </div>
      </div>

      {/* 유저 인벤토리 탭 */}
      {activeSubTab === 'inventory' && (
        <div className="bg-white rounded border border-slate-200 overflow-hidden">
          {/* 필터 바 */}
          <div className="px-2 py-1.5 border-b border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
            <div className="relative flex-1 min-w-[120px] max-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input type="text" value={usersSearchInput} onChange={(e) => setUsersSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUsersSearch()}
                placeholder="유저 검색..." className="w-full pl-6 pr-2 py-1 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-400" />
            </div>
            
            <div className="h-3 w-px bg-slate-200" />
            
            <div className="flex gap-0.5">
              <FilterBtn active={usersRoleFilter === 'all'} onClick={() => { setUsersRoleFilter('all'); setUsersPage(1); }}>전체</FilterBtn>
              <FilterBtn active={usersRoleFilter === 'user'} onClick={() => { setUsersRoleFilter('user'); setUsersPage(1); }}>유저</FilterBtn>
              <FilterBtn active={usersRoleFilter === 'partner'} onClick={() => { setUsersRoleFilter('partner'); setUsersPage(1); }}>호스트</FilterBtn>
            </div>
          </div>

          {/* 유저 목록 */}
          <div className="divide-y divide-slate-50">
            {isUsersLoading ? (
              <div className="px-3 py-6 text-center text-[11px] text-slate-400">로딩 중...</div>
            ) : !usersData?.users.length ? (
              <div className="px-3 py-6 text-center text-[11px] text-slate-400">아이템을 보유한 유저가 없습니다</div>
            ) : (
              usersData.users.map((user: UserWithRewardsSummary) => (
                <button key={user.user_id} onClick={() => handleUserClick(user)}
                  className="w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left">
                  {/* 아이콘 */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${user.is_partner ? 'bg-violet-100' : 'bg-slate-100'}`}>
                    {user.is_partner ? <Crown className="w-4 h-4 text-violet-600" /> : <UserIcon className="w-4 h-4 text-slate-500" />}
                  </div>
                  
                  {/* 유저 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-slate-800 truncate">{user.user_name || '알 수 없음'}</span>
                      <span className="text-[10px] text-slate-400">{user.user_code}</span>
                      {user.is_partner && <span className="text-[9px] px-1 py-0.5 bg-violet-100 text-violet-600 rounded">호스트</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      최근: {formatDate(user.latest_reward_at)}
                    </div>
                  </div>
                  
                  {/* 통계 */}
                  <div className="flex items-center gap-2 text-[11px]">
                    <div className="text-center px-2">
                      <div className="font-bold text-slate-800">{user.total_count}</div>
                      <div className="text-[9px] text-slate-400">전체</div>
                    </div>
                    <div className="text-center px-2">
                      <div className="font-bold text-emerald-600">{user.active_count}</div>
                      <div className="text-[9px] text-slate-400">활성</div>
                    </div>
                    <div className="text-center px-2">
                      <div className="font-bold text-amber-600">{user.pending_count}</div>
                      <div className="text-[9px] text-slate-400">대기</div>
                    </div>
                    <div className="text-center px-2">
                      <div className="font-bold text-slate-400">{user.used_count}</div>
                      <div className="text-[9px] text-slate-400">사용</div>
                    </div>
                  </div>
                  
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </button>
              ))
            )}
          </div>

          <Pagination page={usersPage} totalPages={usersData?.totalPages || 1} totalCount={usersData?.totalCount || 0} pageSize={20} onPageChange={setUsersPage} />
        </div>
      )}

      {/* 사용 로그 탭 */}
      {activeSubTab === 'logs' && (
        <div className="bg-white rounded border border-slate-200 overflow-hidden">
          <div className="px-2 py-1.5 border-b border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
            <UserSearchDropdown placeholder="유저/호스트 검색..." selectedUser={selectedLogsUser}
              onSelect={(u) => { setSelectedLogsUser(u); setLogsPage(1); }} onClear={() => { setSelectedLogsUser(null); setLogsPage(1); }} />
            <div className="h-3 w-px bg-slate-200" />
            <div className="flex gap-0.5">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
                <FilterBtn key={status} active={logsStatusFilter === status} onClick={() => { setLogsStatusFilter(status); setLogsPage(1); }}>
                  {status === 'all' ? '전체' : STATUS_CONFIG[status]?.label}
                </FilterBtn>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {isLogsLoading ? (
              <div className="px-3 py-4 text-center text-[11px] text-slate-400">로딩 중...</div>
            ) : !logsData?.logs.length ? (
              <div className="px-3 py-4 text-center text-[11px] text-slate-400">데이터 없음</div>
            ) : (
              logsData.logs.map((log: AdminRouletteUsageLog) => (
                <div key={log.id} className="px-3 py-2 hover:bg-slate-50/50 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 min-w-[180px]">
                    <div className="flex items-center gap-1 bg-slate-100 rounded px-1.5 py-0.5">
                      <UserIcon className="w-3 h-3 text-slate-500" />
                      <span className="text-[11px] font-medium text-slate-700 max-w-[60px] truncate">{log.user_name || '-'}</span>
                    </div>
                    <ArrowRight className={`w-3.5 h-3.5 ${log.status === 'approved' ? 'text-emerald-500' : log.status === 'rejected' ? 'text-rose-400' : 'text-amber-400'}`} />
                    <div className="flex items-center gap-1 bg-violet-100 rounded px-1.5 py-0.5">
                      <span className="text-[11px] font-medium text-violet-700 max-w-[60px] truncate">{log.partner_name || '-'}</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-700 truncate max-w-[100px]">{log.reward_name || '-'}</span>
                      <span className="text-[10px] text-slate-400">{REWARD_TYPE_LABELS[log.usage_type] || log.usage_type}</span>
                      <span className="text-[10px] font-mono text-slate-500">×{log.amount_used}</span>
                    </div>
                    {log.source_type && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[9px] ${SOURCE_TYPE_LABELS[log.source_type]?.color}`}>{SOURCE_TYPE_LABELS[log.source_type]?.label}</span>
                        {log.wheel_name && <span className="text-[9px] text-slate-400">· {log.wheel_name}</span>}
                      </div>
                    )}
                  </div>

                  <div className="text-center w-[50px]">
                    <StatusDot status={log.status} />
                    {log.rejection_reason && <p className="text-[9px] text-rose-400 truncate max-w-[50px]" title={log.rejection_reason}>{log.rejection_reason}</p>}
                  </div>

                  <div className="text-right w-[80px] text-[10px] text-slate-400">
                    <div>{formatDate(log.requested_at)}</div>
                    {(log.approved_at || log.used_at) && <div className="text-slate-300">{formatDate(log.approved_at || log.used_at)}</div>}
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination page={logsPage} totalPages={logsData?.totalPages || 1} totalCount={logsData?.totalCount || 0} pageSize={25} onPageChange={setLogsPage} />
        </div>
      )}

      {/* 유저 아이템 상세 모달 */}
      <UserRewardsModal user={selectedUser} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

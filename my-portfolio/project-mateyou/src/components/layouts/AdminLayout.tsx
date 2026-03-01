import { useTimesheetRole } from '@/hooks/useTimesheetRole'
import { useNavigate } from '@tanstack/react-router'
import React, { type ReactNode } from 'react'

type TabType = 'stats' | 'audit' | 'stores' | 'managers' | 'partners' | 'settings'

interface Tab {
  id: TabType
  label: string
  icon: () => React.JSX.Element
  adminOnly?: boolean // admin만 접근 가능한 탭
}

interface AdminLayoutProps {
  children: ReactNode
  activeTab: TabType
  tabs?: Tab[]
}

// 아이콘 컴포넌트들
const IconStats = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const IconAudit = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const IconStore = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
)

const IconManager = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const IconPartner = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

const IconSettings = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

export const defaultTabs: Tab[] = [
  { id: 'stats', label: '통계', icon: IconStats },
  { id: 'audit', label: '감사 로그', icon: IconAudit, adminOnly: true },
  { id: 'stores', label: '가게 관리', icon: IconStore, adminOnly: true },
  { id: 'managers', label: '매니저 관리', icon: IconManager, adminOnly: true },
  { id: 'partners', label: '파트너+', icon: IconPartner },
  { id: 'settings', label: '설정', icon: IconSettings, adminOnly: true },
]

export function AdminLayout({ children, activeTab, tabs = defaultTabs }: AdminLayoutProps) {
  const navigate = useNavigate()
  const { isAdmin, isPartnerManager } = useTimesheetRole()
  
  // 매니저는 adminOnly가 아닌 탭만 표시
  const filteredTabs = tabs.filter(tab => {
    if (isAdmin) return true // admin은 모든 탭 접근 가능
    if (isPartnerManager) return !tab.adminOnly // 매니저는 adminOnly 제외
    return true // 기본값
  })

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50" style={{ minHeight: '100dvh' }}>
      {/* 모바일 상단 헤더 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate({ to: '/timesheet' })}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">출근부</span>
          </button>
          <h1 className="text-lg font-bold text-slate-900">관리자</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* PC 사이드바 */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 fixed left-0 top-0 h-full z-40">
        <div className="p-6 border-b border-slate-100" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
          <h1 className="text-xl font-bold text-slate-900">출근부 관리</h1>
          <p className="text-sm text-slate-500 mt-1">Administrator</p>
        </div>
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {filteredTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => navigate({ to: `/timesheet/admin/${tab.id}` })}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon />
                    <span>{tab.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => navigate({ to: '/timesheet' })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-medium">출근부 메인</span>
          </button>
        </div>
      </aside>

      {/* 모바일 탭 네비게이션 */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex">
          {filteredTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => navigate({ to: `/timesheet/admin/${tab.id}` })}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                  activeTab === tab.id
                    ? 'text-indigo-600'
                    : 'text-slate-400'
                }`}
              >
                <Icon />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* 메인 콘텐츠 - 모바일 */}
      <main 
        className="flex-1 lg:hidden pb-24 bg-slate-50 overflow-y-auto"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        }}
      >
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          {children}
        </div>
      </main>

      {/* 메인 콘텐츠 - PC */}
      <main className="hidden lg:block flex-1 ml-64">
        <div className="py-8 bg-slate-50">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-24">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}


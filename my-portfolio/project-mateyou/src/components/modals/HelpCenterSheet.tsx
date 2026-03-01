import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search as SearchIcon, X, ChevronDown } from 'lucide-react'
import { Typography } from '@/components/ui/Typography'

interface HelpCenterSheetProps {
  isOpen: boolean
  onClose: () => void
}

interface FaqEntry {
  question: string
  answer: string
}

interface FaqGroup {
  title: string
  entries: FaqEntry[]
}

const faqItems: FaqGroup[] = [
  {
    title: '결제 및 환불',
    entries: [
      {
        question: '포인트 충전은 어떻게 하나요?',
        answer: '마이페이지 > 포인트 메뉴에서 원하는 금액을 선택하여 충전할 수 있습니다. 카드결제, 간편결제 등 다양한 결제 수단을 지원합니다.',
      },
      {
        question: '환불은 어디에서 신청하나요?',
        answer: '미사용 포인트에 한해 환불이 가능합니다. contact@mateyou.me로 환불 요청 메일을 보내주시면 영업일 기준 3~5일 내 처리됩니다.',
      },
      {
        question: '영수증은 어디에서 확인하나요?',
        answer: '마이페이지 > 포인트 > 포인트 내역에서 충전 내역과 영수증을 확인하실 수 있습니다.',
      },
    ],
  },
  {
    title: '파트너와 소통하기',
    entries: [
      {
        question: '메시지가 전송되지 않을 때',
        answer: '네트워크 연결 상태를 확인해주세요. 문제가 지속되면 앱을 재시작하거나 캐시를 삭제 후 다시 시도해주세요.',
      },
      {
        question: '영상/이미지 업로드 오류 해결',
        answer: '파일 크기가 너무 크거나 지원되지 않는 형식일 수 있습니다. 이미지는 10MB 이하의 JPG, PNG, GIF를, 영상은 100MB 이하의 MP4, MOV 형식을 권장합니다.',
      },
      {
        question: '파트너 신고는 어떻게 하나요?',
        answer: '파트너 프로필 > 더보기(⋯) > 신고하기를 통해 신고할 수 있습니다. 신고 사유를 상세히 작성해주시면 빠른 처리에 도움이 됩니다.',
      },
    ],
  },
  {
    title: '계정 및 보안',
    entries: [
      {
        question: '비밀번호를 재설정하고 싶어요',
        answer: '로그인 화면 > "비밀번호를 잊으셨나요?" 를 클릭하면 가입된 이메일로 비밀번호 재설정 링크가 발송됩니다.',
      },
      {
        question: '이상 로그인 알림을 받았어요',
        answer: '본인이 아닌 경우 즉시 비밀번호를 변경하고, contact@mateyou.me로 문의해주세요. 계정 보안을 위해 2단계 인증 설정을 권장드립니다.',
      },
      {
        question: '2단계 인증을 켜고 싶어요',
        answer: '현재 2단계 인증 기능은 준비 중입니다. 빠른 시일 내에 제공될 예정이오니 조금만 기다려주세요!',
      },
    ],
  },
]

export function HelpCenterSheet({ isOpen, onClose }: HelpCenterSheetProps) {
  const [isMounted, setIsMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let raf1: number | null = null
    let raf2: number | null = null

    if (isOpen) {
      setIsMounted(true)
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      timeoutId = setTimeout(() => setIsMounted(false), 360)
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isMounted) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isMounted])

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  // 검색 필터링
  const filteredItems = searchQuery.trim()
    ? faqItems.map((group) => ({
        ...group,
        entries: group.entries.filter(
          (entry) =>
            entry.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            entry.answer.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((group) => group.entries.length > 0)
    : faqItems

  if (!isMounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col bg-white shadow-2xl transition-transform duration-400 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: 'calc(100% - env(safe-area-inset-top, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <header className="relative border-b border-gray-100 px-6 py-4">
          <button
            className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
          <Typography variant="h5" className="text-center text-lg font-semibold text-[#110f1a]">
            도움말
          </Typography>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="rounded-3xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <SearchIcon className="h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="어떤 도움을 찾고 계신가요?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-[#110f1a] outline-none placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-gray-200 rounded-full"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-8 space-y-6">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <Typography variant="body1" className="text-gray-400">
                  검색 결과가 없습니다
                </Typography>
              </div>
            ) : (
              filteredItems.map((group) => (
                <section key={group.title} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                  <Typography variant="h6" className="text-base font-semibold text-[#110f1a]">
                    {group.title}
                  </Typography>
                  <ul className="mt-4 space-y-3">
                    {group.entries.map((entry) => {
                      const itemKey = `${group.title}-${entry.question}`
                      const isExpanded = expandedItems.has(itemKey)
                      
                      return (
                        <li key={entry.question}>
                          <button
                            type="button"
                            onClick={() => toggleItem(itemKey)}
                            className="w-full text-left rounded-2xl bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-700">
                                {entry.question}
                              </span>
                              <ChevronDown 
                                className={`h-4 w-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <p className="text-sm text-gray-600 leading-relaxed">
                                  {entry.answer}
                                </p>
                              </div>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-5 space-y-3">
          <a
            href="https://open.kakao.com/o/sCP1jAbi"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-[#FEE500] px-4 py-3 text-sm font-semibold text-[#3C1E1E] transition hover:brightness-95"
          >
            카톡으로 문의
          </a>
          <Typography variant="body2" className="text-center text-xs text-gray-400">
            추가 도움이 필요하시면 contact@mateyou.me 로 문의해주세요.
          </Typography>
        </div>
      </div>
    </div>,
    document.body,
  )
}

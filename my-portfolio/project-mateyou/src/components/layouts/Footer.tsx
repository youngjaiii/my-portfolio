import { useEffect, useState } from 'react'
import {
  PrivacyPolicyModal,
  ServiceTermsModal,
  TermsModal,
  Typography,
} from '@/components'

export function Footer() {
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false)
  const [isServiceTermsModalOpen, setIsServiceTermsModalOpen] = useState(false)
  const [isPrivacyPolicyModalOpen, setIsPrivacyPolicyModalOpen] =
    useState(false)

  const updateModalQuery = (value: 'terms' | 'privacy' | null) => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    if (value) {
      url.searchParams.set('modal', value)
    } else {
      url.searchParams.delete('modal')
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    try {
      window.history.replaceState(null, '', nextUrl)
    } catch (error) {
      console.warn('replaceState failed:', error)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncModalFromQuery = () => {
      const params = new URLSearchParams(window.location.search)
      const modalParam = params.get('modal')

      setIsServiceTermsModalOpen(modalParam === 'terms')
      setIsPrivacyPolicyModalOpen(modalParam === 'privacy')
    }

    syncModalFromQuery()
    const handlePopState = () => syncModalFromQuery()

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const openServiceTerms = () => {
    setIsServiceTermsModalOpen(true)
    setIsPrivacyPolicyModalOpen(false)
    updateModalQuery('terms')
  }

  const openPrivacyPolicy = () => {
    setIsPrivacyPolicyModalOpen(true)
    setIsServiceTermsModalOpen(false)
    updateModalQuery('privacy')
  }

  const closeServiceTerms = () => {
    setIsServiceTermsModalOpen(false)
    updateModalQuery(null)
  }

  const closePrivacyPolicy = () => {
    setIsPrivacyPolicyModalOpen(false)
    updateModalQuery(null)
  }

  return (
    <>
      <footer className="bg-gradient-to-b from-gray-50 to-white border-t border-gray-100 pb-20">
        <div className="container mx-auto px-4 sm:px-6 py-8">
          {/* Navigation Links */}
          <div className="flex flex-wrap justify-center gap-6 mb-8">
            <button
              onClick={openServiceTerms}
              className="text-gray-600 hover:text-blue-600 text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              이용약관
            </button>
            <div className="w-px h-4 bg-gray-300 self-center"></div>
            <button
              onClick={openPrivacyPolicy}
              className="text-gray-600 hover:text-blue-600 text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              개인정보처리방침
            </button>
            <div className="w-px h-4 bg-gray-300 self-center"></div>
            <button
              onClick={() => setIsTermsModalOpen(true)}
              className="text-gray-600 hover:text-blue-600 text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              환불규정
            </button>
            <div className="w-px h-4 bg-gray-300 self-center"></div>
            <a
              href="mailto:iky.co.ltd1015@gmail.com"
              className="text-gray-600 hover:text-blue-600 text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              고객센터
            </a>
          </div>

          {/* Company Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <div className="grid md:grid-cols-3 gap-6 text-sm">
              {/* Company Info */}
              <div className="space-y-3">
                <Typography variant="body2" className="text-gray-600 font-medium mb-3">
                  회사 정보
                </Typography>
                <div className="space-y-2">
                  <Typography variant="caption" className="text-gray-500 block">
                    상호명: 주식회사 아이케이와이(IKY Co.,Ltd.)
                  </Typography>
                  <Typography variant="caption" className="text-gray-500 block">
                    대표자: 임문상
                  </Typography>
                  <Typography variant="caption" className="text-gray-500 block">
                    사업자등록번호: 620-86-03237
                  </Typography>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-3">
                <Typography variant="body2" className="text-gray-600 font-medium mb-3">
                  연락처 및 주소
                </Typography>
                <div className="space-y-2">
                  <Typography variant="caption" className="text-gray-500 block">
                    이메일: iky.co.ltd1015@gmail.com
                  </Typography>
                  <Typography variant="caption" className="text-gray-500 block">
                    전화: 010-8712-9811
                  </Typography>
                  <Typography variant="caption" className="text-gray-500 block">
                    주소: 서울시 마포구 독막로6길 27 3층
                  </Typography>
                </div>
              </div>

              {/* Additional Info */}
              <div className="space-y-3">
                <Typography variant="body2" className="text-gray-600 font-medium mb-3">
                  법적 정보
                </Typography>
                <div className="space-y-2">
                  <Typography variant="caption" className="text-gray-500 block">
                    통신판매업신고: 서울특별시 마포구 02-3153-8564
                  </Typography>
                  <Typography variant="caption" className="text-gray-500 block">
                    전자상거래법 및 소비자보호법에 따른 규정 준수
                  </Typography>
                </div>
              </div>
            </div>

            {/* Copyright */}
            <div className="text-center">
              <Typography variant="caption" className="text-gray-400">
                © 2025 주식회사 아이케이와이. All rights reserved.
              </Typography>
            </div>
          </div>
        </div>
      </footer>

      <ServiceTermsModal
        isOpen={isServiceTermsModalOpen}
        onClose={closeServiceTerms}
      />
      <PrivacyPolicyModal
        isOpen={isPrivacyPolicyModalOpen}
        onClose={closePrivacyPolicy}
      />
      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
      />
    </>
  )
}

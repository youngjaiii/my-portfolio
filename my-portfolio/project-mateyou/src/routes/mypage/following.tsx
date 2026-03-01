import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Grid, Navigation, PartnerCard, Typography } from '@/components'
import type { ApiResponse, PartnerWithMember } from '@/types/database'
import { edgeApi } from '@/lib/edgeApi'

export const Route = createFileRoute('/mypage/following' as const)({
  component: FollowingPage,
})

function FollowingPage() {
  const [partners, setPartners] = useState<PartnerWithMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchPartners = async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const response = (await edgeApi.partners.getList({
          limit: 24,
          sort: 'recent',
        })) as ApiResponse<{ partners: PartnerWithMember[] }>
        if (!mounted) return
        setPartners(response?.data?.partners ?? [])
      } catch (error) {
        if (!mounted) return
        setErrorMessage('팔로잉 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchPartners()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Navigation />
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-6 sm:px-8">
        <Typography variant="h3" className="text-2xl font-semibold text-[#110f1a]">
          팔로잉 중인 파트너
        </Typography>
        <p className="mt-2 text-sm text-gray-500">팔로잉 중인 파트너를 확인해보세요.</p>

        <div className="mt-8">
          {isLoading ? (
            <div className="rounded-3xl border border-gray-100 bg-white py-12 text-center text-gray-400 shadow-sm">
              팔로잉 리스트를 불러오는 중입니다...
            </div>
          ) : errorMessage ? (
            <div className="rounded-3xl border border-red-100 bg-red-50 py-12 text-center text-sm text-red-600 shadow-sm">
              {errorMessage}
            </div>
          ) : partners.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-400 shadow-sm">
              아직 팔로잉한 파트너가 없습니다.
            </div>
          ) : (
            <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
              {partners.map((partner) => (
                <PartnerCard key={partner.id} partner={partner} />
              ))}
            </Grid>
          )}
        </div>
      </div>
    </div>
  )
}

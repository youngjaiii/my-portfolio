import { Flex } from '@/components'

interface LoadingSpinnerProps {
  message?: string
}

export function LoadingSpinner({
  message,
}: LoadingSpinnerProps) {
  return (
    <Flex align="center" justify="center" className="min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FE3A8F] mx-auto"></div>
        {message && <p className="text-gray-600 mt-4">{message}</p>}
      </div>
    </Flex>
  )
}

/**
 * CollectionProgressCard - 컬렉션 진행률 카드
 * 
 * Phase 5-B: 디지털 보상 컬렉션 시스템
 * - 컬렉션별 진행률 표시
 * - 미수집 아이템은 실루엣 표시
 * - 완성 시 보상 수령 버튼
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gift, Lock, CheckCircle, Sparkles } from 'lucide-react'
import { Typography, Button, Modal } from '@/components/ui'
import { useClaimCollectionReward, type UserCollectionProgress } from '@/hooks/useRouletteCollections'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface CollectionProgressCardProps {
  collection: UserCollectionProgress
  userId: string
  onClick?: () => void
}

export function CollectionProgressCard({ collection, userId, onClick }: CollectionProgressCardProps) {
  const [showClaimModal, setShowClaimModal] = useState(false)
  const claimReward = useClaimCollectionReward()
  
  const progress = collection.collected_count / collection.total_items
  const progressPercent = Math.round(progress * 100)
  
  // 완성 보상 수령 핸들러
  const handleClaim = async () => {
    try {
      const result = await claimReward.mutateAsync({
        userId,
        collectionId: collection.collection_id,
      })
      
      setShowClaimModal(false)
      
      if (result.reward_name) {
        toast.success(`${result.reward_name}을(를) 받았습니다!`)
      } else {
        toast.success('컬렉션을 완성했습니다!')
      }
    } catch (error: any) {
      toast.error(error.message || '보상 수령에 실패했습니다')
    }
  }
  
  return (
    <>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={cn(
          "relative p-4 rounded-xl cursor-pointer",
          "bg-gradient-to-br from-purple-50 to-pink-50",
          "border-2",
          collection.is_completed 
            ? "border-purple-400 shadow-lg shadow-purple-200/50" 
            : "border-purple-100",
          "hover:shadow-md transition-all"
        )}
      >
        {/* 완성 뱃지 */}
        {collection.is_completed && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          </div>
        )}
        
        {/* 썸네일 또는 아이콘 */}
        <div className="w-full aspect-square mb-3 rounded-lg overflow-hidden bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center">
          {collection.thumbnail_url ? (
            <img 
              src={collection.thumbnail_url} 
              alt={collection.collection_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Gift className="w-12 h-12 text-purple-400" />
          )}
        </div>
        
        {/* 컬렉션 이름 */}
        <Typography variant="subtitle2" className="font-bold text-gray-800 mb-1 truncate">
          {collection.collection_name}
        </Typography>
        
        {/* 진행률 */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <Typography variant="caption" className="text-gray-500">
              수집 진행률
            </Typography>
            <Typography variant="caption" className="text-purple-600 font-bold">
              {collection.collected_count}/{collection.total_items}
            </Typography>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
              className={cn(
                "h-full rounded-full",
                collection.is_completed
                  ? "bg-gradient-to-r from-purple-500 to-pink-500"
                  : "bg-purple-400"
              )}
            />
          </div>
        </div>
        
        {/* 완성 보상 버튼 */}
        {collection.is_completed && !collection.completion_reward_claimed && collection.has_completion_reward && (
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setShowClaimModal(true)
            }}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            보상 받기
          </Button>
        )}
        
        {collection.is_completed && collection.completion_reward_claimed && (
          <div className="text-center py-1.5 bg-gray-100 rounded-lg">
            <Typography variant="caption" className="text-gray-500">
              ✓ 보상 수령 완료
            </Typography>
          </div>
        )}
      </motion.div>
      
      {/* 보상 수령 확인 모달 */}
      <Modal
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        title="컬렉션 완성 보상"
        size="sm"
      >
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
            <Gift className="w-10 h-10 text-purple-500" />
          </div>
          
          <Typography variant="h6" className="text-gray-800 mb-2">
            {collection.collection_name}
          </Typography>
          
          <Typography variant="body2" className="text-gray-600 mb-4">
            컬렉션을 완성했습니다! 🎉
            <br />
            완성 보상을 받으시겠습니까?
          </Typography>
          
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowClaimModal(false)}
              className="flex-1"
            >
              나중에
            </Button>
            <Button
              variant="primary"
              onClick={handleClaim}
              disabled={claimReward.isPending}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {claimReward.isPending ? '처리 중...' : '받기'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ============================================================
// 컬렉션 상세 카드 (아이템 목록 포함)
// ============================================================

interface CollectionDetailItem {
  id: string
  roulette_item_id: string
  item_order: number
  is_collected: boolean
  roulette_item?: {
    id: string
    name: string
    digital_file_url?: string | null
  }
}

interface CollectionDetailCardProps {
  collectionName: string
  items: CollectionDetailItem[]
  onItemClick?: (item: CollectionDetailItem) => void
}

export function CollectionDetailItems({ collectionName, items, onItemClick }: CollectionDetailCardProps) {
  return (
    <div className="space-y-4">
      <Typography variant="h6" className="text-gray-800">
        {collectionName}
      </Typography>
      
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => item.is_collected && onItemClick?.(item)}
            className={cn(
              "aspect-square rounded-xl overflow-hidden relative",
              item.is_collected 
                ? "cursor-pointer hover:ring-2 hover:ring-purple-400" 
                : "cursor-default"
            )}
          >
            {item.is_collected ? (
              // 수집한 아이템 - 이미지 표시
              <>
                {item.roulette_item?.digital_file_url ? (
                  <img
                    src={item.roulette_item.digital_file_url}
                    alt={item.roulette_item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center">
                    <Gift className="w-8 h-8 text-purple-400" />
                  </div>
                )}
                {/* 순서 뱃지 */}
                <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center">
                  {item.item_order + 1}
                </div>
              </>
            ) : (
              // 미수집 아이템 - 실루엣/? 표시
              <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex flex-col items-center justify-center">
                <Lock className="w-8 h-8 text-gray-400 mb-1" />
                <Typography variant="caption" className="text-gray-500">
                  ???
                </Typography>
                {/* 순서 뱃지 */}
                <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center">
                  {item.item_order + 1}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

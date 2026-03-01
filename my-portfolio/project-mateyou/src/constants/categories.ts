export type CategoryDetail = {
  id: string
  label: string
  apiId: number
}

export type CategoryConfig = {
  id: string
  label: string
  apiId: number
  details: CategoryDetail[]
}

// 대분류: 메이트, 샐럽/모델, 메이드, 지하돌, 코스어
// 소분류: 메이트만 (롤, 배틀그라운드, 오버워치, 발로란트, 스팀게임, 그외게임)
export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'mate',
    label: '메이트',
    apiId: 1,
    details: [
      { id: 'lol', label: '롤', apiId: 1 },
      { id: 'pubg', label: '배틀그라운드', apiId: 2 },
      { id: 'overwatch', label: '오버워치', apiId: 3 },
      { id: 'valorant', label: '발로란트', apiId: 4 },
      { id: 'steam', label: '스팀게임', apiId: 5 },
      { id: 'other-game', label: '그외게임', apiId: 6 },
    ],
  },
  {
    id: 'celeb-model',
    label: '샐럽/모델',
    apiId: 2,
    details: [],
  },
  {
    id: 'maid',
    label: '메이드',
    apiId: 3,
    details: [],
  },
  {
    id: 'underground-idol',
    label: '지하돌',
    apiId: 4,
    details: [],
  },
  {
    id: 'coser',
    label: '코스어',
    apiId: 5,
    details: [],
  },
]

// 카테고리 ID로 카테고리 찾기
export const getCategoryById = (categoryId: number): CategoryConfig | undefined => {
  return CATEGORIES.find((c) => c.apiId === categoryId)
}

// 상세 카테고리 ID로 상세 카테고리 라벨 찾기
export const getDetailLabel = (categoryId: number, detailId: number): string => {
  const category = getCategoryById(categoryId)
  if (!category) return ''
  const detail = category.details.find((d) => d.apiId === detailId)
  return detail?.label || ''
}

// 카테고리 라벨 가져오기
export const getCategoryLabel = (categoryId: number): string => {
  const category = getCategoryById(categoryId)
  return category?.label || ''
}

// 서브 카테고리 라벨 매핑 (기존 호환성 유지)
export const SUB_CATEGORY_LABELS: Record<number, Record<number, string>> = {
  1: { 1: '롤', 2: '배틀그라운드', 3: '오버워치', 4: '발로란트', 5: '스팀게임', 6: '그외게임' },
  2: {},
  3: {},
  4: {},
  5: {},
}

export const getSubCategoryLabel = (categoryId: number, detailId: number): string => {
  return SUB_CATEGORY_LABELS[categoryId]?.[detailId] || ''
}

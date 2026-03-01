interface StoreFilterTabsProps {
  activeProductType: 'all' | 'digital' | 'on_site' | 'delivery';
  activeSource: 'all' | 'partner' | 'collaboration';
  onProductTypeChange: (type: 'all' | 'digital' | 'on_site' | 'delivery') => void;
  onSourceChange: (source: 'all' | 'partner' | 'collaboration') => void;
}

export function StoreFilterTabs({
  activeProductType,
  activeSource,
  onProductTypeChange,
  onSourceChange,
}: StoreFilterTabsProps) {
  const productTypeTabs = [
    { key: 'all' as const, label: '전체' },
    { key: 'digital' as const, label: '디지털' },
    { key: 'on_site' as const, label: '현장수령' },
    { key: 'delivery' as const, label: '택배' },
  ];

  const sourceOptions = [
    { key: 'all' as const, label: '전체' },
    { key: 'partner' as const, label: '개인' },
    { key: 'collaboration' as const, label: '협업' },
  ];

  return (
    <div className="space-y-3">
      {/* 상품 타입 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {productTypeTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onProductTypeChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeProductType === tab.key
                ? 'bg-[#FE3A8F] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}





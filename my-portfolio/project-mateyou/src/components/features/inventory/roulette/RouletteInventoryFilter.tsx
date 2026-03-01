/**
 * 룰렛 인벤토리 필터 컴포넌트
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RouletteInventoryFilter } from './types';

interface RouletteInventoryFilterProps {
  filters: RouletteInventoryFilter;
  onFiltersChange: (filters: RouletteInventoryFilter) => void;
  partnerOptions?: Array<{ id: string; name: string }>;
}

export function RouletteInventoryFilter({
  filters,
  onFiltersChange,
  partnerOptions = [],
}: RouletteInventoryFilterProps) {
  const [isPartnerOpen, setIsPartnerOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  const selectedPartner = partnerOptions.find((p) => p.id === filters.partner_id);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 파트너 필터 */}
      {partnerOptions.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsPartnerOpen(!isPartnerOpen)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span>{selectedPartner ? selectedPartner.name : '전체 파트너'}</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {isPartnerOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsPartnerOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[150px]">
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({ ...filters, partner_id: undefined });
                    setIsPartnerOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                >
                  전체 파트너
                </button>
                {partnerOptions.map((partner) => (
                  <button
                    key={partner.id}
                    type="button"
                    onClick={() => {
                      onFiltersChange({ ...filters, partner_id: partner.id });
                      setIsPartnerOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {partner.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 정렬 필터 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsSortOpen(!isSortOpen)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span>{filters.sort === 'latest' ? '최신순' : '과거순'}</span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {isSortOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsSortOpen(false)}
            />
            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[100px]">
              <button
                type="button"
                onClick={() => {
                  onFiltersChange({ ...filters, sort: 'latest' });
                  setIsSortOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
              >
                최신순
              </button>
              <button
                type="button"
                onClick={() => {
                  onFiltersChange({ ...filters, sort: 'oldest' });
                  setIsSortOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
              >
                과거순
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


import { Plus, X, GripVertical } from 'lucide-react';
import { Input } from '@/components';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProductOptionInput } from '@/api/store/products';

interface ProductOptionEditorProps {
  options: ProductOptionInput[];
  onChange: (options: ProductOptionInput[]) => void;
}

export function ProductOptionEditor({ options, onChange }: ProductOptionEditorProps) {
  const addOption = () => {
    onChange([
      ...options,
      { name: '', option_type: 'select', is_required: true, values: [{ value: '', price_adjustment: 0 }] }
    ]);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, field: keyof ProductOptionInput, value: any) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    
    if (field === 'option_type') {
      if (value === 'select' && !newOptions[index].values?.length) {
        newOptions[index].values = [{ value: '', price_adjustment: 0 }];
      } else if (value === 'text') {
        delete newOptions[index].values;
      }
    }
    onChange(newOptions);
  };

  const addOptionValue = (optionIndex: number) => {
    const newOptions = [...options];
    if (!newOptions[optionIndex].values) {
      newOptions[optionIndex].values = [];
    }
    newOptions[optionIndex].values!.push({ value: '', price_adjustment: 0 });
    onChange(newOptions);
  };

  const removeOptionValue = (optionIndex: number, valueIndex: number) => {
    const newOptions = [...options];
    newOptions[optionIndex].values = newOptions[optionIndex].values!.filter((_, i) => i !== valueIndex);
    onChange(newOptions);
  };

  const updateOptionValue = (optionIndex: number, valueIndex: number, field: string, value: any) => {
    const newOptions = [...options];
    newOptions[optionIndex].values![valueIndex] = {
      ...newOptions[optionIndex].values![valueIndex],
      [field]: value
    };
    onChange(newOptions);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">상품 옵션</label>
        <button
          type="button"
          onClick={addOption}
          className="flex items-center gap-1 text-xs text-[#FE3A8F] hover:text-[#e8a0c0]"
        >
          <Plus className="h-3 w-3" />
          옵션 추가
        </button>
      </div>

      {options.length === 0 ? (
        <div className="p-4 bg-gray-50 rounded-lg text-center">
          <p className="text-sm text-gray-500">등록된 옵션이 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">옵션을 추가하여 사이즈, 색상 등을 설정하세요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {options.map((option, optionIndex) => (
            <div key={optionIndex} className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-700">옵션 {optionIndex + 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(optionIndex)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">옵션명</label>
                  <Input
                    type="text"
                    placeholder="예: 사이즈"
                    value={option.name}
                    onChange={(e) => updateOption(optionIndex, 'name', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">옵션 유형</label>
                  <Select
                    value={option.option_type}
                    onValueChange={(value) => updateOption(optionIndex, 'option_type', value)}
                  >
                    <SelectTrigger className="w-full h-10 text-sm border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="select">선택형</SelectItem>
                      <SelectItem value="text">입력형</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={option.is_required}
                  onChange={(e) => updateOption(optionIndex, 'is_required', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                />
                <span className="text-xs text-gray-600">필수 선택</span>
              </label>

              {option.option_type === 'select' && (
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">옵션 값</span>
                    <button
                      type="button"
                      onClick={() => addOptionValue(optionIndex)}
                      className="flex items-center gap-1 text-xs text-[#FE3A8F] hover:text-[#e8a0c0]"
                    >
                      <Plus className="h-3 w-3" />
                      값 추가
                    </button>
                  </div>
                  
                  {option.values?.map((val, valueIndex) => (
                    <div key={valueIndex} className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="예: M"
                        value={val.value}
                        onChange={(e) => updateOptionValue(optionIndex, valueIndex, 'value', e.target.value)}
                        className="flex-1 text-sm"
                      />
                      <div className="relative w-24">
                        <Input
                          type="number"
                          placeholder="0"
                          value={val.price_adjustment || ''}
                          onChange={(e) => updateOptionValue(optionIndex, valueIndex, 'price_adjustment', parseInt(e.target.value) || 0)}
                          className="text-sm pr-6"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">P</span>
                      </div>
                      <div className="relative w-20">
                        <Input
                          type="number"
                          placeholder="-"
                          value={val.stock ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateOptionValue(optionIndex, valueIndex, 'stock', v === '' ? undefined : parseInt(v) || 0);
                          }}
                          className="text-sm pr-6"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">개</span>
                      </div>
                      {(option.values?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOptionValue(optionIndex, valueIndex)}
                          className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {option.values && option.values.length > 0 && (
                    <p className="text-xs text-gray-400">추가 가격 0 = 기본 가격, 재고 미입력 = 무제한</p>
                  )}
                </div>
              )}

              {option.option_type === 'text' && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-400">구매자가 자유롭게 입력할 수 있는 옵션입니다 (예: 각인 문구, 요청사항)</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


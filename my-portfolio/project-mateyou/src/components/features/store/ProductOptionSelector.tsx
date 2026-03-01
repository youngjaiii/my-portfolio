import { useState, useEffect } from 'react';
import { Input } from '@/components';
import type { ProductOption, SelectedOption } from '@/api/store/products';

interface ProductOptionSelectorProps {
  options: ProductOption[];
  selectedOptions: SelectedOption[];
  onChange: (selectedOptions: SelectedOption[]) => void;
}

export function ProductOptionSelector({ options, selectedOptions, onChange }: ProductOptionSelectorProps) {
  const updateSelectedOption = (option: ProductOption, value?: string, valueId?: string, textValue?: string) => {
    const existingIndex = selectedOptions.findIndex(so => so.option_id === option.option_id);
    const newSelectedOptions = [...selectedOptions];

    if (option.option_type === 'select' && valueId) {
      const selectedValue = option.values?.find(v => v.value_id === valueId);
      const newOption: SelectedOption = {
        option_id: option.option_id,
        option_name: option.name,
        option_type: 'select',
        value_id: valueId,
        value: selectedValue?.value || value,
        price_adjustment: selectedValue?.price_adjustment || 0
      };

      if (existingIndex >= 0) {
        newSelectedOptions[existingIndex] = newOption;
      } else {
        newSelectedOptions.push(newOption);
      }
    } else if (option.option_type === 'text') {
      const newOption: SelectedOption = {
        option_id: option.option_id,
        option_name: option.name,
        option_type: 'text',
        text_value: textValue || '',
        price_adjustment: 0
      };

      if (existingIndex >= 0) {
        newSelectedOptions[existingIndex] = newOption;
      } else {
        newSelectedOptions.push(newOption);
      }
    }

    onChange(newSelectedOptions);
  };

  const getSelectedValueId = (optionId: string): string | undefined => {
    return selectedOptions.find(so => so.option_id === optionId)?.value_id;
  };

  const getTextValue = (optionId: string): string => {
    return selectedOptions.find(so => so.option_id === optionId)?.text_value || '';
  };

  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {options.map((option) => (
        <div key={option.option_id} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{option.name}</span>
            {option.is_required && (
              <span className="text-xs text-red-500">*필수</span>
            )}
          </div>

          {option.option_type === 'select' && option.values && (
            <div className="flex flex-wrap gap-2">
              {option.values.map((val) => {
                const isSelected = getSelectedValueId(option.option_id) === val.value_id;
                return (
                  <button
                    key={val.value_id}
                    type="button"
                    onClick={() => updateSelectedOption(option, val.value, val.value_id)}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                      isSelected
                        ? 'bg-[#FE3A8F] text-white border-[#FE3A8F]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#FE3A8F]'
                    }`}
                  >
                    {val.value}
                    {val.price_adjustment > 0 && (
                      <span className={`ml-1 text-xs ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                        (+{val.price_adjustment.toLocaleString()}P)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {option.option_type === 'text' && (
            <Input
              type="text"
              placeholder={`${option.name}을(를) 입력하세요`}
              value={getTextValue(option.option_id)}
              onChange={(e) => updateSelectedOption(option, undefined, undefined, e.target.value)}
              className="text-sm"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function calculateOptionsTotalPrice(selectedOptions: SelectedOption[]): number {
  return selectedOptions.reduce((sum, opt) => sum + (opt.price_adjustment || 0), 0);
}

export function validateRequiredOptions(options: ProductOption[], selectedOptions: SelectedOption[]): boolean {
  const requiredOptions = options.filter(opt => opt.is_required);
  
  for (const reqOpt of requiredOptions) {
    const selected = selectedOptions.find(so => so.option_id === reqOpt.option_id);
    if (!selected) return false;
    
    if (reqOpt.option_type === 'select' && !selected.value_id) return false;
  }
  
  return true;
}

export function formatSelectedOptionsForApi(selectedOptions: SelectedOption[]): Array<{ option_id: string; value_id?: string; text_value?: string }> {
  return selectedOptions
    .filter(opt => opt.value_id || opt.text_value)
    .map(opt => {
      if (opt.option_type === 'select') {
        return { option_id: opt.option_id, value_id: opt.value_id };
      }
      return { option_id: opt.option_id, text_value: opt.text_value };
    });
}



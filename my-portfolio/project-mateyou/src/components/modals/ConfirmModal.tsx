import { Button, Flex, Modal } from '@/components'
import { AlertTriangle, HelpCircle, Info } from 'lucide-react'

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary' | 'info'
  isLoading?: boolean
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'primary',
  isLoading = false,
}: ConfirmModalProps) {
  
  const iconMap = {
    danger: <AlertTriangle className="w-6 h-6 text-rose-500" />,
    primary: <HelpCircle className="w-6 h-6 text-indigo-500" />,
    info: <Info className="w-6 h-6 text-blue-500" />,
  }

  const confirmButtonVariant = variant === 'danger' ? 'primary' : 'primary' // Button doesn't have a 'danger' variant in this project's Button component likely, need to check Button.tsx

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full shrink-0 ${
            variant === 'danger' ? 'bg-rose-50' : 
            variant === 'info' ? 'bg-blue-50' : 'bg-indigo-50'
          }`}>
            {iconMap[variant]}
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">{message}</p>
          </div>
        </div>

        <Flex justify="end" gap={3} className="pt-4 mt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button 
            variant="primary" 
            onClick={onConfirm} 
            isLoading={isLoading}
            className={variant === 'danger' ? 'bg-rose-600 hover:bg-rose-700 border-rose-600' : ''}
          >
            {confirmText}
          </Button>
        </Flex>
      </div>
    </Modal>
  )
}

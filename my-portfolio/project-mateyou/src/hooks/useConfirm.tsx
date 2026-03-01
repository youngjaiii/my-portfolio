import type { ConfirmModalProps } from '@/components/modals/ConfirmModal'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { ReactNode, createContext, useCallback, useContext, useState } from 'react'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary' | 'info'
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [modalProps, setModalProps] = useState<Partial<ConfirmModalProps>>({ isOpen: false })
  const [resolver, setResolver] = useState<((val: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setModalProps({
        ...options,
        isOpen: true,
      })
      setResolver(() => resolve)
    })
  }, [])

  const handleClose = useCallback(() => {
    setModalProps(prev => ({ ...prev, isOpen: false }))
    if (resolver) {
      resolver(false)
      setResolver(null)
    }
  }, [resolver])

  const handleConfirm = useCallback(() => {
    setModalProps(prev => ({ ...prev, isOpen: false }))
    if (resolver) {
      resolver(true)
      setResolver(null)
    }
  }, [resolver])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal
        {...(modalProps as ConfirmModalProps)}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context.confirm
}

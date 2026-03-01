// 전역 토스트 시스템
interface ToastData {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

type ToastListener = (toast: ToastData) => void

class GlobalToast {
  private listeners: Set<ToastListener> = new Set()
  private toasts: Map<string, ToastData> = new Map()

  subscribe(listener: ToastListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(toast: ToastData) {
    this.toasts.set(toast.id, toast)
    this.listeners.forEach((listener) => listener(toast))
  }

  private createToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    duration: number = 3000,
  ): ToastData {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    return {
      id,
      message,
      type,
      duration,
    }
  }

  addToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    duration: number = 3000,
  ) {
    const toast = this.createToast(message, type, duration)
    this.notify(toast)
    return toast.id
  }

  success(message: string, duration?: number) {
    return this.addToast(message, 'success', duration)
  }

  error(message: string, duration?: number) {
    return this.addToast(message, 'error', duration)
  }

  warning(message: string, duration?: number) {
    return this.addToast(message, 'warning', duration)
  }

  info(message: string, duration?: number) {
    return this.addToast(message, 'info', duration)
  }

  removeToast(id: string) {
    this.toasts.delete(id)
  }

  getToasts(): Array<ToastData> {
    return Array.from(this.toasts.values())
  }
}

// 전역 토스트 인스턴스
export const globalToast = new GlobalToast()

// toast 객체로도 export (편의를 위해)
export const toast = {
  success: (message: string, duration?: number) => globalToast.success(message, duration),
  error: (message: string, duration?: number) => globalToast.error(message, duration),
  warning: (message: string, duration?: number) => globalToast.warning(message, duration),
  info: (message: string, duration?: number) => globalToast.info(message, duration),
}

// window 객체에 등록 (선택적)
if (typeof window !== 'undefined') {
  ;(window as any).globalToast = globalToast
  ;(window as any).toast = toast
}


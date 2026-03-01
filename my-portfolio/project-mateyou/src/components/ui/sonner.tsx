"use client"

import type { CSSProperties } from 'react'

import { Button } from '@/components/ui/Button'
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'
import type { ToasterProps } from 'sonner'

export const toast = sonnerToast

const defaultToastStyle: CSSProperties = {
  backgroundColor: 'rgba(15, 15, 18, 0.8)',
  color: '#ffffff',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '18px',
  boxShadow: '0 25px 60px rgba(0,0,0,0.55)',
  backdropFilter: 'blur(20px)',
  padding: '18px 28px',
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
}

const defaultToastClassNames = {
  toast: 'translate-y-2 animate-in slide-in-from-bottom-full text-white',
  icon:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white text-base font-bold !border-0',
  content: 'flex-1 min-w-0 text-[15px] font-semibold leading-snug',
  description: 'text-white/80 text-[13px] mt-1 font-medium',
}

export function Toaster({ toastOptions, position = 'bottom-center', theme = 'dark', ...props }: ToasterProps) {
  const mergedToastOptions = {
    ...toastOptions,
    style: {
      ...defaultToastStyle,
      ...(toastOptions?.style ?? {}),
    },
    classNames: {
      ...defaultToastClassNames,
      ...(toastOptions?.classNames ?? {}),
    },
  }

  return (
    <SonnerToaster
      position={position}
      theme={theme}
      toastOptions={mergedToastOptions}
      className="!bottom-[100px]"
      offset={16}
      {...props}
    />
  )
}

export function SonnerTypes() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast('Event has been created')}>
        Default
      </Button>
      <Button variant="outline" onClick={() => toast.success('Event has been created')}>
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.info('Be at the area 10 minutes before the event time')}
      >
        Info
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.warning('Event start time cannot be earlier than 8am')}
      >
        Warning
      </Button>
      <Button variant="outline" onClick={() => toast.error('Event has not been created')}>
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          toast.promise<{ name: string }>(
            () =>
              new Promise((resolve) => {
                setTimeout(() => resolve({ name: 'Event' }), 2000)
              }),
            {
              loading: 'Loading...',
              success: (data) => `${data.name} has been created`,
              error: 'Error',
            },
          )
        }}
      >
        Promise
      </Button>
    </div>
  )
}


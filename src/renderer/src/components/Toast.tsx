import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'info' | 'success' | 'error'
interface ToastItem {
  id: string
  message: string
  kind: ToastKind
}
export interface StatusMessage {
  text: string
  kind: ToastKind
  time: number
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {})
const StatusContext = createContext<StatusMessage | null>(null)

export function useToast(): (message: string, kind?: ToastKind) => void {
  return useContext(ToastContext)
}

/** The most recent message, shown persistently in the status bar. */
export function useStatus(): StatusMessage | null {
  return useContext(StatusContext)
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [last, setLast] = useState<StatusMessage | null>(null)

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, message, kind }])
    setLast({ text: message, kind, time: Date.now() })
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      <StatusContext.Provider value={last}>
        {children}
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.message}
            </div>
          ))}
        </div>
      </StatusContext.Provider>
    </ToastContext.Provider>
  )
}

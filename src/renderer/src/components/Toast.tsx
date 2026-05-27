import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'info' | 'success' | 'error'
interface ToastItem {
  id: string
  message: string
  kind: ToastKind
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {})

export function useToast(): (message: string, kind?: ToastKind) => void {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

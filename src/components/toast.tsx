import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'ok' | 'error'
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([])
  const push = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, msg, kind }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

export function errorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  if (code.includes('permission-denied') || code.includes('unauthorized'))
    return 'Sin permiso: revisa que las reglas de Firebase estén desplegadas.'
  if (code.includes('unavailable')) return 'Sin conexión. Se guardará cuando vuelva la señal.'
  return (err as Error)?.message || 'Ocurrió un error inesperado.'
}

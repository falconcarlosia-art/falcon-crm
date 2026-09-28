import { useEffect, useState } from 'react'

/** Evento de Chrome/Android para mostrar el instalador cuando uno quiera. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

/** iPhone/iPad: no hay instalador automático, se instala desde Compartir de Safari. */
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sin service worker la app funciona igual, solo no se instala offline */
      })
    })
  }
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const standalone = isStandalone()
  return {
    /** Android/Chrome/Edge: se puede lanzar el instalador. */
    canPrompt: !standalone && deferred !== null,
    /** iPhone en Safari sin instalar: hay que mostrar los pasos. */
    iosManual: !standalone && isIOS(),
    async prompt() {
      if (!deferred) return false
      const e = deferred
      deferred = null
      await e.prompt()
      const { outcome } = await e.userChoice
      notify()
      return outcome === 'accepted'
    },
  }
}

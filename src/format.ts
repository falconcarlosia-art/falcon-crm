import type { Timestamp } from 'firebase/firestore'

const dateFmt = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' })

/** Fecha relativa corta: "hoy 10:32", "ayer", "hace 3 d", "12 set. 2026". */
export function relDate(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
  if (days <= 0) return `hoy ${timeFmt.format(d)}`
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} d`
  return dateFmt.format(d)
}

export function fullDate(ts: Timestamp | null | undefined): string {
  if (!ts) return 'guardando…'
  const d = ts.toDate()
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

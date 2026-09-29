import type { Timestamp } from 'firebase/firestore'

export const STAGES = [
  { id: 'nuevo', label: 'Nuevo', color: '#64748b' },
  { id: 'contactado', label: 'Contactado', color: '#0ea5e9' },
  { id: 'cotizado', label: 'Cotizado', color: '#f7941d' },
  { id: 'negociando', label: 'Negociando', color: '#a855f7' },
  { id: 'ganado', label: 'Ganado', color: '#16a34a' },
  { id: 'perdido', label: 'Perdido', color: '#dc2626' },
] as const

export type StageId = (typeof STAGES)[number]['id']

export function stageOf(id: string | undefined) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]
}

export interface Contact {
  id: string
  name: string
  /**
   * Solo dígitos con código de país (p. ej. 51931324454), listo para wa.me.
   * Vacío si el cliente llegó por Messenger y aún no dio su número.
   */
  phone: string
  /** Alias o enlace de Messenger/Facebook (opcional). */
  handle?: string
  stage: StageId
  tags: string[]
  notes: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  lastSentAt?: Timestamp | null
  /** Próximo seguimiento: el contacto aparece en "Hoy toca contactar" desde ese día. */
  followUpAt?: Timestamp | null
}

export interface Template {
  id: string
  name: string
  body: string
  createdAt?: Timestamp
}

/**
 * share = compartido desde el celular con archivos; chat = se abrió WhatsApp;
 * manual = sin WhatsApp: se descargaron los archivos o se copió el mensaje (Messenger).
 */
export type SendChannel = 'share' | 'chat' | 'manual'

export interface SendRecord {
  id: string
  channel: SendChannel
  message: string
  /** Cotización adjunta, si la hubo (los archivos no se guardan: se regeneran). */
  quoteId: string | null
  quoteNumber: string | null
  templateName: string | null
  sentAt?: Timestamp
}

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
  /** Solo dígitos con código de país (p. ej. 51931324454), listo para wa.me. */
  phone: string
  stage: StageId
  tags: string[]
  notes: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  lastSentAt?: Timestamp | null
  /** Próximo seguimiento: el contacto aparece en "Hoy toca contactar" desde ese día. */
  followUpAt?: Timestamp | null
}

export interface ImageItem {
  id: string
  name: string
  /** Imagen completa en files/{fileId} (Firestore). */
  fileId: string
  /** Miniatura JPEG pequeña (data URL) para listas y grillas. */
  thumb: string
  size: number
  contentType: string
  /** null = imagen de la biblioteca; si no, imagen subida para ese contacto. */
  contactId: string | null
  /** Enlace público (crm-falcons.web.app/v/xxxx) que se manda por WhatsApp. */
  shortUrl: string
  shortCode: string
  createdAt?: Timestamp
}

export interface Template {
  id: string
  name: string
  body: string
  createdAt?: Timestamp
}

export type SendChannel = 'share' | 'link'

export interface SendRecord {
  id: string
  channel: SendChannel
  message: string
  imageId: string | null
  imageName: string | null
  imageShortUrl: string | null
  templateName: string | null
  sentAt?: Timestamp
}

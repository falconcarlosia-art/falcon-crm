import { IconMessenger, IconWhatsApp } from './icons'
import { hasWhatsApp } from '../phone'
import type { Contact } from '../types'

/** Ícono del canal del contacto: WhatsApp si tiene número, Messenger si no. */
export function ReachIcon({ contact, size = 20 }: { contact: Contact; size?: number }) {
  return hasWhatsApp(contact) ? (
    <IconWhatsApp width={size} height={size} />
  ) : (
    <IconMessenger width={size} height={size} />
  )
}

/** Clase extra para el botón rápido: gris cuando no hay WhatsApp. */
export const reachClass = (contact: Contact) => (hasWhatsApp(contact) ? '' : ' reach-off')

export const reachLabel = (contact: Contact) =>
  hasWhatsApp(contact) ? `Enviar WhatsApp a ${contact.name}` : `Preparar envío para ${contact.name} (sin WhatsApp)`

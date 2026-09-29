export const DEFAULT_COUNTRY_CODE = '51'

/**
 * Deja el número como lo pide wa.me: solo dígitos, con código de país.
 * Un celular peruano (9 dígitos que empiezan en 9) recibe el 51 delante; si ya
 * trae código (+51 o cualquier otro) se respeta tal cual.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('00')) digits = digits.slice(2)
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00') && digits.length === 9 && digits.startsWith('9')) {
    digits = DEFAULT_COUNTRY_CODE + digits
  }
  return digits
}

export function isValidPhone(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15
}

/** 51931324454 -> +51 931 324 454 */
export function formatPhone(digits: string): string {
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length === 11) {
    const n = digits.slice(2)
    return `+51 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  }
  return digits ? `+${digits}` : ''
}

// ---- Alcance del contacto: WhatsApp o solo Messenger/Facebook ----

/** El contacto tiene un número válido para wa.me. */
export const hasWhatsApp = (c: { phone?: string }) => isValidPhone(c.phone ?? '')

/** Línea bajo el nombre: el número o, si no hay, el alias de Messenger. */
export function contactLine(c: { phone?: string; handle?: string }): string {
  if (hasWhatsApp(c)) return formatPhone(c.phone!)
  return c.handle?.trim() ? `Messenger: ${c.handle.trim()}` : 'Sin número'
}

/**
 * Enlace directo a Messenger si el alias es un usuario de Facebook
 * (@usuario, facebook.com/usuario o m.me/usuario). Un nombre con espacios no
 * sirve: se usa como referencia y se escribe desde la bandeja de la página.
 */
export function messengerLink(handle: string | undefined): string | null {
  const h = (handle ?? '').trim()
  const url = h.match(/(?:facebook\.com|fb\.com|m\.me|messenger\.com\/t)\/(?:profile\.php\?id=)?([A-Za-z0-9.]+)/i)
  const user = url ? url[1] : /^@?[A-Za-z0-9.]{5,}$/.test(h) ? h.replace(/^@/, '') : null
  return user ? `https://m.me/${user}` : null
}

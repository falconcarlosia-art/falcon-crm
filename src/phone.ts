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

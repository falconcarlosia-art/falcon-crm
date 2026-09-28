export function waLink(phone: string, message: string): string {
  const text = message.trim()
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export interface TemplateVars {
  name: string
  /** Número de cotización (2026-2809-1) si el envío es de una cotización. */
  number?: string | null
  /** Total formateado (S/ 160.00). */
  total?: string | null
}

/**
 * Rellena {nombre}, {nombre_completo}, {numero} y {total}. Las líneas que usan
 * un dato ausente (p. ej. {numero} en un mensaje sin cotización) se quitan en
 * vez de quedar con un hueco. {enlace} de plantillas antiguas ya no existe y
 * también se quita.
 */
export function fillTemplate(body: string, vars: TemplateVars): string {
  const firstName = vars.name.trim().split(/\s+/)[0] ?? ''
  const values: Record<string, string | null | undefined> = {
    nombre_completo: vars.name.trim(),
    nombre: firstName,
    numero: vars.number,
    total: vars.total,
    enlace: null,
  }
  return body
    .split('\n')
    .filter((line) => !Object.entries(values).some(([k, v]) => !v && line.includes(`{${k}}`)))
    .join('\n')
    .replace(/\{(nombre_completo|nombre|numero|total)\}/g, (_, k: string) => values[k] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Compartir archivos (Web Share API nivel 2): en la práctica, móviles. */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    const probe = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

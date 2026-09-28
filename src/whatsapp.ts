export function waLink(phone: string, message: string): string {
  const text = message.trim()
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/**
 * Rellena {nombre}, {nombre_completo} y {enlace}. Sin imagen, las líneas que
 * solo servían para el enlace desaparecen en vez de quedar con un hueco.
 */
export function fillTemplate(body: string, vars: { name: string; link: string | null }): string {
  const firstName = vars.name.trim().split(/\s+/)[0] ?? ''
  const lines = body.split('\n').filter((line) => vars.link || !line.includes('{enlace}'))
  return lines
    .join('\n')
    .replace(/\{nombre_completo\}/g, vars.name.trim())
    .replace(/\{nombre\}/g, firstName)
    .replace(/\{enlace\}/g, vars.link ?? '')
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

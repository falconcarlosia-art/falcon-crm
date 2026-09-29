// Íconos de línea para las hojas rasterizadas (cotización y portafolio).
const paths: Record<string, string> = {
  shield: 'M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3zM9 12l2 2 4-4',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.6-.6-2.1 2.5-2.5z',
  headset: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4zm16 0h-3v5h2a1 1 0 0 0 1-1v-4zM17 19c0 1.1-2.2 2-5 2',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  truck: 'M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18a1.5 1.5 0 1 0 0-.01M17 18a1.5 1.5 0 1 0 0-.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  home: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6',
  check: 'M20 6L9 17l-5-5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
}

export function SheetIcon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.check} />
    </svg>
  )
}

/** Elige el ícono de una frase de confianza por sus palabras. */
export function iconFor(text: string): string {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/garant/.test(t)) return 'shield'
  if (/instal|configur|montaj/.test(t)) return 'tool'
  if (/soporte|asesor|atencion|postventa/.test(t)) return 'headset'
  if (/pag|yape|tarjeta|transfer|cuota/.test(t)) return 'card'
  if (/envio|entrega|delivery|despacho/.test(t)) return 'truck'
  if (/rapid|24|hora|dia/.test(t)) return 'clock'
  if (/hogar|casa|proyecto|domotic/.test(t)) return 'home'
  return 'check'
}

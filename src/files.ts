// Archivos que se generan al momento (imagen y PDF de la cotización). No se
// guarda ninguno: de cada cotización solo quedan sus datos en Firestore.

export interface QuoteFiles {
  /** PDF con todas las páginas (cotización y, si está activo, portafolio). */
  pdf: File
  /** Una imagen por página: [cotización, portafolio?]. */
  images: File[]
  /** URL local de la página 1 para la vista previa (revocar al terminar). */
  previewUrl: string
}

/** Rasteriza el nodo de la hoja (QuoteSheet ya montado) a JPEG. */
export async function rasterize(node: HTMLElement): Promise<Blob> {
  const { toJpeg } = await import('html-to-image')
  await document.fonts.ready
  await Promise.all(
    Array.from(node.querySelectorAll('img')).map((img) => (img.complete ? null : img.decode().catch(() => null))),
  )
  const dataUrl = await toJpeg(node, { pixelRatio: 2, quality: 0.92, backgroundColor: '#ffffff', cacheBust: true })
  return (await fetch(dataUrl)).blob()
}

/** Arma el PDF y las imágenes. `portfolio` es la página 2 (opcional). */
export async function buildQuoteFiles(
  quoteJpg: Blob,
  portfolio: Blob | null,
  baseName: string,
  title: string,
): Promise<QuoteFiles> {
  const pages = portfolio ? [quoteJpg, portfolio] : [quoteJpg]
  const pdfBlob = await imagesToPdf(pages, title)
  return {
    pdf: new File([pdfBlob], `${baseName}.pdf`, { type: 'application/pdf' }),
    images: [
      new File([quoteJpg], `${baseName}.jpg`, { type: 'image/jpeg' }),
      ...(portfolio ? [new File([portfolio], `${baseName}_Portafolio.jpg`, { type: 'image/jpeg' })] : []),
    ],
    previewUrl: URL.createObjectURL(quoteJpg),
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** PDF con una página por imagen, cada una con su propio alto: se lee igual que la cotización. */
export async function imagesToPdf(blobs: Blob[], title: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const w = 210
  let pdf: InstanceType<typeof jsPDF> | null = null
  for (const blob of blobs) {
    const bmp = await createImageBitmap(blob)
    const h = (bmp.height / bmp.width) * w
    bmp.close?.()
    if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true })
    else pdf.addPage([w, h], 'portrait')
    pdf.addImage(await blobToDataUrl(blob), 'JPEG', 0, 0, w, h, undefined, 'FAST')
  }
  pdf!.setProperties({ title, author: 'Falcon Electronic del Perú' })
  return pdf!.output('blob')
}

/** Nombre de archivo sin tildes ni espacios: algunos navegadores descartan el nombre si trae caracteres raros. */
export const safeFileName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_|_$/g, '') || 'archivo'

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

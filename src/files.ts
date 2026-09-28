// Archivos que se generan al momento (imagen y PDF de la cotización). No se
// guarda ninguno: de cada cotización solo quedan sus datos en Firestore.

export interface QuoteFiles {
  jpg: File
  pdf: File
  /** URL local para la vista previa (revocar al terminar). */
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

export async function buildQuoteFiles(jpgBlob: Blob, baseName: string, title: string): Promise<QuoteFiles> {
  const pdfBlob = await imageToPdf(jpgBlob, title)
  return {
    jpg: new File([jpgBlob], `${baseName}.jpg`, { type: 'image/jpeg' }),
    pdf: new File([pdfBlob], `${baseName}.pdf`, { type: 'application/pdf' }),
    previewUrl: URL.createObjectURL(jpgBlob),
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

/** PDF de una página con el alto de la imagen: se lee igual que la cotización. */
export async function imageToPdf(blob: Blob, title: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const bmp = await createImageBitmap(blob)
  const w = 210
  const h = (bmp.height / bmp.width) * w
  bmp.close?.()
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true })
  pdf.addImage(await blobToDataUrl(blob), 'JPEG', 0, 0, w, h, undefined, 'FAST')
  pdf.setProperties({ title, author: 'Falcon Electronic del Perú' })
  return pdf.output('blob')
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
